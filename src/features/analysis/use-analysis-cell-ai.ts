import { type UIMessage, useChat } from "@ai-sdk/react";
import { type ChatTransport, DirectChatTransport } from "ai";
import { nanoid } from "nanoid";
import { useEffect, useMemo, useRef, useState } from "react";
import { canUseBridgeAi, createBridgeChatTransport } from "@/ai/bridge-chat";
import { createPondviewAgent } from "@/ai/client/agent";
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
import type { WorkspaceAnalysisCellEntry } from "@/lib/workspace/workspace-db";

type UseAnalysisCellAiParams = {
  cell: AnalysisCellState;
  entries: WorkspaceAnalysisCellEntry[];
  notebookSession: Pick<
    NotebookSession,
    "appendCellEntry" | "refreshUpdatedAt" | "updateCell"
  >;
};

export function useAnalysisCellAi({
  cell,
  entries,
  notebookSession,
}: UseAnalysisCellAiParams) {
  const connectedTables = useConnectedTables();
  const [promptDraft, setPromptDraft] = useState(cell.promptText);
  const [promptError, setPromptError] = useState<string | null>(null);
  const [useBridgeAi, setUseBridgeAi] = useState(false);
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
  const directTransport = useMemo<ChatTransport<UIMessage> | null>(() => {
    if (useBridgeAi) {
      return createBridgeChatTransport(connectedTables, "analysis");
    }

    if (!agentResult.agent) {
      return null;
    }

    return new DirectChatTransport({
      agent: agentResult.agent,
      sendReasoning: false,
      sendSources: false,
    }) as unknown as ChatTransport<UIMessage>;
  }, [agentResult.agent, connectedTables, useBridgeAi]);

  useEffect(() => {
    let cancelled = false;
    void canUseBridgeAi().then((available) => {
      if (!cancelled) {
        setUseBridgeAi(available);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const { messages, setMessages, sendMessage, status } = useChat<UIMessage>({
    id: `analysis-cell:${cell.id}`,
    messages: persistedMessages,
    transport: directTransport ?? undefined,
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
      if (persistedAssistantMessageIdsRef.current.has(message.id)) {
        return;
      }
      persistedAssistantMessageIdsRef.current.add(message.id);

      const createdAt = Date.now();
      const partsJson = JSON.stringify(message.parts ?? []);
      const nextPatch = buildAiCellUpdatePatch({
        message,
        createdAt,
        selectedDbIdentifier: cell.selectedDbIdentifier,
        selectedCatalogContext: cell.selectedCatalogContext,
      });

      void notebookSession
        .appendCellEntry({
          cellId: cell.id,
          role: "assistant",
          partsJson,
          createdAt,
          id: message.id,
        })
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

  async function submitPrompt(promptOverride?: string) {
    const rawPrompt = (promptOverride ?? promptDraft).trim();
    if (!rawPrompt) {
      return;
    }

    if (!directTransport) {
      setPromptError(
        "Missing AI configuration. Open Settings and configure provider, API key, and model.",
      );
      return;
    }

    setPromptError(null);

    const messageId = nanoid();
    const createdAt = Date.now();

    await notebookSession.appendCellEntry({
      cellId: cell.id,
      role: "user",
      partsJson: JSON.stringify([{ type: "text", text: rawPrompt }]),
      createdAt,
      id: messageId,
    });

    setMessages((previous) => {
      if (previous.some((message) => message.id === messageId)) {
        return previous;
      }

      return [
        ...previous,
        {
          id: messageId,
          role: "user",
          parts: [{ type: "text", text: rawPrompt }],
        },
      ];
    });

    await notebookSession.updateCell(cell.id, {
      promptText: "",
      status: "running",
    });
    await notebookSession.refreshUpdatedAt();
    setPromptDraft("");

    const promptWithContext = buildAiCellPrompt({
      prompt: rawPrompt,
      sqlDraft: cell.sqlDraft,
      selectedDbIdentifier: cell.selectedDbIdentifier,
      selectedCatalogContext: cell.selectedCatalogContext,
      resultPayload: parseStoredPayload(cell.resultPayloadJson),
    });

    try {
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
      await notebookSession.updateCell(cell.id, { status: "error" });
      await notebookSession.refreshUpdatedAt();
    }
  }

  return {
    promptDraft,
    setPromptDraft,
    promptError,
    latestAssistantText,
    transcriptMessages,
    isAssistantThinking: status === "submitted" || status === "streaming",
    submitPrompt,
  };
}
