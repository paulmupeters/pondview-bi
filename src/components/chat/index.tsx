import type { UIMessage } from "@ai-sdk/react";
import { Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArtifactMutationProvider } from "@/components/artifact-mutation-context";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import { NotebookAnalysisCell } from "@/components/chat/notebook-analysis-cell";
import { ChatMessageThread } from "@/components/chat/chat-message-thread";
import { toUiMessages } from "@/components/chat/hooks/chat-session-utils";
import { ChatTitleBar } from "@/components/chat/chat-title-bar";
import { useChatSession } from "@/components/chat/hooks/use-chat-session";
import { useChatUrlParams } from "@/components/chat/hooks/use-chat-url-params";
import { useManualVisualization } from "@/components/chat/hooks/use-manual-visualization";
import { useSqlRepl } from "@/components/chat/hooks/use-sql-repl";
import { useVisualizationSelection } from "@/components/chat/hooks/use-visualization-selection";
import {
  getTrailingAssistantMessages,
} from "@/components/chat/notebook-cell-utils";
import { PromptErrorBanner } from "@/components/chat/prompt-error-banner";
import { extractSqlArtifactParts } from "@/components/chat/sql-artifact-utils";
import { ConnectedDataPanel } from "@/components/connected-data-panel";
import { DashboardBuilderPanel } from "@/components/dashboard-builder-panel";
import { PromptInputWrapper, type PromptMode } from "@/components/prompt-input-wrapper";
import { SqlAnalysisDisplay } from "@/components/sql-analysis-display";
import type { SqlAnalysisData } from "@/components/sql-analysis-display.types";
import type { SqlConsoleApi } from "@/components/sql-console";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useConnectedTables } from "@/hooks/use-connected-tables";
import type { NotebookSession } from "@/hooks/use-notebook-session";
import { useIsMobile } from "@/hooks/use-mobile";
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
} from "@/lib/sql/sql-runtime";
import { useResolvedSqlBackend } from "@/lib/sql/use-sql-backend";
import { listLegacyCompatibleMessagesByNotebookId } from "@/lib/workspace/analysis-notebook-repo";
import { useRouter, useSearchParams } from "@/vite/next-navigation";

const EXECUTE_SQL_ARTIFACT_TYPE = "data-execute-sql";
const EXPLORATORY_SQL_TOOL_TYPE = "tool-execute_exploratory_sql";

function hasToolError(message: UIMessage): boolean {
  return (message.parts ?? []).some((part) => {
    if (!part.type.startsWith("tool-")) {
      return false;
    }

    return (
      ("errorText" in part &&
        typeof part.errorText === "string" &&
        part.errorText.trim().length > 0) ||
      ("error" in part &&
        typeof part.error === "string" &&
        part.error.trim().length > 0)
    );
  });
}

function mapArtifactStatusToCellStatus(
  status: string | undefined,
): "idle" | "running" | "complete" | "error" {
  if (status === "complete") {
    return "complete";
  }

  if (status === "error") {
    return "error";
  }

  if (status === "loading" || status === "streaming") {
    return "running";
  }

  return "idle";
}

function extractToolOutput(part: UIMessage["parts"][number]): unknown {
  if (!("output" in part) && !("result" in part)) {
    return undefined;
  }

  return "output" in part && typeof part.output !== "undefined"
    ? part.output
    : "result" in part
      ? part.result
      : undefined;
}

function extractLatestExploratoryDraft(parts: UIMessage["parts"] | undefined): {
  sql: string;
  dbIdentifier?: string;
  catalogContext?: string | null;
} | null {
  if (!parts?.length) {
    return null;
  }

  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index];
    if (part.type !== EXPLORATORY_SQL_TOOL_TYPE) {
      continue;
    }

    const output = extractToolOutput(part);
    if (!output || typeof output !== "object") {
      continue;
    }

    const candidate = output as {
      sql?: unknown;
      dbIdentifier?: unknown;
      catalogContext?: unknown;
    };

    if (typeof candidate.sql !== "string" || !candidate.sql.trim()) {
      continue;
    }

    return {
      sql: candidate.sql,
      dbIdentifier:
        typeof candidate.dbIdentifier === "string"
          ? candidate.dbIdentifier
          : undefined,
      catalogContext:
        typeof candidate.catalogContext === "string" ||
        candidate.catalogContext === null
          ? candidate.catalogContext
          : undefined,
    };
  }

  return null;
}

export default function Chat({
  chatId,
  initialMessages,
  notebookSession,
}: {
  chatId: string;
  initialMessages?: UIMessage[];
  notebookSession?: NotebookSession;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const connectedTables = useConnectedTables();
  const effectiveSqlBackend = useResolvedSqlBackend();
  const [promptMode, setPromptMode] = useState<PromptMode>(() =>
    getDefaultPromptModePreference(),
  );
  const [selectedDb, setSelectedDb] = useState<string | undefined>();
  const [selectedCatalogContext, setSelectedCatalogContext] = useState<
    string | null
  >(null);
  const [focusedNotebookCellId, setFocusedNotebookCellId] = useState<
    string | null
  >(null);
  const [notebookCellModes, setNotebookCellModes] = useState<
    Record<string, PromptMode>
  >({});
  const [pendingNotebookSqlLoads, setPendingNotebookSqlLoads] = useState<
    Record<string, { sql: string; autorun: boolean }>
  >({});
  const notebookConsoleApisRef = useRef<Map<string, SqlConsoleApi | null>>(
    new Map(),
  );
  const notebookCellCreationPromiseRef = useRef<Promise<
    NotebookSession["cells"][number]
  > | null>(null);
  const hasSeededNotebookCellRef = useRef(false);
  const pendingAssistantCellIdRef = useRef<string | null>(null);
  const [streamingNotebookCellId, setStreamingNotebookCellId] = useState<
    string | null
  >(null);
  const [isNotebookBootstrapPending, setIsNotebookBootstrapPending] =
    useState(false);
  const hasPendingNotebookBootstrapParam = Boolean(
    searchParams.get("q")?.trim() ||
      searchParams.get("sql")?.trim() ||
      searchParams.get("manual") === "1" ||
      searchParams.get("mode"),
  );
  const isMobile = useIsMobile();
  const [isExplorerCollapsed, setIsExplorerCollapsed] = useState(true);
  const [isDashboardBuilderOpen, setIsDashboardBuilderOpen] = useState(false);
  const showToolCalls = useShowToolCallsPreference();
  const showExecuteSqlRawOutput = useExecuteSqlRawOutputPreference();
  const isNotebookMode = Boolean(notebookSession);

  useEffect(() => {
    hasSeededNotebookCellRef.current = false;
    setIsNotebookBootstrapPending(false);
  }, [chatId]);

  const loadNotebookMessages = useCallback(async () => {
    if (!isNotebookMode) {
      return [];
    }

    const rows = await listLegacyCompatibleMessagesByNotebookId(chatId);
    const dedupedRows = Array.from(
      new Map(rows.map((row) => [row.id, row])).values(),
    ).sort((left, right) => left.createdAt - right.createdAt);

    return toUiMessages(dedupedRows as never);
  }, [chatId, isNotebookMode]);

  const handleAssistantMessageFinished = useCallback(
    async (message: UIMessage) => {
      if (!notebookSession) {
        return;
      }

      const targetCellId =
        pendingAssistantCellIdRef.current ??
        focusedNotebookCellId ??
        notebookSession.cells[notebookSession.cells.length - 1]?.id;
      if (!targetCellId) {
        return;
      }

      const createdAt = Date.now();
      const partsJson = JSON.stringify(message.parts ?? []);

      await notebookSession.appendCellEntry({
        cellId: targetCellId,
        role: "assistant",
        partsJson,
        createdAt,
        id: message.id,
      });

      const latestArtifact = extractSqlArtifactParts(
        message.parts,
        EXECUTE_SQL_ARTIFACT_TYPE,
      ).at(-1)?.artifactData;
      const latestExploratoryDraft = extractLatestExploratoryDraft(
        message.parts,
      );

      const nextPatch: {
        status: "idle" | "running" | "complete" | "error";
        sqlDraft?: string | null;
        resultPayloadJson?: string | null;
        lastRunAt?: number | null;
        selectedDbIdentifier?: string | null;
        selectedCatalogContext?: string | null;
      } = {
        status: hasToolError(message)
          ? "error"
          : mapArtifactStatusToCellStatus(latestArtifact?.status),
      };

      if (latestArtifact?.payload) {
        nextPatch.sqlDraft = latestArtifact.payload.query || null;
        nextPatch.resultPayloadJson = JSON.stringify(latestArtifact.payload);
        nextPatch.lastRunAt = createdAt;
        nextPatch.selectedDbIdentifier =
          latestArtifact.payload.dbIdentifier ?? selectedDb ?? null;
        nextPatch.selectedCatalogContext =
          latestArtifact.payload.catalogContext ?? selectedCatalogContext;
      } else if (latestExploratoryDraft) {
        nextPatch.sqlDraft = latestExploratoryDraft.sql;
        nextPatch.selectedDbIdentifier =
          latestExploratoryDraft.dbIdentifier ?? selectedDb ?? null;
        nextPatch.selectedCatalogContext =
          latestExploratoryDraft.catalogContext ?? selectedCatalogContext;
      }

      await notebookSession.updateCell(targetCellId, nextPatch);
      await notebookSession.refreshUpdatedAt();
      pendingAssistantCellIdRef.current = null;
      setStreamingNotebookCellId(null);
    },
    [
      focusedNotebookCellId,
      notebookSession,
      selectedCatalogContext,
      selectedDb,
    ],
  );

  const chatSession = useChatSession({
    chatId,
    initialMessages,
    executeSqlArtifactType: EXECUTE_SQL_ARTIFACT_TYPE,
    loadPersistedMessages: notebookSession ? loadNotebookMessages : undefined,
    onAssistantMessageFinished: notebookSession
      ? handleAssistantMessageFinished
      : undefined,
  });

  const sqlRepl = useSqlRepl({
    chatId,
    setMessages: chatSession.thread.setMessages,
    executeSqlArtifactType: EXECUTE_SQL_ARTIFACT_TYPE,
  });
  const { persistVisualPlaceholder, queueSqlLoad } = sqlRepl;

  const {
    manualVisualization,
    supplementalVisualizations: manualSupplementalVisualizations,
  } = useManualVisualization({
    sqlResult: sqlRepl.result,
    setSqlResult: sqlRepl.setResult,
    selectedCatalogContext,
  });

  const manualVisualizationController = useMemo(
    () => ({
      ...manualVisualization,
      focusManualVisualization: () => {},
    }),
    [manualVisualization],
  );

  const { visualizationMap } = useVisualizationSelection({
    messages: chatSession.thread.messages,
    executeSqlArtifactType: EXECUTE_SQL_ARTIFACT_TYPE,
    supplementalVisualizations: isNotebookMode
      ? []
      : manualSupplementalVisualizations,
  });

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
    if (
      !notebookSession ||
      hasSeededNotebookCellRef.current ||
      notebookSession.isLoading ||
      isNotebookBootstrapPending ||
      hasPendingNotebookBootstrapParam ||
      notebookSession.cells.length > 0
    ) {
      return;
    }

    hasSeededNotebookCellRef.current = true;
    void (async () => {
      if (notebookCellCreationPromiseRef.current) {
        const cell = await notebookCellCreationPromiseRef.current;
        setFocusedNotebookCellId(cell.id);
        return;
      }

      const pending = notebookSession.addCell();
      notebookCellCreationPromiseRef.current = pending;

      try {
        const cell = await pending;
        setFocusedNotebookCellId(cell.id);
      } finally {
        notebookCellCreationPromiseRef.current = null;
      }
    })();
  }, [
    hasPendingNotebookBootstrapParam,
    isNotebookBootstrapPending,
    notebookSession,
    notebookSession?.cells.length,
    notebookSession?.isLoading,
  ]);

  useEffect(() => {
    if (!notebookSession || notebookSession.cells.length === 0) {
      setFocusedNotebookCellId(null);
      return;
    }

    if (
      focusedNotebookCellId &&
      notebookSession.cells.some((cell) => cell.id === focusedNotebookCellId)
    ) {
      return;
    }

    const nextFocusedCell =
      notebookSession.cells[notebookSession.cells.length - 1] ?? null;
    if (!nextFocusedCell) {
      return;
    }

    setFocusedNotebookCellId(nextFocusedCell.id);
    if (nextFocusedCell.selectedDbIdentifier) {
      setSelectedDb(nextFocusedCell.selectedDbIdentifier);
    }
    if (nextFocusedCell.selectedCatalogContext !== undefined) {
      setSelectedCatalogContext(nextFocusedCell.selectedCatalogContext);
    }
  }, [focusedNotebookCellId, notebookSession]);

  useEffect(() => {
    if (!notebookSession || !chatSession.composer.promptError) {
      return;
    }

    const targetCellId = pendingAssistantCellIdRef.current;
    if (!targetCellId) {
      return;
    }

    void notebookSession
      .updateCell(targetCellId, {
        status: "error",
      })
      .then(() => notebookSession.refreshUpdatedAt())
      .catch((error) => {
        console.error("Failed to update notebook cell after AI error:", error);
      })
      .finally(() => {
        pendingAssistantCellIdRef.current = null;
        setStreamingNotebookCellId(null);
      });
  }, [chatSession.composer.promptError, notebookSession]);

  const createNotebookCell = useCallback(async () => {
    if (!notebookSession) {
      throw new Error("Notebook session is required.");
    }

    if (notebookCellCreationPromiseRef.current) {
      return notebookCellCreationPromiseRef.current;
    }

    const pending = notebookSession.addCell();
    notebookCellCreationPromiseRef.current = pending;

    try {
      return await pending;
    } finally {
      notebookCellCreationPromiseRef.current = null;
    }
  }, [notebookSession]);

  const ensureNotebookTargetCell = useCallback(
    async (preferredCellId?: string | null) => {
      if (!notebookSession) {
        throw new Error("Notebook session is required.");
      }

      if (preferredCellId) {
        const preferredCell = notebookSession.cells.find(
          (cell) => cell.id === preferredCellId,
        );
        if (preferredCell) {
          return preferredCell;
        }
      }

      if (focusedNotebookCellId) {
        const focusedCell = notebookSession.cells.find(
          (cell) => cell.id === focusedNotebookCellId,
        );
        if (focusedCell) {
          return focusedCell;
        }
      }

      const lastCell = notebookSession.cells[notebookSession.cells.length - 1];
      if (lastCell) {
        return lastCell;
      }

      const createdCell = await createNotebookCell();
      setFocusedNotebookCellId(createdCell.id);
      return createdCell;
    },
    [createNotebookCell, focusedNotebookCellId, notebookSession],
  );

  const handleOpenDashboardBuilder = useCallback(() => {
    setIsDashboardBuilderOpen(true);
  }, []);

  const handleInsertTableIntoSql = useCallback(
    (payload: ExplorerInsertPayload) => {
      if (!isNotebookMode) {
        if (!sqlRepl.consoleApi) {
          return;
        }

        const current = sqlRepl.consoleApi.getQuery() ?? "";
        const lastChar = current.length > 0 ? current[current.length - 1] : "";
        const needsSpace = current.length > 0 && !/\s/.test(lastChar);
        sqlRepl.consoleApi.insertText(
          `${needsSpace ? " " : ""}${payload.reference}`,
        );
        sqlRepl.consoleApi.focus();
        if (payload.dbIdentifier) {
          setSelectedDb(payload.dbIdentifier);
        }
        setSelectedCatalogContext(payload.catalogContext ?? null);
        return;
      }

      const targetCellId =
        focusedNotebookCellId ??
        notebookSession?.cells[notebookSession.cells.length - 1]?.id;
      if (!targetCellId) {
        return;
      }

      setNotebookCellModes((previous) => ({
        ...previous,
        [targetCellId]: "manual",
      }));

      const targetApi = notebookConsoleApisRef.current.get(targetCellId);
      if (targetApi) {
        const current = targetApi.getQuery() ?? "";
        const lastChar = current.length > 0 ? current[current.length - 1] : "";
        const needsSpace = current.length > 0 && !/\s/.test(lastChar);
        targetApi.insertText(`${needsSpace ? " " : ""}${payload.reference}`);
        targetApi.focus();
      } else {
        const targetCell =
          notebookSession?.cells.find((cell) => cell.id === targetCellId) ??
          null;
        const current = targetCell?.sqlDraft ?? "";
        const lastChar = current.length > 0 ? current[current.length - 1] : "";
        const needsSpace = current.length > 0 && !/\s/.test(lastChar);

        setPendingNotebookSqlLoads((previous) => ({
          ...previous,
          [targetCellId]: {
            sql: `${current}${needsSpace ? " " : ""}${payload.reference}`,
            autorun: false,
          },
        }));
      }

      if (payload.dbIdentifier) {
        setSelectedDb(payload.dbIdentifier);
      }
      setSelectedCatalogContext(payload.catalogContext ?? null);
    },
    [focusedNotebookCellId, isNotebookMode, notebookSession, sqlRepl.consoleApi],
  );

  const handleSubmitPrompt = useCallback(
    async (
      message: PromptInputMessage,
      options?: {
        cellId?: string;
        selectedDb?: string;
        selectedCatalogContext?: string | null;
      },
    ) => {
      if (!isNotebookMode || !notebookSession) {
        await chatSession.composer.submitPrompt(message);
        return;
      }

      const targetCell = await ensureNotebookTargetCell(options?.cellId);
      const promptText = message.text?.trim() ?? "";

      pendingAssistantCellIdRef.current = targetCell.id;
      setStreamingNotebookCellId(targetCell.id);
      setFocusedNotebookCellId(targetCell.id);
      setNotebookCellModes((previous) => ({
        ...previous,
        [targetCell.id]: "ai",
      }));

      await notebookSession.updateCell(targetCell.id, {
        promptText,
        status: "running",
        selectedDbIdentifier:
          options?.selectedDb ?? targetCell.selectedDbIdentifier ?? selectedDb ?? null,
        selectedCatalogContext:
          options?.selectedCatalogContext ??
          targetCell.selectedCatalogContext ??
          selectedCatalogContext,
      });
      await notebookSession.refreshUpdatedAt();
      await chatSession.composer.submitPrompt(message);
    },
    [
      chatSession.composer,
      ensureNotebookTargetCell,
      isNotebookMode,
      notebookSession,
      selectedCatalogContext,
      selectedDb,
    ],
  );

  const handleAddVisual = useCallback(async () => {
    if (isNotebookMode && notebookSession) {
      const newCell = await createNotebookCell();
      setFocusedNotebookCellId(newCell.id);
      setNotebookCellModes((previous) => ({
        ...previous,
        [newCell.id]: "manual",
      }));
      return;
    }

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

    await persistVisualPlaceholder(defaultPayload);
  }, [
    connectedTables,
    createNotebookCell,
    effectiveSqlBackend,
    isNotebookMode,
    notebookSession,
    persistVisualPlaceholder,
  ]);

  const handleNotebookPromptModeChange = useCallback(
    (mode: PromptMode) => {
      if (!isNotebookMode) {
        setPromptMode(mode);
        return;
      }

      if (searchParams.get("sql")?.trim()) {
        return;
      }

      const hasModeParam = Boolean(searchParams.get("mode"));
      if (hasModeParam) {
        setIsNotebookBootstrapPending(true);
      }

      void ensureNotebookTargetCell().then((cell) => {
        setFocusedNotebookCellId(cell.id);
        setNotebookCellModes((previous) => ({
          ...previous,
          [cell.id]: mode,
        }));
      }).finally(() => {
        if (hasModeParam) {
          setIsNotebookBootstrapPending(false);
        }
      });
    },
    [ensureNotebookTargetCell, isNotebookMode, searchParams],
  );

  const handleUrlSendMessage = useCallback(
    ({ text }: { text: string }) => {
      if (!isNotebookMode) {
        setPromptMode("ai");
        void handleSubmitPrompt({ text });
        return;
      }

      setIsNotebookBootstrapPending(true);
      void handleSubmitPrompt({ text }).finally(() => {
        setIsNotebookBootstrapPending(false);
      });
    },
    [handleSubmitPrompt, isNotebookMode],
  );

  const handleUrlLoadManualSql = useCallback(
    ({ sql, autorun }: { sql: string; autorun: boolean }) => {
      if (!isNotebookMode) {
        setPromptMode("manual");
        queueSqlLoad({ sql, autorun });
        return;
      }

      setIsNotebookBootstrapPending(true);
      void ensureNotebookTargetCell().then((cell) => {
        setFocusedNotebookCellId(cell.id);
        setNotebookCellModes((previous) => ({
          ...previous,
          [cell.id]: "manual",
        }));
        setPendingNotebookSqlLoads((previous) => ({
          ...previous,
          [cell.id]: { sql, autorun },
        }));
      }).finally(() => {
        setIsNotebookBootstrapPending(false);
      });
    },
    [ensureNotebookTargetCell, isNotebookMode, queueSqlLoad],
  );

  useChatUrlParams({
    chatId,
    searchParams,
    sendMessage: handleUrlSendMessage,
    router,
    normalizedPath: isNotebookMode ? "/analysis" : "/chat",
    handleAddVisual,
    setPromptMode: handleNotebookPromptModeChange,
    loadManualSql: handleUrlLoadManualSql,
  });

  const handleSelectStoredSqlQuery = useCallback(
    (queryId: string) => {
      if (!isNotebookMode) {
        if (promptMode !== "manual") {
          sqlRepl.selectSavedQuery(queryId, {
            switchToManual: () => {
              setPromptMode("manual");
            },
          });
          return;
        }

        sqlRepl.selectSavedQuery(queryId);
        return;
      }

      const selected = sqlRepl.savedQueries.find((entry) => entry.id === queryId);
      if (!selected) {
        return;
      }

      void ensureNotebookTargetCell().then((cell) => {
        setFocusedNotebookCellId(cell.id);
        setNotebookCellModes((previous) => ({
          ...previous,
          [cell.id]: "manual",
        }));

        const targetApi = notebookConsoleApisRef.current.get(cell.id);
        if (targetApi) {
          targetApi.clearResults();
          targetApi.setQuery(selected.sql);
          targetApi.focus();
          return;
        }

        setPendingNotebookSqlLoads((previous) => ({
          ...previous,
          [cell.id]: {
            sql: selected.sql,
            autorun: false,
          },
        }));
      });
    },
    [
      ensureNotebookTargetCell,
      isNotebookMode,
      promptMode,
      sqlRepl,
      sqlRepl.savedQueries,
    ],
  );

  const footerPayload = useMemo(() => {
    if (promptMode !== "manual" || !sqlRepl.result) {
      return null;
    }

    return manualVisualization.createPayload({
      result: sqlRepl.result,
      selectedCatalogContext,
    });
  }, [manualVisualization, promptMode, selectedCatalogContext, sqlRepl.result]);

  const handleRemoveThreadItem = useCallback(
    async (messageId: string) => {
      if (!notebookSession) {
        await chatSession.thread.removeMessage(messageId);
        return;
      }

      const targetCell = notebookSession.cells.find(
        (cell) => cell.id === messageId,
      );
      if (targetCell) {
        const entryIds = new Set(
          (notebookSession.cellEntriesByCellId.get(targetCell.id) ?? []).map(
            (entry) => entry.id,
          ),
        );
        await notebookSession.deleteCell(targetCell.id);
        await notebookSession.refreshUpdatedAt();
        chatSession.thread.setMessages((previous) =>
          previous.filter(
            (message) =>
              message.id !== targetCell.id && !entryIds.has(message.id),
          ),
        );
        return;
      }

      for (const [cellId, entries] of notebookSession.cellEntriesByCellId) {
        if (!entries.some((entry) => entry.id === messageId)) {
          continue;
        }

        await notebookSession.deleteCellEntry(cellId, messageId);
        await notebookSession.refreshUpdatedAt();
        chatSession.thread.setMessages((previous) =>
          previous.filter((message) => message.id !== messageId),
        );
        return;
      }

      chatSession.thread.setMessages((previous) =>
        previous.filter((message) => message.id !== messageId),
      );
    },
    [chatSession.thread, notebookSession],
  );

  const handleNotebookCellModeChange = useCallback(
    (cellId: string, mode: PromptMode) => {
      setNotebookCellModes((previous) => ({
        ...previous,
        [cellId]: mode,
      }));
    },
    [],
  );

  const handleNotebookConsoleApiChange = useCallback(
    (cellId: string, api: SqlConsoleApi | null) => {
      if (api) {
        notebookConsoleApisRef.current.set(cellId, api);
        return;
      }

      notebookConsoleApisRef.current.delete(cellId);
    },
    [],
  );

  const handleNotebookSqlLoadHandled = useCallback((cellId: string) => {
    setPendingNotebookSqlLoads((previous) => {
      const next = { ...previous };
      delete next[cellId];
      return next;
    });
  }, []);

  const handleNotebookCellFocus = useCallback(
    ({
      cellId,
      selectedDb,
      selectedCatalogContext,
    }: {
      cellId: string;
      selectedDb?: string;
      selectedCatalogContext?: string | null;
    }) => {
      setFocusedNotebookCellId(cellId);
      if (selectedDb) {
        setSelectedDb(selectedDb);
      }
      setSelectedCatalogContext(selectedCatalogContext ?? null);
    },
    [],
  );

  const isAssistantThinking =
    chatSession.thread.status === "streaming" ||
    chatSession.thread.status === "submitted";
  const trailingAssistantMessages = useMemo(
    () =>
      isNotebookMode && isAssistantThinking
        ? getTrailingAssistantMessages(chatSession.thread.messages)
        : [],
    [chatSession.thread.messages, isAssistantThinking, isNotebookMode],
  );

  return (
    <ArtifactMutationProvider {...chatSession.artifactProvider}>
      <div className="chat-container relative flex h-full flex-col">
        <div className="relative flex h-full w-full flex-1 flex-col">
          <div className="flex-1 overflow-hidden bg-card">
            <div className="flex h-full">
              {!isMobile && (
                <ConnectedDataPanel
                  selectedDb={selectedDb}
                  onSelect={(db) => {
                    setSelectedDb(db);
                    setSelectedCatalogContext(null);
                  }}
                  mode="sidebar"
                  onInsertTable={handleInsertTableIntoSql}
                  refreshToken={sqlRepl.explorerRefreshToken}
                  collapsed={isExplorerCollapsed}
                  collapsedBehavior="overlay"
                  onToggleCollapse={() =>
                    setIsExplorerCollapsed((previous) => !previous)
                  }
                  className="shrink-0 bg-background"
                  sqlBackend={effectiveSqlBackend}
                  storedSqlQueries={sqlRepl.savedQueries}
                  onSelectStoredSqlQuery={handleSelectStoredSqlQuery}
                  onDeleteStoredSqlQuery={(queryId) => {
                    void sqlRepl.deleteSavedQuery(queryId);
                  }}
                  onRenameStoredSqlQuery={(queryId) => {
                    void sqlRepl.renameSavedQuery(queryId);
                  }}
                  showStoredSqlQueries
                />
              )}
              <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
                <ChatTitleBar model={chatSession.titleBar} />

                {isNotebookMode && notebookSession ? (
                  <div className="flex-1 overflow-y-auto">
                    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4">
                      {notebookSession.cells.map((cell, cellIndex) => (
                        <NotebookAnalysisCell
                          key={cell.id}
                          cell={cell}
                          cellIndex={cellIndex}
                          entries={
                            notebookSession.cellEntriesByCellId.get(cell.id) ?? []
                          }
                          streamingAssistantMessages={
                            streamingNotebookCellId === cell.id
                              ? trailingAssistantMessages
                              : []
                          }
                          isAssistantThinking={
                            streamingNotebookCellId === cell.id &&
                            isAssistantThinking
                          }
                          promptError={
                            (streamingNotebookCellId === cell.id ||
                              focusedNotebookCellId === cell.id) &&
                            chatSession.composer.promptError
                              ? chatSession.composer.promptError
                              : null
                          }
                          promptStatus={chatSession.composer.status}
                          promptPendingMode={chatSession.composer.pendingMode}
                          mode={notebookCellModes[cell.id] ?? "ai"}
                          showToolCalls={showToolCalls}
                          showExecuteSqlRawOutput={showExecuteSqlRawOutput}
                          executeSqlArtifactType={EXECUTE_SQL_ARTIFACT_TYPE}
                          isFocused={focusedNotebookCellId === cell.id}
                          sharedSelectedDb={selectedDb}
                          sharedSelectedCatalogContext={selectedCatalogContext}
                          pendingSqlLoad={pendingNotebookSqlLoads[cell.id] ?? null}
                          saveQuery={sqlRepl.saveQuery}
                          isSavingQuery={sqlRepl.isSavingQuery}
                          onSubmitPrompt={({ cellId, message, selectedDb, selectedCatalogContext }) =>
                            handleSubmitPrompt(message, {
                              cellId,
                              selectedDb,
                              selectedCatalogContext,
                            })
                          }
                          onModeChange={handleNotebookCellModeChange}
                          onDeleteCell={handleRemoveThreadItem}
                          onDeleteCellEntry={handleRemoveThreadItem}
                          onRegisterConsoleApi={handleNotebookConsoleApiChange}
                          onPendingSqlLoadHandled={handleNotebookSqlLoadHandled}
                          onFocusCell={handleNotebookCellFocus}
                          onOpenDashboardBuilder={handleOpenDashboardBuilder}
                          notebookSession={notebookSession}
                        />
                      ))}

                      <div className="flex justify-center pb-4">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-4 py-2 text-xs font-mono text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
                          onClick={() => void handleAddVisual()}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          [+ Add Cell]
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <ChatMessageThread
                    messages={chatSession.thread.messages}
                    status={chatSession.thread.status}
                    animationFrame={chatSession.thread.animationFrame}
                    verbAiIsThinking={chatSession.thread.verbAiIsThinking}
                    executeSqlArtifactType={EXECUTE_SQL_ARTIFACT_TYPE}
                    visualizationMap={visualizationMap}
                    onRemoveMessage={handleRemoveThreadItem}
                    conversationClassName="flex-1 min-h-0"
                    contentSpacingClassName="space-y-3 pb-4"
                    messagePaddingClassName="p-3"
                    userResponsePaddingClassName="p-1"
                    showToolCalls={showToolCalls}
                    showExecuteSqlRawOutput={showExecuteSqlRawOutput}
                    footerContent={
                      <div className="w-full space-y-3">
                        <div className="w-full rounded-lg border border-border bg-card shadow-sm overflow-hidden">
                          {footerPayload && (
                            <div className="max-h-[50vh] overflow-y-auto border-b border-border">
                              <SqlAnalysisDisplay
                                data={footerPayload}
                                stage="complete"
                                progress={1}
                                showStageIndicator={false}
                                className="w-full"
                                onConfigChange={
                                  manualVisualization.handleConfigChange
                                }
                                onVisualTypeChange={
                                  manualVisualization.handleVisualTypeChange
                                }
                              />
                            </div>
                          )}
                          <PromptErrorBanner
                            message={chatSession.composer.promptError}
                          />
                          <div className="px-4 py-3">
                            <PromptInputWrapper
                              chatComposer={{
                                ...chatSession.composer,
                                submitPrompt: handleSubmitPrompt,
                              }}
                              sqlRepl={sqlRepl}
                              manualVisualization={manualVisualizationController}
                              mode={promptMode}
                              onModeChange={setPromptMode}
                              compact
                              showAiInput
                              onCreateDashboard={handleOpenDashboardBuilder}
                              selectedDb={selectedDb}
                              selectedCatalogContext={selectedCatalogContext}
                              manualShellVariant="minimal"
                            />
                          </div>
                        </div>
                      </div>
                    }
                  />
                )}
              </div>
            </div>
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
              messages={chatSession.thread.messages}
              selectedDbIdentifier={selectedDb}
              selectedSqlBackend={effectiveSqlBackend}
            />
          </DialogContent>
        </Dialog>
      </div>
    </ArtifactMutationProvider>
  );
}
