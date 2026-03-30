import { type UIMessage, useChat } from "@ai-sdk/react";
import { type ChatTransport, DirectChatTransport } from "ai";
import { AlertTriangle, Pencil } from "lucide-react";
import { nanoid } from "nanoid";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPondviewAgent } from "@/ai/client/agent";
import { getSelectedAiProviderDisplayName } from "@/ai/gateway-model";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import { ArtifactMutationProvider } from "@/components/artifact-mutation-context";
import { ChatMessageThread } from "@/components/chat/chat-message-thread";
import { useChatUrlParams } from "@/components/chat/hooks/use-chat-url-params";
import { useRightPanelResize } from "@/components/chat/hooks/use-right-panel-resize";
import {
  useVisualizationSelection,
  type VisualizationEntry,
} from "@/components/chat/hooks/use-visualization-selection";
import { ConnectedDataPanel } from "@/components/connected-data-panel";
import { DashboardBuilderPanel } from "@/components/dashboard-builder-panel";
import {
  type ManualShellVariant,
  PromptInputWrapper,
  type PromptMode,
} from "@/components/prompt-input-wrapper";
import type { SqlAnalysisData } from "@/components/sql-analysis-display.types";
import type { SqlConsoleApi } from "@/components/sql-console";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { VisualizationPanel } from "@/components/visualization-panel";
import { useConnectedTables } from "@/hooks/use-connected-tables";
import {
  getRandomVerbAiIsThinking,
  showRandomAnimation,
} from "@/lib/animations";
import {
  useExecuteSqlRawOutputPreference,
  useShowToolCallsPreference,
} from "@/lib/chat-display-preferences";
import { buildDashboardSourceDescriptor } from "@/lib/dashboard/source-descriptor";
import { getDefaultPromptModePreference } from "@/lib/default-prompt-mode";
import type { ExplorerInsertPayload } from "@/lib/duckdb/table-reference";
import {
  DEFAULT_WASM_DB_IDENTIFIER,
  resolveDbIdentifierForSqlBackend,
  type SqlBackend,
} from "@/lib/sql/sql-runtime";
import { useResolvedSqlBackend } from "@/lib/sql/use-sql-backend";
import type { CardConfig, Config, Result } from "@/lib/types";
import { useIsMobile, useIsLg } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import {
  appendAssistantMessage,
  appendUserMessageTx,
  type DbMessageRow,
  deleteMessageFromChat,
  ensureChat,
  getChatTitleById,
  listMessagesByChatId,
  updateChatTitle,
} from "@/lib/workspace/chat-repo";
import {
  deleteSavedSqlQuery,
  deriveSavedSqlQueryName,
  listSavedSqlQueries,
  renameSavedSqlQuery,
  type SavedSqlQuery,
  saveSqlQuery,
} from "@/lib/workspace/saved-sql-queries-repo";
import Link from "@/vite/next-link";
import { useRouter, useSearchParams } from "@/vite/next-navigation";

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function parsePartsOrFallback(
  partsJson: string | null | undefined,
  content: string,
): UIMessage["parts"] {
  const parsed = partsJson ? safeJsonParse(partsJson) : undefined;

  if (Array.isArray(parsed) && parsed.length > 0) {
    return parsed as UIMessage["parts"];
  }

  if (parsed && typeof parsed === "object") {
    const maybeParts = (parsed as { parts?: unknown }).parts;
    if (Array.isArray(maybeParts) && maybeParts.length > 0) {
      return maybeParts as UIMessage["parts"];
    }
  }

  return [{ type: "text", text: content }] as UIMessage["parts"];
}

function toUiMessages(rows: DbMessageRow[]): UIMessage[] {
  return rows.map((row) => ({
    id: row.id,
    role: row.role as UIMessage["role"],
    parts: parsePartsOrFallback(row.parts, row.content),
  }));
}

function deriveTitleFromInput(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  return trimmed.length > 20 ? `${trimmed.slice(0, 20)}...` : trimmed;
}

function toPromptErrorMessage(error: Error): string {
  const message = error.message?.trim() || "Unknown AI chat error.";
  const normalized = message.toLowerCase();
  const providerName = getSelectedAiProviderDisplayName();

  if (normalized.includes("missing ")) {
    return "Missing AI configuration. Open Settings and configure provider, API key, and model.";
  }

  if (
    normalized.includes("header ‘user-agent’ is not allowed") ||
    normalized.includes("header 'user-agent' is not allowed") ||
    (normalized.includes("cors") && normalized.includes("user-agent"))
  ) {
    return "Browser request blocked by CORS (user-agent header). Refresh and retry; if it persists, update to the latest app build.";
  }

  if (
    normalized.includes("networkerror when attempting to fetch resource") ||
    normalized.includes("failed to fetch") ||
    normalized.includes("load failed") ||
    normalized.includes("network request failed")
  ) {
    return `Cannot reach ${providerName} from browser. Check network, ad blocker/proxy, and provider settings.`;
  }

  if (normalized.includes("authentication")) {
    return `${providerName} authentication failed. Verify provider API settings in Settings.`;
  }

  if (normalized.includes("gateway request failed")) {
    return `${providerName} request failed. Check network access and provider settings.`;
  }

  return message;
}

const EMPTY_INITIAL_MESSAGES: UIMessage[] = [];
const MANUAL_REPL_VISUALIZATION_ID = "manual-repl";
const CHAT_MANUAL_SHELL_VARIANT: ManualShellVariant = "minimal";

export default function Chat({
  chatId,
  initialMessages,
}: {
  chatId: string;
  initialMessages?: UIMessage[];
}) {
  const resolvedInitialMessages = initialMessages ?? EMPTY_INITIAL_MESSAGES;
  const router = useRouter();
  const searchParams = useSearchParams();
  const connectedTables = useConnectedTables();
  const effectiveSqlBackend = useResolvedSqlBackend();
  const [promptMode, setPromptMode] = useState<PromptMode>(() =>
    getDefaultPromptModePreference(),
  );
  const [promptError, setPromptError] = useState<string | null>(null);
  const [chatTitle, setChatTitle] = useState<string | null>(null);
  const [isEditingChatTitle, setIsEditingChatTitle] = useState(false);
  const [chatTitleDraft, setChatTitleDraft] = useState("");
  const chatTitleInputRef = useRef<HTMLInputElement | null>(null);
  const skipNextTitleBlurSaveRef = useRef(false);
  const hydratedChatIdRef = useRef<string | null>(
    resolvedInitialMessages.length > 0 ? chatId : null,
  );

  const agent = useMemo(() => {
    try {
      return createPondviewAgent(connectedTables);
    } catch (error) {
      console.error("Failed to initialize AI agent:", error);
      setPromptError(
        error instanceof Error
          ? toPromptErrorMessage(error)
          : "Missing AI configuration. Open Settings and configure provider, API key, and model.",
      );
      return null;
    }
  }, [connectedTables]);
  const directTransport = useMemo<ChatTransport<UIMessage> | null>(() => {
    if (!agent) {
      return null;
    }

    return new DirectChatTransport({
      agent,
      sendReasoning: false,
      sendSources: false,
    }) as unknown as ChatTransport<UIMessage>;
  }, [agent]);

  const { messages, setMessages, sendMessage, status } = useChat<UIMessage>({
    id: chatId,
    messages: resolvedInitialMessages,
    transport: directTransport ?? undefined,
    onError: (error) => {
      console.error("AI chat error:", error);
      setPromptError(toPromptErrorMessage(error));
    },
    onFinish: ({ message, isAbort, isError }) => {
      if (isAbort || isError || message.role !== "assistant") {
        return;
      }

      const textPart = Array.isArray(message.parts)
        ? message.parts.find((part) => part.type === "text")
        : undefined;
      const text =
        textPart && "text" in textPart && typeof textPart.text === "string"
          ? textPart.text
          : "";

      void appendAssistantMessage(
        chatId,
        message.id || nanoid(),
        text,
        JSON.stringify(message.parts ?? [{ type: "text", text }]),
      );
    },
  });

  const [selectedDb, setSelectedDb] = useState<string | undefined>();
  const [selectedCatalogContext, setSelectedCatalogContext] = useState<
    string | null
  >(null);
  const isMobile = useIsMobile();
  const isLgScreen = useIsLg();
  const [isExplorerCollapsed, setIsExplorerCollapsed] = useState(true);
  const [sqlConsoleApi, setSqlConsoleApi] = useState<SqlConsoleApi | null>(
    null,
  );
  const [sqlResult, setSqlResult] = useState<{
    sql: string;
    rows: Record<string, unknown>[];
    columns: { name: string; type?: string }[];
    durationMs: number;
    backend?: SqlBackend;
    dbIdentifier?: string;
    catalogContext?: string | null;
    sourceDescriptor?: SqlAnalysisData["sourceDescriptor"];
  } | null>(null);
  const [explorerRefreshToken, setExplorerRefreshToken] = useState(0);
  const [storedSqlQueries, setStoredSqlQueries] = useState<SavedSqlQuery[]>([]);
  const [isSavingStoredSqlQuery, setIsSavingStoredSqlQuery] = useState(false);
  const [pendingSqlToLoad, setPendingSqlToLoad] = useState<string | null>(null);
  const [pendingSqlShouldAutoRun, setPendingSqlShouldAutoRun] = useState(false);
  const [manualChartConfig, setManualChartConfig] = useState<Config | null>(
    null,
  );
  const [manualCardConfig, setManualCardConfig] = useState<CardConfig | null>(
    null,
  );
  const [manualVisualType, setManualVisualType] = useState<
    "table" | "chart" | "card" | null
  >(null);
  const prevSqlRef = useRef<string | null>(null);
  const [isDashboardBuilderOpen, setIsDashboardBuilderOpen] = useState(false);
  const executeSqlArtifactType = "data-execute-sql";
  const [animationFrame, setAnimationFrame] = useState("");
  const [verbAiIsThinking, setVerbAiIsThinking] = useState("is thinking");
  const showToolCalls = useShowToolCallsPreference();
  const showExecuteSqlRawOutput = useExecuteSqlRawOutputPreference();
  const {
    rightPanelWidth,
    isResizing,
    resizeHandleRef,
    containerRef,
    handleResizeStart,
  } = useRightPanelResize();

  const handleManualVisualizationConfigChange = useCallback(
    (config: { chartConfig?: Config; cardConfig?: CardConfig }) => {
      if ("chartConfig" in config) {
        setManualChartConfig(config.chartConfig ?? null);
      }
      if ("cardConfig" in config) {
        setManualCardConfig(config.cardConfig ?? null);
      }
    },
    [],
  );

  const handleManualVisualizationTypeChange = useCallback(
    (visualType: "table" | "chart" | "card") => {
      setManualVisualType(visualType);
    },
    [],
  );

  const manualVisualization = useMemo<VisualizationEntry[]>(() => {
    if (!sqlResult) {
      return [];
    }

    const isCardMode =
      sqlResult.rows.length === 1 && sqlResult.columns.length === 1;
    const visualType =
      manualVisualType ??
      (isCardMode ? "card" : manualChartConfig ? "chart" : "table");

    return [
      {
        id: MANUAL_REPL_VISUALIZATION_ID,
        data: {
          stage: "complete",
          progress: 1,
          query: sqlResult.sql,
          dbIdentifier: sqlResult.dbIdentifier,
          catalogContext: sqlResult.catalogContext ?? selectedCatalogContext,
          sqlBackend: sqlResult.backend,
          sourceDescriptor:
            sqlResult.sourceDescriptor ??
            (sqlResult.backend
              ? buildDashboardSourceDescriptor({
                  runtimeBackend: sqlResult.backend,
                  dbIdentifier: sqlResult.dbIdentifier,
                  catalogContext:
                    sqlResult.catalogContext ?? selectedCatalogContext ?? null,
                })
              : null),
          executionTime: sqlResult.durationMs,
          rowCount: sqlResult.rows.length,
          columns: sqlResult.columns,
          rows: sqlResult.rows as Result[],
          visualType,
          chartConfig: manualChartConfig ?? undefined,
          cardConfig: manualCardConfig ?? undefined,
          summary: {
            totalRows: sqlResult.rows.length,
            executionTimeMs: sqlResult.durationMs,
            insights: [],
          },
        },
        stage: "complete",
        progress: 1,
        canAddToChat: false,
        onConfigChange: handleManualVisualizationConfigChange,
        onVisualTypeChange: handleManualVisualizationTypeChange,
        source: "manual-repl",
      },
    ];
  }, [
    handleManualVisualizationConfigChange,
    handleManualVisualizationTypeChange,
    manualCardConfig,
    manualChartConfig,
    manualVisualType,
    selectedCatalogContext,
    sqlResult,
  ]);

  const {
    visualizations,
    activeVisualizationId,
    handleSelectVisualization,
    getLastSelectableVisualizationIdForMessage,
  } = useVisualizationSelection({
    messages,
    executeSqlArtifactType,
    supplementalVisualizations: manualVisualization,
  });

  useEffect(() => {
    let cancelled = false;

    const loadChatTitle = async () => {
      try {
        const title = await getChatTitleById(chatId);
        if (!cancelled) {
          setChatTitle(title);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load chat title:", error);
        }
      }
    };

    void loadChatTitle();

    return () => {
      cancelled = true;
    };
  }, [chatId]);

  useEffect(() => {
    if (!isEditingChatTitle) {
      return;
    }
    chatTitleInputRef.current?.focus();
    chatTitleInputRef.current?.select();
  }, [isEditingChatTitle]);

  useEffect(() => {
    let cancelled = false;

    const loadSavedQueries = async () => {
      try {
        const rows = await listSavedSqlQueries();
        if (!cancelled) {
          setStoredSqlQueries(rows);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load saved SQL queries:", error);
        }
      }
    };

    void loadSavedQueries();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedDb && connectedTables.length > 0) {
      const first = connectedTables[0];
      const firstIdentifier =
        first?.connectionId ??
        first?.databasePath ??
        first?.attachAs ??
        DEFAULT_WASM_DB_IDENTIFIER;
      setSelectedDb(firstIdentifier);
    }
  }, [connectedTables, selectedDb]);

  useEffect(() => {
    if (hydratedChatIdRef.current === chatId) {
      return;
    }

    if (resolvedInitialMessages.length > 0) {
      setMessages(resolvedInitialMessages);
      hydratedChatIdRef.current = chatId;
      return;
    }

    let cancelled = false;

    const loadMessages = async () => {
      try {
        const rows = await listMessagesByChatId(chatId);
        if (!cancelled) {
          setMessages(toUiMessages(rows));
          hydratedChatIdRef.current = chatId;
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load chat messages:", error);
        }
      }
    };

    void loadMessages();

    return () => {
      cancelled = true;
    };
  }, [chatId, resolvedInitialMessages, setMessages]);

  const handleOpenDashboardBuilder = () => {
    setIsDashboardBuilderOpen(true);
  };

  const handleInsertTableIntoSql = (payload: ExplorerInsertPayload) => {
    if (!sqlConsoleApi) return;
    const current = sqlConsoleApi.getQuery() ?? "";
    const lastChar = current.length > 0 ? current[current.length - 1] : "";
    const needsSpace = current.length > 0 && !/\s/.test(lastChar);
    sqlConsoleApi.insertText(`${needsSpace ? " " : ""}${payload.reference}`);
    sqlConsoleApi.focus();
    if (payload.dbIdentifier) {
      setSelectedDb(payload.dbIdentifier);
    }
    setSelectedCatalogContext(payload.catalogContext ?? null);
  };

  const submitAiPrompt = useCallback(
    async (message: PromptInputMessage) => {
      const text = message.text?.trim() ?? "";
      const files = message.files;

      if (!text && (!files || files.length === 0)) {
        return;
      }

      if (!directTransport) {
        setPromptError(
          "Missing AI configuration. Open Settings and configure provider, API key, and model.",
        );
        return;
      }

      setPromptError(null);

      const now = Date.now();
      const messageId = nanoid();
      const userParts: UIMessage["parts"] = [];

      if (text) {
        userParts.push({ type: "text", text });
      }

      if (files && files.length > 0) {
        userParts.push(...(files as unknown as UIMessage["parts"][number][]));
      }

      const persistedContent =
        text || files?.[0]?.filename || "Attachment message";

      await appendUserMessageTx({
        chatId,
        messageId,
        content: persistedContent,
        partsJson: JSON.stringify(userParts),
        titleForNewChat: deriveTitleFromInput(text),
        now,
      });
      const inferredTitle = deriveTitleFromInput(text);
      if (inferredTitle) {
        setChatTitle((previous) => previous || inferredTitle);
      }

      // `sendMessage({ messageId })` expects the user message to already exist in local chat state.
      setMessages((previous) => {
        if (previous.some((message) => message.id === messageId)) {
          return previous;
        }

        const nextMessage: UIMessage = {
          id: messageId,
          role: "user",
          parts: userParts,
        };
        return [...previous, nextMessage];
      });

      if (text) {
        await sendMessage({ text, files, messageId });
        return;
      }

      await sendMessage({
        files: files ?? [],
        messageId,
      });
    },
    [chatId, directTransport, sendMessage, setMessages],
  );

  const handlePromptSubmit = useCallback(
    (message: PromptInputMessage) => {
      void submitAiPrompt(message);
    },
    [submitAiPrompt],
  );

  useEffect(() => {
    if (!pendingSqlToLoad || !sqlConsoleApi) {
      return;
    }

    const sqlToLoad = pendingSqlToLoad;
    const shouldAutoRun = pendingSqlShouldAutoRun;

    setPendingSqlToLoad(null);
    setPendingSqlShouldAutoRun(false);

    sqlConsoleApi.clearResults();
    sqlConsoleApi.setQuery(sqlToLoad);
    sqlConsoleApi.focus();

    if (shouldAutoRun && typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        sqlConsoleApi.runQuery();
      });
    }
  }, [pendingSqlShouldAutoRun, pendingSqlToLoad, sqlConsoleApi]);

  const handleSaveStoredSqlQuery = useCallback(
    async (sqlOverride?: string) => {
      if (isSavingStoredSqlQuery) {
        return;
      }

      const sql = (sqlOverride ?? sqlConsoleApi?.getQuery() ?? "").trim();
      if (!sql) {
        return;
      }

      const suggestedName = deriveSavedSqlQueryName(sql);
      const requestedName =
        typeof window !== "undefined"
          ? window.prompt("Name this SQL query:", suggestedName)
          : suggestedName;
      if (requestedName === null) {
        return;
      }

      const normalizedName = requestedName.trim();
      if (!normalizedName) {
        return;
      }

      const duplicateByName = storedSqlQueries.find(
        (entry) =>
          entry.name.trim().toLowerCase() === normalizedName.toLowerCase(),
      );
      if (duplicateByName && typeof window !== "undefined") {
        const shouldReplace = window.confirm(
          `A saved query named "${normalizedName}" already exists. Replace it?`,
        );
        if (!shouldReplace) {
          return;
        }
      }

      setIsSavingStoredSqlQuery(true);
      try {
        const rows = await saveSqlQuery({
          sql,
          name: normalizedName,
        });
        setStoredSqlQueries(rows);
      } catch (error) {
        console.error("Failed to save SQL query:", error);
      } finally {
        setIsSavingStoredSqlQuery(false);
      }
    },
    [isSavingStoredSqlQuery, sqlConsoleApi, storedSqlQueries],
  );

  const handleSelectStoredSqlQuery = useCallback(
    (queryId: string) => {
      const selected = storedSqlQueries.find((entry) => entry.id === queryId);
      if (!selected) {
        return;
      }

      if (promptMode !== "manual") {
        setPendingSqlToLoad(selected.sql);
        setPromptMode("manual");
        return;
      }

      if (!sqlConsoleApi) {
        setPendingSqlToLoad(selected.sql);
        return;
      }

      sqlConsoleApi.setQuery(selected.sql);
      sqlConsoleApi.focus();
    },
    [promptMode, sqlConsoleApi, storedSqlQueries],
  );

  const handleDeleteStoredSqlQuery = useCallback(async (queryId: string) => {
    try {
      const rows = await deleteSavedSqlQuery(queryId);
      setStoredSqlQueries(rows);
    } catch (error) {
      console.error("Failed to delete saved SQL query:", error);
    }
  }, []);

  const handleRenameStoredSqlQuery = useCallback(
    async (queryId: string) => {
      const existing = storedSqlQueries.find((entry) => entry.id === queryId);
      if (!existing) {
        return;
      }

      const requestedName =
        typeof window !== "undefined"
          ? window.prompt("Rename saved SQL query:", existing.name)
          : existing.name;
      if (requestedName === null) {
        return;
      }

      const normalizedName = requestedName.trim();
      if (!normalizedName) {
        return;
      }

      const duplicateByName = storedSqlQueries.find(
        (entry) =>
          entry.id !== queryId &&
          entry.name.trim().toLowerCase() === normalizedName.toLowerCase(),
      );
      if (duplicateByName && typeof window !== "undefined") {
        const shouldReplace = window.confirm(
          `A saved query named "${normalizedName}" already exists. Replace it?`,
        );
        if (!shouldReplace) {
          return;
        }
      }

      try {
        const rows = await renameSavedSqlQuery(queryId, normalizedName);
        setStoredSqlQueries(rows);
      } catch (error) {
        console.error("Failed to rename saved SQL query:", error);
      }
    },
    [storedSqlQueries],
  );

  const persistArtifactMessage = useCallback(
    async (
      artifactPart: UIMessage["parts"][number],
      now: number,
      messageId: string,
    ) => {
      const nextMessage: UIMessage = {
        id: messageId,
        role: "assistant",
        parts: [artifactPart],
      };

      setMessages((previous) => [...previous, nextMessage]);

      await ensureChat(chatId, "SQL Query Results", now);
      await appendAssistantMessage(
        chatId,
        messageId,
        "",
        JSON.stringify([artifactPart]),
        now,
      );
    },
    [chatId, setMessages],
  );

  const handleAddVisual = useCallback(async () => {
    const now = Date.now();
    const messageId = `manual-visual-${now}`;
    const artifactId = `manual-artifact-${now}`;
    const first = connectedTables[0];
    const defaultDatabase = resolveDbIdentifierForSqlBackend(
      first?.connectionId ??
        first?.databasePath ??
        first?.attachAs ??
        DEFAULT_WASM_DB_IDENTIFIER,
      effectiveSqlBackend,
    );

    const defaultPayload: SqlAnalysisData = {
      stage: "complete",
      progress: 1,
      query: "",
      dbIdentifier: defaultDatabase,
      sqlBackend: effectiveSqlBackend,
      sourceDescriptor: buildDashboardSourceDescriptor({
        runtimeBackend: effectiveSqlBackend,
        dbIdentifier: defaultDatabase,
      }),
      isSqlExpandedInitial: true,
      rowCount: 0,
      columns: [],
      rows: [],
      visualType: "table",
      chartConfig: {
        visualType: "chart",
        title: "New visual",
        description: "",
        type: "bar",
        xKey: "",
        yKeys: [],
        multipleLines: false,
        legend: false,
        countMode: false,
      },
      summary: {
        totalRows: 0,
        insights: [],
      },
    };

    const newArtifactPart = {
      type: executeSqlArtifactType as `data-${string}`,
      data: {
        id: artifactId,
        version: 1,
        status: "complete",
        progress: 1,
        payload: defaultPayload,
        createdAt: now,
        updatedAt: now,
      },
    } as unknown as UIMessage["parts"][number];

    try {
      await persistArtifactMessage(newArtifactPart, now, messageId);
    } catch (error) {
      console.error("Failed to persist visual placeholder:", error);
    }
  }, [connectedTables, effectiveSqlBackend, persistArtifactMessage]);

  useChatUrlParams({
    chatId,
    searchParams,
    sendMessage: ({ text }) => {
      setPromptMode("ai");
      void submitAiPrompt({ text });
    },
    router,
    handleAddVisual,
    setPromptMode,
    loadManualSql: ({ sql, autorun }) => {
      setPromptMode("manual");
      setPendingSqlToLoad(sql);
      setPendingSqlShouldAutoRun(autorun);
    },
  });
  useEffect(() => {
    if (status === "streaming" || status === "submitted") {
      const animation = showRandomAnimation(
        undefined,
        Number.POSITIVE_INFINITY,
        (frame) => setAnimationFrame(frame),
      );
      return () => animation.stop();
    }
    setAnimationFrame("");
  }, [status]);

  useEffect(() => {
    setVerbAiIsThinking(getRandomVerbAiIsThinking());
  }, []);

  const handleAddSqlResultToChat = useCallback(
    async (payload: SqlAnalysisData) => {
      const now = Date.now();
      const messageId = `sql-${now}`;
      const artifactId = `sql-artifact-${now}`;
      const normalizedPayload: SqlAnalysisData = {
        stage: payload.stage ?? "complete",
        progress: payload.progress ?? 1,
        query: payload.query ?? "",
        dbIdentifier: payload.dbIdentifier,
        catalogContext: payload.catalogContext ?? null,
        sqlBackend: payload.sqlBackend,
        sourceDescriptor:
          payload.sourceDescriptor ??
          (payload.sqlBackend
            ? buildDashboardSourceDescriptor({
                runtimeBackend: payload.sqlBackend,
                dbIdentifier: payload.dbIdentifier,
                catalogContext: payload.catalogContext ?? null,
              })
            : null),
        executionTime: payload.executionTime,
        rowCount:
          payload.rowCount ??
          payload.rows?.length ??
          payload.summary?.totalRows ??
          0,
        columns: payload.columns ?? [],
        rows: payload.rows ?? [],
        visualType: payload.visualType ?? "table",
        chartConfig: payload.chartConfig,
        cardConfig: payload.cardConfig,
        summary: payload.summary ?? {
          totalRows: payload.rows?.length ?? 0,
          executionTimeMs: payload.executionTime,
          insights: [],
        },
      };

      const artifactPart = {
        type: executeSqlArtifactType as `data-${string}`,
        data: {
          id: artifactId,
          version: 1,
          status: "complete",
          progress: 1,
          payload: normalizedPayload,
          createdAt: now,
          updatedAt: now,
        },
      } as unknown as UIMessage["parts"][number];

      try {
        await persistArtifactMessage(artifactPart, now, messageId);
      } catch (error) {
        console.error("Failed to persist SQL result message:", error);
      }
    },
    [persistArtifactMessage],
  );

  const handleRemoveMessage = useCallback(
    async (messageId: string) => {
      setMessages((previous) =>
        previous.filter((message) => message.id !== messageId),
      );
      try {
        await deleteMessageFromChat(chatId, messageId);
      } catch (error) {
        console.error("Failed to delete message:", error);
      }
    },
    [chatId, setMessages],
  );

  const handleReplResultChange = useCallback(
    (
      result: {
        sql: string;
        rows: Record<string, unknown>[];
        columns: { name: string; type?: string }[];
        durationMs: number;
        backend?: SqlBackend;
        dbIdentifier?: string;
        catalogContext?: string | null;
        sourceDescriptor?: SqlAnalysisData["sourceDescriptor"];
      } | null,
    ) => {
      setSqlResult(result);
      if (result) {
        setExplorerRefreshToken((previous) => previous + 1);
        handleSelectVisualization(MANUAL_REPL_VISUALIZATION_ID);
      }

      const newSql = result?.sql ?? null;
      if (newSql !== prevSqlRef.current) {
        setManualChartConfig(null);
        setManualCardConfig(null);
        setManualVisualType(
          result && result.rows.length === 1 && result.columns.length === 1
            ? "card"
            : result
              ? "table"
              : null,
        );
        prevSqlRef.current = newSql;
      }
    },
    [handleSelectVisualization],
  );

  const handleManualReplFocus = useCallback(() => {
    if (!sqlResult) {
      return;
    }

    handleSelectVisualization(MANUAL_REPL_VISUALIZATION_ID);
  }, [handleSelectVisualization, sqlResult]);

  const beginChatTitleEdit = useCallback(() => {
    setChatTitleDraft(chatTitle ?? "");
    setIsEditingChatTitle(true);
  }, [chatTitle]);

  const cancelChatTitleEdit = useCallback(() => {
    skipNextTitleBlurSaveRef.current = true;
    setIsEditingChatTitle(false);
    setChatTitleDraft(chatTitle ?? "");
  }, [chatTitle]);

  const saveChatTitle = useCallback(async () => {
    const previousTitle = chatTitle;
    const nextTitle = chatTitleDraft.trim() || null;
    setIsEditingChatTitle(false);
    setChatTitleDraft(nextTitle ?? "");

    if (nextTitle === previousTitle) {
      return;
    }

    setChatTitle(nextTitle);
    try {
      await updateChatTitle(chatId, nextTitle);
    } catch (error) {
      console.error("Failed to update chat title:", error);
      setChatTitle(previousTitle);
    }
  }, [chatId, chatTitle, chatTitleDraft]);

  const rightPanelContent = (
    <div className="relative h-full w-full overflow-hidden bg-card">
      <div className="group/title border-b border-border/50 px-4 py-3">
        <div className="flex items-center gap-2">
          {isEditingChatTitle ? (
            <input
              ref={chatTitleInputRef}
              value={chatTitleDraft}
              onChange={(event) => setChatTitleDraft(event.target.value)}
              onBlur={() => {
                if (skipNextTitleBlurSaveRef.current) {
                  skipNextTitleBlurSaveRef.current = false;
                  return;
                }
                void saveChatTitle();
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void saveChatTitle();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  cancelChatTitleEdit();
                }
              }}
              className="h-7 w-full rounded-md border border-primary/30 bg-background px-2.5 font-mono text-xs font-medium text-foreground shadow-sm transition-shadow focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50"
              placeholder="Untitled chat"
              aria-label="Edit chat title"
            />
          ) : (
            <>
              <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
              <p
                className="truncate font-mono text-xs font-medium tracking-wide text-muted-foreground transition-colors group-hover/title:text-foreground"
                title={chatTitle || "Untitled chat"}
              >
                {chatTitle || "Untitled chat"}
              </p>
              <button
                type="button"
                onClick={beginChatTitleEdit}
                className="ml-auto inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/50 opacity-0 transition-all hover:bg-accent/50 hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring group-hover/title:opacity-100"
                aria-label="Edit chat title"
              >
                <Pencil className="h-3 w-3" />
              </button>
            </>
          )}
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 top-[45px] flex flex-col">
        <VisualizationPanel
          visualizations={visualizations}
          selectedVisualizationId={activeVisualizationId}
        />
      </div>
    </div>
  );

  return (
    <ArtifactMutationProvider
      chatId={chatId}
      messages={messages}
      setMessages={setMessages}
      executeSqlArtifactType={executeSqlArtifactType}
    >
      <div className="chat-container relative flex h-full flex-col">
        <div className="relative flex flex-1 min-h-0 w-full flex-col">
          <div className="flex-1 overflow-hidden bg-card">
            <div
              ref={containerRef}
              className={cn("flex h-full", isResizing && "select-none")}
            >
              <div
                className={cn("flex flex-col min-w-0 h-full overflow-hidden", !isLgScreen && "w-full")}
                style={isLgScreen ? { width: `${100 - rightPanelWidth}%` } : undefined}
              >
                <div className="flex-1 min-h-0 flex overflow-hidden">
                  {!isMobile && <ConnectedDataPanel
                    selectedDb={selectedDb}
                    onSelect={(db) => {
                      setSelectedDb(db);
                      setSelectedCatalogContext(null);
                    }}
                    mode="sidebar"
                    onInsertTable={handleInsertTableIntoSql}
                    refreshToken={explorerRefreshToken}
                    collapsed={isExplorerCollapsed}
                    collapsedBehavior="overlay"
                    onToggleCollapse={() =>
                      setIsExplorerCollapsed((prev) => !prev)
                    }
                    className="shrink-0 bg-background"
                    sqlBackend={effectiveSqlBackend}
                    storedSqlQueries={storedSqlQueries}
                    onSelectStoredSqlQuery={handleSelectStoredSqlQuery}
                    onDeleteStoredSqlQuery={(queryId) => {
                      void handleDeleteStoredSqlQuery(queryId);
                    }}
                    onRenameStoredSqlQuery={(queryId) => {
                      void handleRenameStoredSqlQuery(queryId);
                    }}
                    showStoredSqlQueries
                  />}
                  <div className="relative flex-1 min-h-0 min-w-0 flex flex-col">
                    <ChatMessageThread
                      messages={messages}
                      status={status}
                      animationFrame={animationFrame}
                      verbAiIsThinking={verbAiIsThinking}
                      executeSqlArtifactType={executeSqlArtifactType}
                      activeVisualizationId={activeVisualizationId}
                      getLastSelectableVisualizationIdForMessage={
                        getLastSelectableVisualizationIdForMessage
                      }
                      onSelectVisualization={handleSelectVisualization}
                      onRemoveMessage={handleRemoveMessage}
                      conversationClassName="flex-1 min-h-0"
                      contentSpacingClassName={cn("space-y-2", promptMode === "manual" ? "pb-[16rem] md:pb-[28rem] lg:pb-[32rem]" : "pb-24 md:pb-32 lg:pb-36")}
                      messagePaddingClassName="p-3"
                      userResponsePaddingClassName="p-1"
                      showToolCalls={showToolCalls}
                      showExecuteSqlRawOutput={showExecuteSqlRawOutput}
                    />
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-50">
                      <div className="h-12 bg-gradient-to-t from-card via-card/80 to-transparent" />
                      <div className="pointer-events-auto w-full bg-card px-4 pb-4">
                        {promptError ? (
                          <div className="mb-3 rounded-lg border border-destructive/20 bg-destructive/5 px-3.5 py-2.5 font-mono text-xs text-destructive backdrop-blur-sm dark:border-destructive/30 dark:bg-destructive/10">
                            <div className="flex items-start gap-2.5">
                              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 opacity-80" />
                              <div className="min-w-0 flex-1">
                                <p className="leading-relaxed">{promptError}</p>
                                <div className="mt-2">
                                  <Link
                                    href="/settings"
                                    className="inline-flex items-center font-medium text-destructive/90 underline decoration-destructive/30 underline-offset-4 transition-colors hover:text-destructive hover:decoration-destructive/60"
                                  >
                                    Open Settings
                                  </Link>
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : null}
                        <PromptInputWrapper
                          onSubmit={handlePromptSubmit}
                          mode={promptMode}
                          onModeChange={setPromptMode}
                          pendingMode={
                            status === "submitted" || status === "streaming"
                              ? "ai"
                              : null
                          }
                          status={status}
                          compact
                          showAiInput
                          onCreateDashboard={handleOpenDashboardBuilder}
                          selectedDb={selectedDb}
                          selectedCatalogContext={selectedCatalogContext}
                          onConsoleApiChange={setSqlConsoleApi}
                          onResultChange={handleReplResultChange}
                          sqlResult={sqlResult}
                          onAddSqlResultToChat={handleAddSqlResultToChat}
                          storedSqlQueries={storedSqlQueries}
                          onSaveQuery={handleSaveStoredSqlQuery}
                          isSavingQuery={isSavingStoredSqlQuery}
                          manualShellVariant={CHAT_MANUAL_SHELL_VARIANT}
                          manualChartConfig={manualChartConfig}
                          manualCardConfig={manualCardConfig}
                          manualVisualType={manualVisualType}
                          onManualReplFocus={handleManualReplFocus}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div
                ref={resizeHandleRef}
                onPointerDown={handleResizeStart}
                className={cn(
                  "group/resize hidden lg:flex w-2 shrink-0 cursor-col-resize items-center justify-center transition-colors hover:bg-border/40",
                  isResizing && "bg-border/60",
                )}
              >
                <div
                  className={cn(
                    "h-8 w-0.5 rounded-full bg-border/60 transition-all group-hover/resize:h-12 group-hover/resize:bg-primary/40",
                    isResizing && "h-12 bg-primary/50",
                  )}
                />
              </div>
              <div
                className="hidden lg:flex flex-col min-w-0 h-full border-l border-border"
                style={{ width: `${rightPanelWidth}%` }}
              >
                {rightPanelContent}
              </div>
            </div>
          </div>

          <div className="lg:hidden border-t border-border/50 bg-card">
            <div className="h-[250px]">{rightPanelContent}</div>
          </div>
        </div>

        <Dialog
          open={isDashboardBuilderOpen}
          onOpenChange={setIsDashboardBuilderOpen}
        >
          <DialogContent className="flex max-h-[85vh] min-h-0 w-[calc(100vw-2rem)] max-w-4xl flex-col overflow-hidden">
            <DashboardBuilderPanel
              open={isDashboardBuilderOpen}
              onOpenChange={setIsDashboardBuilderOpen}
              messages={messages}
              selectedDbIdentifier={selectedDb}
              selectedSqlBackend={effectiveSqlBackend}
            />
          </DialogContent>
        </Dialog>
      </div>
    </ArtifactMutationProvider>
  );
}
