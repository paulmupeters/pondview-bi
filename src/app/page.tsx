import { ArrowRightIcon } from "@heroicons/react/24/outline";
import { nanoid } from "nanoid";
import { useCallback, useEffect, useState } from "react";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import { ConnectedDataPanel } from "@/components/connected-data-panel";
import { PondviewLogo } from "@/components/pondview-logo";
import {
  type ManualShellVariant,
  PromptInputWrapper,
  type PromptMode,
} from "@/components/prompt-input-wrapper";
import type { SqlConsoleApi } from "@/components/sql-console";
import { useConnectedTables } from "@/hooks/use-connected-tables";
import { getDefaultPromptModePreference } from "@/lib/default-prompt-mode";
import type { ExplorerInsertPayload } from "@/lib/duckdb/table-reference";
import { ensureSampleDataForEmptyRuntime } from "@/lib/sql/sample-data";
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

export async function runHomepageExampleCommand(params: {
  command: string;
  backendPreference: "bridge" | "duckdb-http" | "duckdb-wasm";
  ensureSampleData?: typeof ensureSampleDataForEmptyRuntime;
  submit: (command: string) => void;
}) {
  const ensureSampleData =
    params.ensureSampleData ?? ensureSampleDataForEmptyRuntime;

  await ensureSampleData({
    backendPreference: params.backendPreference,
  });
  params.submit(params.command);
}

export default function Home() {
  const [mode, setMode] = useState<PromptMode>(() =>
    getDefaultPromptModePreference(),
  );
  const [areSuggestionsVisible, setAreSuggestionsVisible] = useState(false);
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
  const [isPreparingExample, setIsPreparingExample] = useState(false);
  const [exampleError, setExampleError] = useState<string | null>(null);
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

  useEffect(() => {
    setAreSuggestionsVisible(false);

    const frame = window.requestAnimationFrame(() => {
      setAreSuggestionsVisible(true);
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, []);

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
        router.push(`/analysis?id=${chatId}&mode=ai${queryParam}`);
        return;
      }

      router.push(`/analysis?id=${chatId}&mode=manual`);
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

      router.push(`/analysis?${params.toString()}`);
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
    async (command: string) => {
      if (isPreparingExample) {
        return;
      }

      setIsPreparingExample(true);
      setExampleError(null);

      try {
        await runHomepageExampleCommand({
          command,
          backendPreference: effectiveSqlBackend,
          submit: (nextCommand) => handleSubmit({ text: nextCommand }),
        });
      } catch (error) {
        setExampleError(
          error instanceof Error ? error.message : "Failed to add sample data.",
        );
      } finally {
        setIsPreparingExample(false);
      }
    },
    [effectiveSqlBackend, handleSubmit, isPreparingExample],
  );

  return (
    <div className="h-full w-full flex items-center justify-center bg-background p-4 overflow-hidden">
      <div className="w-full max-w-7xl h-full flex flex-col font-mono justify-between py-4">
        <div className="flex py-2 justify-center">
          <div className="flex items-center justify-center">
            <div className="relative flex items-center justify-center">
              <PondviewLogo className="h-44 w-44" />
              <div className="flex justify-center pointer-events-none z-10">
                <span className="font-mono text-3xl font-semibold uppercase tracking-[0.28em]">
                  Pondview
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="overflow-hidden px-4 py-4 h-full z-30">
          <div className="overflow-hidden flex flex-col items-center justify-start h-full">
            <div className="flex w-full max-w-7xl items-stretch gap-4 overflow-hidden transition-all duration-300 ease-out">
              <div
                className={cn(
                  "hidden md:flex min-h-0 overflow-hidden transition-all duration-300 ease-out",
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
                  chatComposer={{
                    submitPrompt: async (message) => {
                      handleSubmit(message);
                    },
                    status: "ready",
                    pendingMode: null,
                  }}
                  sqlRepl={{
                    result: null,
                    setConsoleApi: setManualConsoleApi,
                    saveQuery: async () => {},
                    isSavingQuery: false,
                    persistManualResultToChat: async () => {},
                  }}
                  manualVisualization={{
                    chartConfig: null,
                    cardConfig: null,
                    visualType: null,
                    handleReplResultChange: () => {},
                    focusManualVisualization: () => {},
                    createPayload: () => null,
                  }}
                  className="transition delay-150 duration-300 ease-in-out"
                  onHomePage={true}
                  mode={mode}
                  onModeChange={handleModeChange}
                  onManualRunRequest={handleManualRun}
                  manualShellVariant={manualShellVariant}
                  selectedDb={selectedDb}
                  selectedCatalogContext={selectedCatalogContext}
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
                    <div>
                      <p
                        className={cn(
                          "mb-3 text-center text-xs text-muted-foreground transition-all duration-500 ease-out motion-reduce:transition-none",
                          areSuggestionsVisible
                            ? "opacity-100 translate-y-0"
                            : "opacity-0 translate-y-2",
                        )}
                      >
                        Try asking...
                      </p>
                      {exampleError ? (
                        <p className="mb-3 text-center text-xs text-destructive">
                          {exampleError}
                        </p>
                      ) : null}
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {EXAMPLE_COMMANDS.map((command, i) => (
                          <button
                            key={command}
                            type="button"
                            onClick={() => handleExampleClick(command)}
                            disabled={isPreparingExample}
                            className={cn(
                              "group rounded-md border border-border/30 bg-card/40 px-4 py-3 text-left text-sm text-foreground/80 transition-all duration-500 ease-out hover:border-primary/50 hover:bg-primary/5 hover:text-foreground motion-reduce:transition-none",
                              isPreparingExample
                                ? "cursor-wait opacity-70"
                                : "cursor-pointer",
                              areSuggestionsVisible
                                ? "opacity-100 translate-y-0"
                                : "opacity-0 translate-y-2",
                            )}
                            style={{
                              transitionDelay: areSuggestionsVisible
                                ? `${150 + i * 75}ms`
                                : "0ms",
                            }}
                          >
                            <span className="flex items-center justify-between gap-3">
                              <span>
                                {isPreparingExample
                                  ? "Adding sample data..."
                                  : command}
                              </span>
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
