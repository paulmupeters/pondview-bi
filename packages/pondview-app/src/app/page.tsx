import {
  ArrowRight,
  BarChart3,
  Clock3,
  Database,
  FilePlus2,
  LayoutDashboard,
  SquareTerminal,
  Upload,
} from "lucide-react";
import { nanoid } from "nanoid";
import { type ComponentType, useCallback, useEffect, useState } from "react";
import { hasRequiredAiConfigurationForBackend } from "@/ai/configuration-status";
import {
  AI_SETTINGS_UPDATED_EVENT,
  hasRequiredAiConfigurationInStorage,
} from "@/ai/settings";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import { PromptErrorBanner } from "@/components/chat/prompt-error-banner";
import { ConnectDataDialog } from "@/components/connect-data-dialog";
import { ConnectedDataPanel } from "@/components/connected-data-panel";
import { PondviewLogo } from "@/components/pondview-logo";
import {
  type ManualShellVariant,
  PromptInputWrapper,
  type PromptMode,
} from "@/components/prompt-input-wrapper";
import { RecentAnalysesSection } from "@/components/recent-analyses-section";
import type { SqlConsoleApi } from "@/components/sql-console";
import { getDefaultPromptModePreference } from "@/lib/default-prompt-mode";
import type { ExplorerInsertPayload } from "@/lib/duckdb/table-reference";
import {
  getProjectRuntimeDefaultCatalogContext,
  getProjectRuntimeDefaultDbIdentifier,
} from "@/lib/project-runtime";
import {
  ensureSampleDataForEmptyRuntime,
  hasVisibleTablesInRuntime,
} from "@/lib/sql/sample-data";
import { DEFAULT_WASM_DB_IDENTIFIER } from "@/lib/sql/sql-runtime";
import { useResolvedSqlBackend } from "@/lib/sql/use-sql-backend";
import { cn } from "@/lib/utils";
import { ensureChat } from "@/lib/workspace/chat-repo";
import Link from "@/vite/next-link";
import { useRouter } from "@/vite/next-navigation";

const EXAMPLE_COMMANDS = [
  "Show me trends of unicorns founded over the years in China",
  "Compare total unicorn valuation across countries",
  "Create a bar chart of unicorn valuations by country",
  "Which companies have the highest valuation?",
];

export const GENERIC_DATA_EXPLORATION_COMMANDS = [
  "What data is available?",
  "How many tables are available?",
  "How many rows are in each table?",
  "How many columns does each table have?",
];

const MISSING_AI_CONFIGURATION_MESSAGE =
  "Missing AI configuration. Open Settings and configure provider, API key, and model.";

type HomepageQuickAction = {
  id: "new-analysis" | "recent-analyses" | "sql-editor" | "upload-data";
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  emphasis?: "primary";
  href?: string;
  onClick?: () => void;
};

type HomepageQuickActionCardProps = HomepageQuickAction & {
  index: number;
  visible: boolean;
};

function HomepageQuickActionCard({
  label,
  description,
  icon: Icon,
  emphasis,
  href,
  onClick,
  index,
  visible,
}: HomepageQuickActionCardProps) {
  const className = cn(
    "group relative flex min-h-36 w-full overflow-hidden rounded-2xl border p-5 text-left outline-none transition-all duration-500 ease-out motion-reduce:transition-none",
    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    emphasis === "primary"
      ? "border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/15 hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/25"
      : "border-border/70 bg-card/75 text-card-foreground shadow-sm backdrop-blur-sm hover:-translate-y-1 hover:border-primary/40 hover:bg-card hover:shadow-lg",
    visible ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
  );

  const content = (
    <>
      <div
        className={cn(
          "absolute -right-8 -top-8 h-28 w-28 rounded-full border transition-transform duration-500 group-hover:scale-110",
          emphasis === "primary"
            ? "border-primary-foreground/15"
            : "border-primary/10",
        )}
        aria-hidden="true"
      />
      <div className="relative flex h-full w-full flex-col justify-between gap-5">
        <div className="flex items-start justify-between gap-3">
          <span
            className={cn(
              "flex size-9 items-center justify-center rounded-xl border",
              emphasis === "primary"
                ? "border-primary-foreground/20 bg-primary-foreground/10"
                : "border-border bg-background/80 text-primary",
            )}
          >
            <Icon className="size-[18px]" />
          </span>
          <ArrowRight className="size-4 -translate-x-1 opacity-40 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100" />
        </div>
        <div>
          <h3 className="text-sm font-semibold tracking-tight">{label}</h3>
          <p
            className={cn(
              "mt-1 text-xs leading-relaxed",
              emphasis === "primary"
                ? "text-primary-foreground/70"
                : "text-muted-foreground",
            )}
          >
            {description}
          </p>
        </div>
      </div>
    </>
  );

  const style = {
    transitionDelay: visible ? `${80 + index * 70}ms` : "0ms",
  };

  if (href) {
    return (
      <Link href={href} className={className} style={style}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={className} style={style}>
      {content}
    </button>
  );
}

export async function createBlankHomepageAnalysis(params: {
  createId?: () => string;
  persistChat?: typeof ensureChat;
  navigate: (href: string) => void;
}): Promise<string> {
  const chatId = (params.createId ?? nanoid)();
  await (params.persistChat ?? ensureChat)(chatId, "Untitled analysis");
  params.navigate(`/analysis?id=${encodeURIComponent(chatId)}&mode=ai`);
  return chatId;
}

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
  backendPreference: "bridge" | "duckdb-wasm";
  ensureSampleData?: typeof ensureSampleDataForEmptyRuntime;
  submit: (command: string) => void;
}) {
  const ensureSampleData =
    params.ensureSampleData ?? ensureSampleDataForEmptyRuntime;

  const sampleData = await ensureSampleData({
    backendPreference: params.backendPreference,
  });
  const command =
    sampleData.skipped &&
    !GENERIC_DATA_EXPLORATION_COMMANDS.includes(params.command)
      ? GENERIC_DATA_EXPLORATION_COMMANDS[0]
      : params.command;
  params.submit(command);
}

export function getHomepageAiWarningMessage(params: {
  mode: PromptMode;
  hasAiConfiguration: boolean;
}): string | null {
  if (params.mode !== "ai" || params.hasAiConfiguration) {
    return null;
  }

  return MISSING_AI_CONFIGURATION_MESSAGE;
}

export function appendExplorerReferenceToPrompt(
  currentPrompt: string,
  reference: string,
): string {
  const trimmedReference = reference.trim();
  if (!trimmedReference) {
    return currentPrompt;
  }

  if (!currentPrompt) {
    return trimmedReference;
  }

  const lastChar = currentPrompt[currentPrompt.length - 1] ?? "";
  return `${currentPrompt}${/\s/.test(lastChar) ? "" : " "}${trimmedReference}`;
}

export default function Home() {
  const [mode, setMode] = useState<PromptMode>(() =>
    getDefaultPromptModePreference(),
  );
  const [promptInput, setPromptInput] = useState("");
  const [areSuggestionsVisible, setAreSuggestionsVisible] = useState(false);
  const [selectedDb, setSelectedDb] = useState<string | undefined>(
    () => getProjectRuntimeDefaultDbIdentifier() ?? DEFAULT_WASM_DB_IDENTIFIER,
  );
  const [selectedCatalogContext, setSelectedCatalogContext] = useState<
    string | null
  >(() => getProjectRuntimeDefaultCatalogContext());
  const [manualConsoleApi, setManualConsoleApi] =
    useState<SqlConsoleApi | null>(null);
  const [pendingSqlToInsert, setPendingSqlToInsert] = useState<string | null>(
    null,
  );
  const [isPreparingExample, setIsPreparingExample] = useState(false);
  const [exampleError, setExampleError] = useState<string | null>(null);
  const [hasExistingRuntimeTables, setHasExistingRuntimeTables] =
    useState(false);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [runtimeRefreshToken, setRuntimeRefreshToken] = useState(0);
  const [analysisCreateError, setAnalysisCreateError] = useState<string | null>(
    null,
  );
  const [hasAiConfiguration, setHasAiConfiguration] = useState(() =>
    hasRequiredAiConfigurationInStorage(),
  );
  const effectiveSqlBackend = useResolvedSqlBackend();
  const router = useRouter();
  const manualShellVariant: ManualShellVariant = "minimal";
  const isManualMode = mode === "manual";
  const exampleCommands = hasExistingRuntimeTables
    ? GENERIC_DATA_EXPLORATION_COMMANDS
    : EXAMPLE_COMMANDS;
  const homePageAiWarningMessage = getHomepageAiWarningMessage({
    mode,
    hasAiConfiguration,
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const syncAiConfiguration = () => {
      const storedConfiguration = hasRequiredAiConfigurationInStorage();
      setHasAiConfiguration(storedConfiguration);

      if (!storedConfiguration && effectiveSqlBackend === "bridge") {
        void hasRequiredAiConfigurationForBackend(effectiveSqlBackend).then(
          setHasAiConfiguration,
        );
      }
    };

    syncAiConfiguration();
    window.addEventListener("storage", syncAiConfiguration);
    window.addEventListener(AI_SETTINGS_UPDATED_EVENT, syncAiConfiguration);

    return () => {
      window.removeEventListener("storage", syncAiConfiguration);
      window.removeEventListener(
        AI_SETTINGS_UPDATED_EVENT,
        syncAiConfiguration,
      );
    };
  }, [effectiveSqlBackend]);

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

  // biome-ignore lint/correctness/useExhaustiveDependencies: runtimeRefreshToken intentionally rechecks table availability after homepage imports
  useEffect(() => {
    let isCancelled = false;

    void hasVisibleTablesInRuntime({
      backendPreference: effectiveSqlBackend,
      dbIdentifier: selectedDb,
    })
      .then((result) => {
        if (!isCancelled) {
          setHasExistingRuntimeTables(result.hasVisibleTables);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setHasExistingRuntimeTables(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [effectiveSqlBackend, runtimeRefreshToken, selectedDb]);

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

  const handleCreateBlankAnalysis = useCallback(() => {
    setAnalysisCreateError(null);
    void createBlankHomepageAnalysis({ navigate: router.push }).catch(
      (error) => {
        setAnalysisCreateError(
          error instanceof Error
            ? error.message
            : "Unable to create a new analysis.",
        );
      },
    );
  }, [router.push]);

  const handleInsertTableIntoSql = useCallback(
    (payload: ExplorerInsertPayload) => {
      if (payload.dbIdentifier) {
        setSelectedDb(payload.dbIdentifier);
      }

      setSelectedCatalogContext(payload.catalogContext ?? null);

      if (mode === "ai") {
        setPromptInput((current) =>
          appendExplorerReferenceToPrompt(current, payload.reference),
        );
        return;
      }

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
    [manualConsoleApi, mode],
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

  const quickActions: HomepageQuickAction[] = [
    {
      id: "new-analysis",
      label: "New analysis",
      description: "Open a clean notebook and start exploring.",
      icon: FilePlus2,
      emphasis: "primary",
      onClick: handleCreateBlankAnalysis,
    },
    {
      id: "recent-analyses",
      label: "Recent analyses",
      description: "Return to notebooks you worked on recently.",
      icon: Clock3,
      href: "/analysis/all",
    },
    {
      id: "sql-editor",
      label: "SQL editor",
      description: "Write and run a query directly against your data.",
      icon: SquareTerminal,
      href: "/sql-editor",
    },
    {
      id: "upload-data",
      label: "Upload data",
      description: "Import a CSV, Parquet, or Excel workbook.",
      icon: Upload,
      onClick: () => setIsUploadDialogOpen(true),
    },
  ];

  return (
    <div className="relative h-full w-full overflow-y-auto bg-background">
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        aria-hidden="true"
      >
        <div className="absolute left-1/2 top-[-28rem] h-[50rem] w-[50rem] -translate-x-1/2 rounded-full border border-primary/10" />
        <div className="absolute left-1/2 top-[-22rem] h-[39rem] w-[39rem] -translate-x-1/2 rounded-full border border-primary/10" />
        <div className="absolute left-1/2 top-[-15rem] h-[27rem] w-[27rem] -translate-x-1/2 rounded-full border border-primary/10" />
        <div
          className="absolute inset-x-0 top-0 h-[32rem]"
          style={{
            background:
              "radial-gradient(ellipse 55% 42% at 50% 0%, hsl(var(--primary) / 0.09), transparent 72%)",
          }}
        />
      </div>

      <main className="relative mx-auto flex min-h-full w-full max-w-7xl flex-col px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12">
        <header
          className={cn(
            "flex flex-col gap-7 transition-all duration-500 ease-out motion-reduce:transition-none sm:flex-row sm:items-end sm:justify-between",
            areSuggestionsVisible
              ? "translate-y-0 opacity-100"
              : "translate-y-2 opacity-0",
          )}
        >
          <div className="max-w-2xl">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex size-11 items-center justify-center overflow-hidden rounded-xl border border-border/70 bg-card/80 shadow-sm backdrop-blur-sm">
                <PondviewLogo
                  className="h-8 w-12"
                  title=""
                  aria-hidden="true"
                />
              </div>
              <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                Pondview workspace
              </span>
            </div>
            <h1 className="text-balance text-4xl font-black tracking-[-0.045em] text-foreground sm:text-5xl lg:text-6xl">
              Where should we dive in?
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
              Start with a notebook, work directly in SQL, or bring in fresh
              data for your next question.
            </p>
          </div>

          <Link
            href="/dashboards"
            className="group inline-flex w-fit items-center gap-2 rounded-full border border-border/70 bg-card/70 px-4 py-2 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur-sm transition-all hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <LayoutDashboard className="size-3.5 text-primary" />
            Dashboards
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </header>

        <section className="mt-10" aria-labelledby="quick-actions-heading">
          <div className="mb-3 flex items-center gap-2">
            <BarChart3 className="size-3.5 text-primary" aria-hidden="true" />
            <h2
              id="quick-actions-heading"
              className="font-mono text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground"
            >
              Quick actions
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {quickActions.map((action, index) => (
              <HomepageQuickActionCard
                key={action.id}
                {...action}
                index={index}
                visible={areSuggestionsVisible}
              />
            ))}
          </div>
          {analysisCreateError ? (
            <p className="mt-3 text-sm text-destructive" role="alert">
              {analysisCreateError}
            </p>
          ) : null}
        </section>

        <div
          className={cn(
            "mt-10 grid items-start gap-5 transition-all duration-500 ease-out motion-reduce:transition-none",
            isManualMode
              ? "grid-cols-1"
              : "grid-cols-1 lg:grid-cols-[minmax(0,1fr)_20rem]",
            areSuggestionsVisible
              ? "translate-y-0 opacity-100"
              : "translate-y-3 opacity-0",
          )}
          style={{
            transitionDelay: areSuggestionsVisible ? "320ms" : "0ms",
          }}
        >
          <section
            className="min-w-0 rounded-3xl border border-border/70 bg-card/70 p-4 shadow-sm backdrop-blur-sm sm:p-6"
            aria-labelledby="try-asking-heading"
          >
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2
                    id="try-asking-heading"
                    className="text-lg font-semibold tracking-tight text-foreground"
                  >
                    Try asking
                  </h2>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Ask in plain language or switch to manual SQL.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="hidden max-w-40 truncate font-mono text-[10px] text-muted-foreground sm:inline">
                  {selectedDb ?? "Choose a database"}
                </span>
                <ConnectedDataPanel
                  selectedDb={selectedDb}
                  onSelect={(db) => {
                    setSelectedDb(db);
                    setSelectedCatalogContext(null);
                  }}
                  mode="popover"
                  onInsertTable={handleInsertTableIntoSql}
                  refreshToken={runtimeRefreshToken}
                  sqlBackend={effectiveSqlBackend}
                  showCollapseToggle={false}
                  triggerLabel="Data context"
                  className="h-9 rounded-full px-3"
                />
              </div>
            </div>

            <div className="min-w-0">
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
                  saveQuery: async () => { },
                  isSavingQuery: false,
                  persistManualResultToChat: async () => { },
                }}
                manualVisualization={{
                  chartConfig: null,
                  cardConfig: null,
                  visualType: null,
                  handleReplResultChange: () => { },
                  focusManualVisualization: () => { },
                  createPayload: () => null,
                }}
                className="transition duration-300 ease-in-out"
                onHomePage={true}
                mode={mode}
                onModeChange={handleModeChange}
                onManualRunRequest={handleManualRun}
                manualShellVariant={manualShellVariant}
                selectedDb={selectedDb}
                selectedCatalogContext={selectedCatalogContext}
                promptValue={promptInput}
                onPromptChange={setPromptInput}
              />
              <PromptErrorBanner message={homePageAiWarningMessage} />
              <div
                className={cn(
                  "grid transition-[grid-template-rows,opacity,transform,margin] duration-300 ease-out",
                  isManualMode
                    ? "pointer-events-none mt-0 grid-rows-[0fr] -translate-y-2 opacity-0"
                    : "grid-rows-[1fr] translate-y-0 opacity-100",
                )}
              >
                <div className="min-h-0 overflow-hidden">
                  {exampleError ? (
                    <p className="mb-3 mt-4 text-center text-xs text-destructive">
                      {exampleError}
                    </p>
                  ) : null}
                  <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {exampleCommands.map((command, i) => (
                      <button
                        key={command}
                        type="button"
                        onClick={() => handleExampleClick(command)}
                        disabled={isPreparingExample}
                        className={cn(
                          "group rounded-xl border border-border/50 bg-background/55 px-4 py-3 text-left text-xs leading-relaxed text-foreground/80 transition-all duration-500 ease-out hover:border-primary/50 hover:bg-primary/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
                          isPreparingExample
                            ? "cursor-wait opacity-70"
                            : "cursor-pointer",
                          areSuggestionsVisible
                            ? "translate-y-0 opacity-100"
                            : "translate-y-2 opacity-0",
                        )}
                        style={{
                          transitionDelay: areSuggestionsVisible
                            ? `${400 + i * 75}ms`
                            : "0ms",
                        }}
                      >
                        <span className="flex items-center justify-between gap-3">
                          <span>
                            {isPreparingExample
                              ? "Adding sample data..."
                              : command}
                          </span>
                          <ArrowRight className="h-3.5 w-3.5 shrink-0 -translate-x-1 text-muted-foreground opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:text-primary group-hover:opacity-100" />
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <aside className="rounded-3xl border border-border/70 bg-card/70 p-5 shadow-sm backdrop-blur-sm">
            <RecentAnalysesSection
              visible={areSuggestionsVisible}
              className="mt-0"
            />
          </aside>
        </div>

        <footer className="mt-10 flex items-center justify-center gap-2 pb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground/60">
          <Database className="size-3" aria-hidden="true" />
          Query locally with DuckDB
        </footer>
      </main>

      <ConnectDataDialog
        open={isUploadDialogOpen}
        onOpenChange={setIsUploadDialogOpen}
        initialSelectedDatabase="local-file"
        effectiveSqlBackend={effectiveSqlBackend}
        onConnected={() =>
          setRuntimeRefreshToken((currentValue) => currentValue + 1)
        }
      />
    </div>
  );
}
