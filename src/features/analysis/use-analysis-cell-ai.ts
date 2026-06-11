import { type UIMessage, useChat } from "@ai-sdk/react";
import { type ChatTransport, DirectChatTransport } from "ai";
import { nanoid } from "nanoid";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { canUseBridgeAi, createBridgeChatTransport } from "@/ai/bridge-chat";
import { createPondviewAgent } from "@/ai/client/agent";
import { createDelegatingChatTransport } from "@/ai/delegating-chat-transport";
import { toPromptErrorMessage } from "@/components/chat/hooks/chat-session-utils";
import {
  analysisCellEntryToUiMessage,
  parseStoredPayload,
} from "@/components/chat/notebook-cell-utils";
import {
  buildAiCellPrompt,
  buildAiCellUpdatePatch,
  getLatestAssistantText,
} from "@/features/analysis/ai-cell-message-utils";
import type { AnalysisCellState } from "@/features/analysis/analysis-reducer";
import { useConnectedTables } from "@/hooks/use-connected-tables";
import type { NotebookSession } from "@/hooks/use-notebook-session";
import {
  useBridgeRuntimeState,
  useSelectedSqlBackend,
} from "@/lib/sql/use-sql-backend";
import type { WorkspaceAnalysisCellEntry } from "@/lib/workspace/workspace-db";

type UseAnalysisCellAiParams = {
  cell: AnalysisCellState;
  entries: WorkspaceAnalysisCellEntry[];
  notebookSession: Pick<
    NotebookSession,
    "appendCellEntry" | "refreshUpdatedAt" | "updateCell"
  >;
};

const MISSING_AI_CONFIGURATION_MESSAGE =
  "Missing AI configuration. Open Settings and configure provider, API key, and model.";

type BridgeAiAvailability = "checking" | "available" | "unavailable";

export function useAnalysisCellAi({
  cell,
  entries,
  notebookSession,
}: UseAnalysisCellAiParams) {
  const connectedTables = useConnectedTables();
  const [promptDraft, setPromptDraft] = useState(cell.promptText);
  const [promptError, setPromptError] = useState<string | null>(null);
  const [bridgeAiAvailability, setBridgeAiAvailability] =
    useState<BridgeAiAvailability>("checking");
  const bridgeRuntimeState = useBridgeRuntimeState();
  const selectedSqlBackend = useSelectedSqlBackend();
  const shouldUseBridgeRuntime =
    selectedSqlBackend === "bridge" || bridgeRuntimeState.isQueryReady;
  const persistedMessages = useMemo(
    () => entries.map(analysisCellEntryToUiMessage),
    [entries],
  );
  const persistedAssistantMessageIdsRef = useRef<Set<string>>(new Set());
  const hydratedCellIdRef = useRef<string | null>(
    persistedMessages.length > 0 ? cell.id : null,
  );
  const agentResult = useMemo(() => {
    try {
      return {
        agent: createPondviewAgent(connectedTables),
        error: null,
      };
    } catch (error) {
      return {
        agent: null,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to initialize the AI agent."),
      };
    }
  }, [connectedTables]);
  const selectedTransport = useMemo<ChatTransport<UIMessage> | null>(() => {
    if (shouldUseBridgeRuntime) {
      if (bridgeAiAvailability === "available") {
        return createBridgeChatTransport(connectedTables, "analysis");
      }
    }

    if (!agentResult.agent) {
      return null;
    }

    return new DirectChatTransport({
      agent: agentResult.agent,
      sendReasoning: false,
      sendSources: false,
    }) as unknown as ChatTransport<UIMessage>;
  }, [
    agentResult.agent,
    bridgeAiAvailability,
    connectedTables,
    shouldUseBridgeRuntime,
  ]);
  const selectedTransportRef = useRef<ChatTransport<UIMessage> | null>(null);
  selectedTransportRef.current = selectedTransport;
  const chatTransport = useMemo(
    () =>
      createDelegatingChatTransport(
        () => selectedTransportRef.current,
        () => MISSING_AI_CONFIGURATION_MESSAGE,
      ),
    [],
  );

  useEffect(() => {
    if (!shouldUseBridgeRuntime) {
      setBridgeAiAvailability("unavailable");
      return;
    }

    let cancelled = false;
    setBridgeAiAvailability("checking");
    void canUseBridgeAi().then((available) => {
      if (!cancelled) {
        setBridgeAiAvailability(available ? "available" : "unavailable");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [shouldUseBridgeRuntime]);

  useEffect(() => {
    if (
      bridgeAiAvailability === "available" &&
      promptError === MISSING_AI_CONFIGURATION_MESSAGE
    ) {
      setPromptError(null);
      if (cell.status === "error") {
        void notebookSession
          .updateCell(cell.id, { status: "idle" })
          .then(() => notebookSession.refreshUpdatedAt())
          .catch((error) => {
            console.error(
              "Failed to clear stale AI configuration error:",
              error,
            );
          });
      }
    }
  }, [
    bridgeAiAvailability,
    cell.id,
    cell.status,
    notebookSession,
    promptError,
  ]);

  const { messages, setMessages, sendMessage, status } = useChat<UIMessage>({
    id: `analysis-cell:${cell.id}`,
    messages: persistedMessages,
    transport: chatTransport,
    experimental_throttle: 50,
    onError: (error) => {
      setPromptError(toPromptErrorMessage(error));
      void notebookSession
        .updateCell(cell.id, { status: "error" })
        .then(() => notebookSession.refreshUpdatedAt())
        .catch((updateError) => {
          console.error(
            "Failed to update analysis cell after AI error:",
            updateError,
          );
        });
    },
    onFinish: ({ message, isAbort, isError }) => {
      if (isAbort || isError || message.role !== "assistant") {
        return;
      }

      const createdAt = Date.now();
      const partsJson = JSON.stringify(message.parts ?? []);
      const nextPatch = buildAiCellUpdatePatch({
        message,
        createdAt,
        selectedDbIdentifier: cell.selectedDbIdentifier,
        selectedCatalogContext: cell.selectedCatalogContext,
      });
      const shouldPersistEntry = !persistedAssistantMessageIdsRef.current.has(
        message.id,
      );

      if (shouldPersistEntry) {
        persistedAssistantMessageIdsRef.current.add(message.id);
      }

      const persistEntryPromise = shouldPersistEntry
        ? notebookSession.appendCellEntry({
            cellId: cell.id,
            role: "assistant",
            partsJson,
            createdAt,
            id: message.id,
          })
        : Promise.resolve();

      void persistEntryPromise
        .then(() => notebookSession.updateCell(cell.id, nextPatch))
        .then(() => notebookSession.refreshUpdatedAt())
        .catch((error) => {
          console.error(
            "Failed to persist analysis cell assistant message:",
            error,
          );
        });
    },
  });
  const submitPromptStateRef = useRef({
    agentError: agentResult.error,
    cell,
    notebookSession,
    promptDraft,
    sendMessage,
    setMessages,
  });
  submitPromptStateRef.current = {
    agentError: agentResult.error,
    cell,
    notebookSession,
    promptDraft,
    sendMessage,
    setMessages,
  };

  useEffect(() => {
    setPromptDraft(cell.promptText);
  }, [cell.promptText]);

  useEffect(() => {
    for (const message of persistedMessages) {
      if (message.role === "assistant") {
        persistedAssistantMessageIdsRef.current.add(message.id);
      }
    }
  }, [persistedMessages]);

  useEffect(() => {
    if (agentResult.error) {
      setPromptError(toPromptErrorMessage(agentResult.error));
    }
  }, [agentResult.error]);

  useEffect(() => {
    if (hydratedCellIdRef.current === cell.id) {
      return;
    }

    setMessages(persistedMessages);
    hydratedCellIdRef.current = cell.id;
  }, [cell.id, persistedMessages, setMessages]);

  useEffect(() => {
    if (promptDraft === cell.promptText) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void notebookSession.updateCell(cell.id, {
        promptText: promptDraft,
      });
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [cell.id, cell.promptText, notebookSession, promptDraft]);

  const latestAssistantText = useMemo(
    () => getLatestAssistantText(messages),
    [messages],
  );
  const transcriptMessages = useMemo(() => {
    const persistedTranscriptMessages = persistedMessages.filter(
      (message) => message.role === "assistant" || message.role === "user",
    );
    const persistedIds = new Set(
      persistedTranscriptMessages.map((message) => message.id),
    );
    const liveAssistantMessages = messages.filter(
      (message) =>
        message.role === "assistant" && !persistedIds.has(message.id),
    );

    return [...persistedTranscriptMessages, ...liveAssistantMessages];
  }, [messages, persistedMessages]);

  const submitPrompt = useCallback(async (promptOverride?: string) => {
    const {
      agentError,
      cell,
      notebookSession,
      promptDraft,
      sendMessage,
      setMessages,
    } = submitPromptStateRef.current;
    const rawPrompt = (promptOverride ?? promptDraft).trim();
    if (!rawPrompt) {
      return;
    }

    if (!selectedTransportRef.current) {
      setPromptError(
        agentError
          ? toPromptErrorMessage(agentError)
          : MISSING_AI_CONFIGURATION_MESSAGE,
      );
      return;
    }

    setPromptError(null);

    const messageId = nanoid();
    const createdAt = Date.now();
    const userMessage: UIMessage = {
      id: messageId,
      role: "user",
      parts: [{ type: "text", text: rawPrompt }],
    };

    const promptWithContext = buildAiCellPrompt({
      prompt: rawPrompt,
      sqlDraft: cell.sqlDraft,
      selectedDbIdentifier: cell.selectedDbIdentifier,
      selectedCatalogContext: cell.selectedCatalogContext,
      resultPayload: parseStoredPayload(cell.resultPayloadJson),
    });

    try {
      setMessages((previous) => {
        if (previous.some((message) => message.id === messageId)) {
          return previous;
        }

        return [...previous, userMessage];
      });
      setPromptDraft("");

      await notebookSession.appendCellEntry({
        cellId: cell.id,
        role: "user",
        partsJson: JSON.stringify(userMessage.parts),
        createdAt,
        id: messageId,
      });
      await notebookSession.updateCell(cell.id, {
        promptText: "",
        status: "running",
      });
      await notebookSession.refreshUpdatedAt();
      await sendMessage({
        text: promptWithContext,
        messageId,
      });
    } catch (error) {
      const promptMessage =
        error instanceof Error
          ? toPromptErrorMessage(error)
          : "Failed to send the AI prompt.";
      setPromptError(promptMessage);
      setMessages((previous) =>
        previous.filter((message) => message.id !== messageId),
      );
      setPromptDraft(rawPrompt);
      await notebookSession.updateCell(cell.id, { status: "error" });
      await notebookSession.refreshUpdatedAt();
    }
  }, []);

  const isAssistantThinking = status === "submitted" || status === "streaming";

  return useMemo(
    () => ({
      promptDraft,
      setPromptDraft,
      promptError,
      latestAssistantText,
      transcriptMessages,
      isAssistantThinking,
      submitPrompt,
    }),
    [
      isAssistantThinking,
      latestAssistantText,
      promptDraft,
      promptError,
      submitPrompt,
      transcriptMessages,
    ],
  );
}
