import { ArrowRightIcon } from "@heroicons/react/24/outline";
import { nanoid } from "nanoid";
import { useCallback, useEffect, useState } from "react";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import { ConnectedDataPanel } from "@/components/connected-data-panel";
import {
  type ManualShellVariant,
  PromptInputWrapper,
  type PromptMode,
} from "@/components/prompt-input-wrapper";
import type { SqlConsoleApi } from "@/components/sql-console";
import { useConnectedTables } from "@/hooks/use-connected-tables";
import { getDefaultPromptModePreference } from "@/lib/default-prompt-mode";
import type { ExplorerInsertPayload } from "@/lib/duckdb/table-reference";
import { DEFAULT_WASM_DB_IDENTIFIER } from "@/lib/sql/sql-runtime";
import { useResolvedSqlBackend } from "@/lib/sql/use-sql-backend";
import { cn } from "@/lib/utils";
import { ensureChat } from "@/lib/workspace/chat-repo";
import { useRouter } from "@/vite/next-navigation";

const EXAMPLE_COMMANDS = [
  "Show me trends of unicorns over the year in China",
  "Compare revenue across different industries",
  "Create a dashboard for financial metrics",
  "Analyze customer demographics by region",
];

function deriveManualQueryTitle(sql: string): string {
  const firstMeaningfulLine =
    sql
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 0 && !line.startsWith("--")) ?? "";

  if (!firstMeaningfulLine) {
    return "SQL Query Results";
  }

  return firstMeaningfulLine.length > 36
    ? `${firstMeaningfulLine.slice(0, 36)}...`
    : firstMeaningfulLine;
}

export default function Home() {
  const [mode, setMode] = useState<PromptMode>(() =>
    getDefaultPromptModePreference(),
  );
  const [selectedDb, setSelectedDb] = useState<string | undefined>(
    DEFAULT_WASM_DB_IDENTIFIER,
  );
  const [selectedCatalogContext, setSelectedCatalogContext] = useState<
    string | null
  >(null);
  const [manualConsoleApi, setManualConsoleApi] =
    useState<SqlConsoleApi | null>(null);
  const [pendingSqlToInsert, setPendingSqlToInsert] = useState<string | null>(
    null,
  );
  const connectedTables = useConnectedTables();
  const effectiveSqlBackend = useResolvedSqlBackend();
  const router = useRouter();
  const manualShellVariant: ManualShellVariant = "minimal";
  const isManualMode = mode === "manual";

  useEffect(() => {
    if (effectiveSqlBackend === "duckdb-wasm") {
      if (!selectedDb) {
        setSelectedDb(DEFAULT_WASM_DB_IDENTIFIER);
      }
      return;
    }

    if (selectedDb === DEFAULT_WASM_DB_IDENTIFIER) {
      setSelectedDb(undefined);
    }
  }, [effectiveSqlBackend, selectedDb]);

  useEffect(() => {
    if (
      selectedDb ||
      connectedTables.length === 0 ||
      effectiveSqlBackend !== "duckdb-wasm"
    ) {
      return;
    }

    const first = connectedTables[0];
    const firstIdentifier =
      first?.connectionId ??
      first?.databasePath ??
      first?.attachAs ??
      DEFAULT_WASM_DB_IDENTIFIER;

    setSelectedDb(firstIdentifier);
  }, [connectedTables, effectiveSqlBackend, selectedDb]);

  useEffect(() => {
    if (!pendingSqlToInsert || !manualConsoleApi) {
      return;
    }

    const current = manualConsoleApi.getQuery() ?? "";
    const lastChar = current.length > 0 ? current[current.length - 1] : "";
    const needsSpace = current.length > 0 && !/\s/.test(lastChar);
    manualConsoleApi.insertText(
      `${needsSpace ? " " : ""}${pendingSqlToInsert}`,
    );
    manualConsoleApi.focus();
    setPendingSqlToInsert(null);
  }, [manualConsoleApi, pendingSqlToInsert]);

  const handleSubmit = useCallback(
    (message: PromptInputMessage) => {
      const chatId = nanoid();
      const text = message.text?.trim();
      if (text) {
        void ensureChat(
          chatId,
          text.length > 20 ? `${text.slice(0, 20)}...` : text,
        );
      } else {
        void ensureChat(chatId, "SQL Query Results");
      }

      if (mode === "ai") {
        const queryParam = text ? `&q=${encodeURIComponent(text)}` : "";
        router.push(`/chat?id=${chatId}&mode=ai${queryParam}`);
        return;
      }

      router.push(`/chat?id=${chatId}&mode=manual`);
    },
    [mode, router],
  );

  const handleManualRun = useCallback(
    (sql: string) => {
      const trimmedSql = sql.trim();
      if (!trimmedSql) {
        return;
      }

      const chatId = nanoid();
      void ensureChat(chatId, deriveManualQueryTitle(trimmedSql));

      const params = new URLSearchParams({
        id: chatId,
        mode: "manual",
        sql: trimmedSql,
        autorun: "1",
      });

      router.push(`/chat?${params.toString()}`);
    },
    [router],
  );

  const handleModeChange = useCallback((newMode: PromptMode) => {
    setMode(newMode);
  }, []);

  const handleInsertTableIntoSql = useCallback(
    (payload: ExplorerInsertPayload) => {
      if (payload.dbIdentifier) {
        setSelectedDb(payload.dbIdentifier);
      }

      setSelectedCatalogContext(payload.catalogContext ?? null);

      if (!manualConsoleApi) {
        setPendingSqlToInsert(payload.reference);
        return;
      }

      const current = manualConsoleApi.getQuery() ?? "";
      const lastChar = current.length > 0 ? current[current.length - 1] : "";
      const needsSpace = current.length > 0 && !/\s/.test(lastChar);
      manualConsoleApi.insertText(
        `${needsSpace ? " " : ""}${payload.reference}`,
      );
      manualConsoleApi.focus();
    },
    [manualConsoleApi],
  );

  const handleExampleClick = useCallback(
    (command: string) => {
      handleSubmit({ text: command });
    },
    [handleSubmit],
  );

  return (
    <div className="h-full w-full flex items-center justify-center bg-background p-4 overflow-hidden">
      <div className="w-full max-w-7xl h-full flex flex-col font-mono justify-between py-4">
        <div className="flex py-2 justify-center">
          <div className="flex items-center justify-center">
            <div className="relative flex items-center justify-center">
              <div className="flex justify-center pointer-events-none z-10">
                <span className="text-primary font-bold text-4xl font-mono mr-4">
                  POND
                </span>
                <span className="text-4xl font-mono font-semibold text-sidebar-foreground">
                  VIEW
                </span>
              </div>
              <svg
                width="100%"
                height="100%"
                viewBox="0 0 1280 792"
                version="1.1"
                xmlns="http://www.w3.org/2000/svg"
                xmlnsXlink="http://www.w3.org/1999/xlink"
                style={{
                  fillRule: "evenodd",
                  clipRule: "evenodd",
                  strokeLinecap: "round",
                  strokeLinejoin: "round",
                  strokeMiterlimit: 1.5,
                }}
                className="h-44 w-44"
                aria-label="DataChat"
              >
                <title>Pondview</title>
                <g>
                  <path
                    d="M804.167,291.667l87.5,0l0,16.667l62.5,0l0,16.667l33.333,0l0,20.833l29.167,0l0,12.5l33.333,0l0,16.667l16.667,0l0,20.833l16.667,0l0,83.333l-16.667,0l0,16.667l-12.5,0l0,16.667l-20.833,0l0,16.667l-16.667,0l0,12.5l-29.167,0l0,16.667l-50,0l0,12.5l-50,0l0,12.5l-100,0l0,20.833l-316.667,0l0,-20.833l-95.833,0l0,-16.667l-50,0l0,-16.667l-50,0l0,-16.667l-29.167,0l0,-16.667l-20.833,0l0,-12.5l-12.5,0l0,-16.667l-16.667,0l0,-16.667l-16.667,0l0,-79.167l16.667,0l0,-16.667l16.667,0l0,-16.667l33.333,0l0,-16.667l29.167,0l0,-16.667l33.333,0l0,-16.667l66.667,0l0,-16.667l75,0l0,16.667l-62.5,0l0,12.5l-54.167,0l0,16.667l-45.833,0l0,16.667l-12.5,0l0,16.667l-16.667,0l0,16.667l-16.667,0l0,66.667l12.5,0l0,20.833l33.333,0l0,20.833l33.333,0l0,16.667l45.833,0l0,16.667l66.667,0l0,20.833l387.5,0l0,-20.833l62.5,0l0,-16.667l50,0l0,-16.667l33.333,0l0,-20.833l33.333,0l0,-16.667l16.667,0l0,-62.5l-16.667,0l0,-16.667l-12.5,0l0,-12.5l-20.833,0l0,-20.833l-37.5,0l0,-16.667l-54.167,0l0,-20.833l-70.833,0l0,-16.667Z"
                    style={{
                      fill: "var(--secondary)",
                      stroke: "var(--secondary)",
                      strokeWidth: "4.17px",
                    }}
                  />
                </g>
                <g>
                  <path
                    d="M550,325c0.218,35.525 0,-50 0,-50l0,-4.167l16.667,0l0,-45.833l16.667,0l0,-25l16.667,0l0,-33.333l20.833,0l0,-16.667l20.833,0l0,16.667l16.667,0l0,33.333l20.833,0l0,29.167l16.667,0l0,45.833l16.667,0l0,83.333l-16.667,0l0,33.333l-16.667,0l0,16.667l-37.5,0l0,4.167l-29.167,0l0,-4.167l-25,0l0,-16.667l-20.833,0l0,-33.333l-16.667,0c0,0 -0.218,-68.858 0,-33.333Z"
                    style={{
                      fill: "var(--secondary)",
                      stroke: "var(--secondary)",
                      strokeWidth: "4.17px",
                    }}
                  />
                  <path
                    d="M675,304.167l0,37.5l-16.667,0l0,16.667l-25,0l0,20.833l25,0l0,-20.833l16.667,0l0,-16.667l16.667,0l0,-37.5l-16.667,0Z"
                    style={{ fill: "var(--background)" }}
                  />
                </g>
                <g>
                  <path
                    d="M450,358.333l-45.833,0l0,16.667l-29.167,0l0,16.667l-20.833,0l0,45.833l20.833,0l0,16.667l29.167,0l0,16.667l33.333,0l0,16.667l66.667,0l0,20.833l254.167,0l0,-20.833l62.5,0l0,-12.5l37.5,0l0,-20.833l25,0l0,-12.5l20.833,0l0,-45.833l-20.833,0l0,-16.667l-29.167,0l0,-16.667l-45.833,0l0,16.667l33.333,0l0,12.5l16.667,0l0,33.333l-16.667,0l0,16.667l-33.333,0l0,16.667l-66.667,0l0,20.833l-225,0l0,-20.833l-66.667,0l0,-16.667l-33.333,0l0,-16.667l-16.667,0l0,-37.5l16.667,0l0,-12.5l33.333,0l0,-16.667"
                    style={{
                      fill: "var(--secondary)",
                      stroke: "var(--secondary)",
                      strokeWidth: "4.17px",
                    }}
                  />
                  <rect
                    x="454.167"
                    y="341.667"
                    width="45.833"
                    height="16.667"
                    style={{
                      fill: "var(--secondary)",
                      stroke: "var(--secondary)",
                      strokeWidth: "4.17px",
                    }}
                  />
                  <rect
                    x="762.5"
                    y="341.667"
                    width="45.833"
                    height="16.667"
                    style={{
                      fill: "var(--secondary)",
                      stroke: "var(--secondary)",
                      strokeWidth: "4.17px",
                    }}
                  />
                </g>
              </svg>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="overflow-hidden px-4 py-4 h-full z-30">
          <div className="overflow-hidden flex flex-col items-center justify-start h-full">
            <div className="flex w-full max-w-7xl items-stretch gap-4 overflow-hidden transition-all duration-300 ease-out">
              <div
                className={cn(
                  "flex min-h-0 overflow-hidden transition-all duration-300 ease-out",
                  isManualMode
                    ? "w-80 min-w-80 translate-x-0 opacity-100"
                    : "pointer-events-none w-0 min-w-0 -translate-x-4 opacity-0",
                )}
              >
                <ConnectedDataPanel
                  selectedDb={selectedDb}
                  onSelect={(db) => {
                    setSelectedDb(db);
                    setSelectedCatalogContext(null);
                  }}
                  mode="sidebar"
                  onInsertTable={handleInsertTableIntoSql}
                  sqlBackend={effectiveSqlBackend}
                  showCollapseToggle={false}
                  className="h-full w-full rounded-2xl border border-border/60 bg-card/70 backdrop-blur-sm"
                />
              </div>
              <div
                className={cn(
                  "flex min-w-0 flex-1 flex-col transition-all duration-300 ease-out",
                  isManualMode ? "max-w-none" : "mx-auto max-w-5xl",
                )}
              >
                <PromptInputWrapper
                  onSubmit={handleSubmit}
                  className="transition delay-150 duration-300 ease-in-out"
                  onHomePage={true}
                  mode={mode}
                  onModeChange={handleModeChange}
                  onManualRunRequest={handleManualRun}
                  manualShellVariant={manualShellVariant}
                  selectedDb={selectedDb}
                  selectedCatalogContext={selectedCatalogContext}
                  onConsoleApiChange={setManualConsoleApi}
                />
                <div
                  className={cn(
                    "grid transition-[grid-template-rows,opacity,transform,margin] duration-300 ease-out",
                    isManualMode
                      ? "pointer-events-none mt-0 grid-rows-[0fr] opacity-0 -translate-y-2"
                      : "mt-8 grid-rows-[1fr] opacity-100 translate-y-0",
                  )}
                >
                  <div className="min-h-0 overflow-hidden">
                    <div className="animate-in fade-in duration-500 fill-mode-both">
                      <p className="mb-3 text-center text-xs text-muted-foreground">
                        Try asking...
                      </p>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {EXAMPLE_COMMANDS.map((command, i) => (
                          <button
                            key={command}
                            type="button"
                            onClick={() => handleExampleClick(command)}
                            className="group cursor-pointer rounded-md border border-border/30 bg-card/40 px-4 py-3 text-left text-sm text-foreground/80 transition-all duration-200 hover:border-primary/50 hover:bg-primary/5 hover:text-foreground animate-in fade-in slide-in-from-bottom-2 fill-mode-both"
                            style={{
                              animationDelay: `${150 + i * 75}ms`,
                              animationDuration: "400ms",
                            }}
                          >
                            <span className="flex items-center justify-between gap-3">
                              <span>{command}</span>
                              <ArrowRightIcon className="h-3.5 w-3.5 shrink-0 -translate-x-1 text-muted-foreground opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:text-primary group-hover:opacity-100" />
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Terminal Footer */}
        <div className="hidden">
          <div className="text-xs flex items-center justify-between opacity-50 hover:opacity-100 transition-opacity">
            <div className="flex gap-4">
              <span>CMD+K: Command Palette</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
