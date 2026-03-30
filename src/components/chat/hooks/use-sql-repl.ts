import type { UIMessage } from "@ai-sdk/react";
import { useCallback, useEffect, useState } from "react";
import type { SqlAnalysisData } from "@/components/sql-analysis-display.types";
import type { SqlConsoleApi } from "@/components/sql-console";
import type { SqlBackend } from "@/lib/sql/sql-runtime";
import {
  deleteSavedSqlQuery,
  deriveSavedSqlQueryName,
  listSavedSqlQueries,
  renameSavedSqlQuery,
  type SavedSqlQuery,
  saveSqlQuery,
} from "@/lib/workspace/saved-sql-queries-repo";
import {
  appendAssistantMessage,
  ensureChat,
} from "@/lib/workspace/chat-repo";

export type SqlReplResult = {
  sql: string;
  rows: Record<string, unknown>[];
  columns: { name: string; type?: string }[];
  durationMs: number;
  backend?: SqlBackend;
  dbIdentifier?: string;
  catalogContext?: string | null;
  sourceDescriptor?: SqlAnalysisData["sourceDescriptor"];
};

export type PendingSqlLoad = {
  sql: string;
  autorun: boolean;
} | null;

export function findSavedQueryNameConflict(
  queries: SavedSqlQuery[],
  name: string,
  excludeId?: string,
): SavedSqlQuery | undefined {
  const normalizedName = name.trim().toLowerCase();
  return queries.find(
    (entry) =>
      entry.id !== excludeId &&
      entry.name.trim().toLowerCase() === normalizedName,
  );
}

export function applyPendingSqlLoad(params: {
  pending: PendingSqlLoad;
  api: Pick<
    SqlConsoleApi,
    "clearResults" | "setQuery" | "focus" | "runQuery"
  > | null;
  requestAnimationFrame?: typeof window.requestAnimationFrame;
}): PendingSqlLoad {
  const { pending, api, requestAnimationFrame } = params;

  if (!pending || !api) {
    return pending;
  }

  api.clearResults();
  api.setQuery(pending.sql);
  api.focus();

  if (pending.autorun) {
    requestAnimationFrame?.(() => {
      api.runQuery();
    });
  }

  return null;
}

export type SqlReplController = {
  result: SqlReplResult | null;
  setResult: (result: SqlReplResult | null) => void;
  setConsoleApi: (api: SqlConsoleApi | null) => void;
  consoleApi: SqlConsoleApi | null;
  explorerRefreshToken: number;
  savedQueries: SavedSqlQuery[];
  isSavingQuery: boolean;
  saveQuery: (sql?: string) => Promise<void>;
  selectSavedQuery: (queryId: string, options?: { switchToManual?: () => void }) => void;
  deleteSavedQuery: (queryId: string) => Promise<void>;
  renameSavedQuery: (queryId: string) => Promise<void>;
  queueSqlLoad: (payload: { sql: string; autorun: boolean }) => void;
  applyPendingSqlWhenReady: () => void;
  persistManualResultToChat: (payload: SqlAnalysisData) => Promise<void>;
  persistVisualPlaceholder: (payload: SqlAnalysisData) => Promise<void>;
};

export function useSqlRepl({
  chatId,
  setMessages,
  executeSqlArtifactType,
}: {
  chatId: string;
  setMessages: React.Dispatch<React.SetStateAction<UIMessage[]>>;
  executeSqlArtifactType: string;
}): SqlReplController {
  const [sqlConsoleApi, setSqlConsoleApi] = useState<SqlConsoleApi | null>(
    null,
  );
  const [result, setResult] = useState<SqlReplResult | null>(null);
  const [explorerRefreshToken, setExplorerRefreshToken] = useState(0);
  const [savedQueries, setSavedQueries] = useState<SavedSqlQuery[]>([]);
  const [isSavingQuery, setIsSavingQuery] = useState(false);
  const [pendingSqlLoad, setPendingSqlLoad] = useState<PendingSqlLoad>(null);

  useEffect(() => {
    let cancelled = false;

    const loadSavedQueries = async () => {
      try {
        const rows = await listSavedSqlQueries();
        if (!cancelled) {
          setSavedQueries(rows);
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

  const applyPendingSqlWhenReady = useCallback(() => {
    setPendingSqlLoad((currentPending) =>
      applyPendingSqlLoad({
        pending: currentPending,
        api: sqlConsoleApi,
        requestAnimationFrame:
          typeof window !== "undefined"
            ? window.requestAnimationFrame.bind(window)
            : undefined,
      }),
    );
  }, [sqlConsoleApi]);

  useEffect(() => {
    applyPendingSqlWhenReady();
  }, [applyPendingSqlWhenReady]);

  const queueSqlLoad = useCallback((payload: { sql: string; autorun: boolean }) => {
    setPendingSqlLoad(payload);
  }, []);

  const persistArtifactMessage = useCallback(
    async (artifactPart: UIMessage["parts"][number], now: number, messageId: string) => {
      setMessages((previous) => [
        ...previous,
        {
          id: messageId,
          role: "assistant",
          parts: [artifactPart],
        },
      ]);

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

  const persistPayload = useCallback(
    async (payload: SqlAnalysisData, ids: { messageId: string; artifactId: string }) => {
      const now = Date.now();
      const artifactPart = {
        type: executeSqlArtifactType as `data-${string}`,
        data: {
          id: ids.artifactId,
          version: 1,
          status: "complete",
          progress: 1,
          payload,
          createdAt: now,
          updatedAt: now,
        },
      } as unknown as UIMessage["parts"][number];

      try {
        await persistArtifactMessage(artifactPart, now, ids.messageId);
      } catch (error) {
        console.error("Failed to persist SQL result message:", error);
      }
    },
    [executeSqlArtifactType, persistArtifactMessage],
  );

  const persistManualResultToChat = useCallback(
    async (payload: SqlAnalysisData) => {
      const now = Date.now();
      await persistPayload(payload, {
        messageId: `sql-${now}`,
        artifactId: `sql-artifact-${now}`,
      });
    },
    [persistPayload],
  );

  const persistVisualPlaceholder = useCallback(
    async (payload: SqlAnalysisData) => {
      const now = Date.now();
      await persistPayload(payload, {
        messageId: `manual-visual-${now}`,
        artifactId: `manual-artifact-${now}`,
      });
    },
    [persistPayload],
  );

  const saveQuery = useCallback(
    async (sqlOverride?: string) => {
      if (isSavingQuery) {
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

      const duplicateByName = findSavedQueryNameConflict(
        savedQueries,
        normalizedName,
      );

      if (duplicateByName && typeof window !== "undefined") {
        const shouldReplace = window.confirm(
          `A saved query named "${normalizedName}" already exists. Replace it?`,
        );
        if (!shouldReplace) {
          return;
        }
      }

      setIsSavingQuery(true);
      try {
        const rows = await saveSqlQuery({
          sql,
          name: normalizedName,
        });
        setSavedQueries(rows);
      } catch (error) {
        console.error("Failed to save SQL query:", error);
      } finally {
        setIsSavingQuery(false);
      }
    },
    [isSavingQuery, savedQueries, sqlConsoleApi],
  );

  const selectSavedQuery = useCallback(
    (queryId: string, options?: { switchToManual?: () => void }) => {
      const selected = savedQueries.find((entry) => entry.id === queryId);
      if (!selected) {
        return;
      }

      if (!sqlConsoleApi) {
        options?.switchToManual?.();
        setPendingSqlLoad({
          sql: selected.sql,
          autorun: false,
        });
        return;
      }

      sqlConsoleApi.setQuery(selected.sql);
      sqlConsoleApi.focus();
    },
    [savedQueries, sqlConsoleApi],
  );

  const deleteSavedQuery = useCallback(async (queryId: string) => {
    try {
      const rows = await deleteSavedSqlQuery(queryId);
      setSavedQueries(rows);
    } catch (error) {
      console.error("Failed to delete saved SQL query:", error);
    }
  }, []);

  const renameSavedQuery = useCallback(
    async (queryId: string) => {
      const existing = savedQueries.find((entry) => entry.id === queryId);
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

      const duplicateByName = findSavedQueryNameConflict(
        savedQueries,
        normalizedName,
        queryId,
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
        setSavedQueries(rows);
      } catch (error) {
        console.error("Failed to rename saved SQL query:", error);
      }
    },
    [savedQueries],
  );

  const setResultAndRefresh = useCallback((nextResult: SqlReplResult | null) => {
    setResult(nextResult);
    if (nextResult) {
      setExplorerRefreshToken((previous) => previous + 1);
    }
  }, []);

  return {
    result,
    setResult: setResultAndRefresh,
    setConsoleApi: setSqlConsoleApi,
    consoleApi: sqlConsoleApi,
    explorerRefreshToken,
    savedQueries,
    isSavingQuery,
    saveQuery,
    selectSavedQuery,
    deleteSavedQuery,
    renameSavedQuery,
    queueSqlLoad,
    applyPendingSqlWhenReady,
    persistManualResultToChat,
    persistVisualPlaceholder,
  };
}
