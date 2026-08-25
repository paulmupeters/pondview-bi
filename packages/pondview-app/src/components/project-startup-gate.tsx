import {
  ArrowLeft,
  ArrowRight,
  Check,
  Cloud,
  Database,
  FolderOpen,
  Globe,
  HardDrive,
  Loader2,
  type LucideIcon,
  Plus,
} from "lucide-react";
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useId,
  useState,
} from "react";
import {
  getBridgeProject,
  initializeBridgeProject,
  listBridgeProjectDatabasePaths,
  listBridgeProjectFiles,
  pickBridgeProjectDatabasePath,
} from "@/lib/bridge/pondview-bridge";
import {
  hydrateAndImportOpenProjectFromStore,
  setProjectRuntimeSelection,
} from "@/lib/project-runtime";
import {
  getProjectStoreMode,
  type OpenProjectState,
  setOpenProject,
  setProjectStoreMode,
} from "@/lib/project-store";
import {
  DEFAULT_WASM_DB_IDENTIFIER,
  refreshBridgeHealth,
  type SqlBackend,
  setSqlBackendPreferenceInStorage,
} from "@/lib/sql/sql-runtime";
import { useBridgeRuntimeState } from "@/lib/sql/use-sql-backend";
import { cn } from "@/lib/utils";
import { PondviewLogo } from "./pondview-logo";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

type StartupChoiceState = "checking" | "ready" | "hidden";
type StartupStep = 1 | 2;
export type StartupRuntimeChoice = "new-duckdb" | "existing-duckdb" | "wasm";
export type StartupStorageChoice = "local" | "browser";

export const DEFAULT_PROJECT_DATABASE_PATH = "runtime/pondview-runtime.duckdb";

const PREVIEW_PROJECT: OpenProjectState = {
  id: "preview-project",
  name: "example2",
  backingKind: "bridge-filesystem",
  openedAt: Date.now(),
  updatedAt: Date.now(),
  rootPath: "/Users/paulpeters/Developer/pondview/pondview-ui/example/example2",
};

type ProjectStartupGateViewProps = {
  project: OpenProjectState;
  runtimeChoice: StartupRuntimeChoice;
  duckDbPath: string;
  detectedDuckDbPaths: string[];
  configuredDatabasePath?: string;
  isWorking: boolean;
  isPickingDuckDbPath: boolean;
  error: string | null;
  onRuntimeChoiceChange: (value: StartupRuntimeChoice) => void;
  onDuckDbPathChange: (value: string) => void;
  onPickDuckDbPath: () => void;
  onQuickStart: () => void;
  onInitProject: () => void;
  onUseBrowser: () => void;
};

function ProjectStartupGateBackdrop() {
  return (
    <div
      className="pointer-events-none absolute -inset-x-6 -top-28 bottom-0 overflow-visible"
      aria-hidden="true"
    >
      <div className="startup-gate-ripple-ring" />
      <div className="startup-gate-ripple-ring startup-gate-ripple-ring-delay-1" />
      <div className="startup-gate-ripple-ring startup-gate-ripple-ring-delay-2" />
      <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-[52%]">
        <PondviewLogo
          title=""
          className="h-[min(72vw,28rem)] w-[min(72vw,28rem)] opacity-[0.05]"
          style={
            {
              "--secondary": "var(--primary)",
            } as CSSProperties
          }
        />
      </div>
    </div>
  );
}

export function resolveQuickStartDatabasePath(input: {
  configuredDatabasePath?: string;
  detectedDuckDbPaths: string[];
}): string | null {
  if (input.configuredDatabasePath?.trim()) {
    return input.configuredDatabasePath.trim();
  }

  if (input.detectedDuckDbPaths.length === 1) {
    return input.detectedDuckDbPaths[0] ?? null;
  }

  return null;
}

export function shouldShowQuickStart(input: {
  configuredDatabasePath?: string;
  detectedDuckDbPaths: string[];
}): boolean {
  return resolveQuickStartDatabasePath(input) !== null;
}

export function resolveInitialStartupRuntime(input: {
  configuredDatabasePath?: string;
  detectedDuckDbPaths: string[];
}): { choice: StartupRuntimeChoice; duckDbPath: string } {
  if (input.configuredDatabasePath) {
    return {
      choice: "existing-duckdb",
      duckDbPath: input.configuredDatabasePath,
    };
  }

  if (input.detectedDuckDbPaths.length === 1) {
    return {
      choice: "existing-duckdb",
      duckDbPath: input.detectedDuckDbPaths[0] ?? "",
    };
  }

  if (input.detectedDuckDbPaths.length > 1) {
    return {
      choice: "existing-duckdb",
      duckDbPath: "",
    };
  }

  return {
    choice: "new-duckdb",
    duckDbPath: DEFAULT_PROJECT_DATABASE_PATH,
  };
}

export function shouldHideStartupGateForBrowserProject(input: {
  projectStoreMode: ReturnType<typeof getProjectStoreMode>;
  hasProjectArtifacts: boolean;
  configuredDatabasePath?: string;
  detectedDuckDbPaths: string[];
}): boolean {
  if (input.projectStoreMode !== "browser-indexeddb") {
    return false;
  }

  if (input.hasProjectArtifacts) {
    return false;
  }

  return (
    !input.configuredDatabasePath?.trim() &&
    input.detectedDuckDbPaths.length === 0
  );
}

export function shouldAdoptBridgeFilesystemProject(input: {
  projectStoreMode: ReturnType<typeof getProjectStoreMode>;
  hasProjectArtifacts: boolean;
}): boolean {
  return (
    input.hasProjectArtifacts && input.projectStoreMode !== "bridge-filesystem"
  );
}

export function hasStartupProjectArtifacts(
  files: Array<{ path: string }>,
): boolean {
  return files.some((file) => file.path !== ".gitignore");
}

export function resolveStartupRuntimeSelection(input: {
  runtimeChoice: StartupRuntimeChoice;
  duckDbPath: string;
}): {
  backend: SqlBackend;
  databasePath?: string;
  dbIdentifier: string;
  catalogContext: string | null;
} {
  if (input.runtimeChoice === "wasm") {
    return {
      backend: "duckdb-wasm",
      dbIdentifier: DEFAULT_WASM_DB_IDENTIFIER,
      catalogContext: null,
    };
  }

  const normalizedPath = input.duckDbPath.trim();
  const databasePath =
    normalizedPath && normalizedPath.toLowerCase() !== "default"
      ? normalizedPath
      : DEFAULT_PROJECT_DATABASE_PATH;

  return {
    backend: "bridge",
    databasePath,
    dbIdentifier: databasePath,
    catalogContext: "main",
  };
}

export function validateStartupRuntime(input: {
  runtimeChoice: StartupRuntimeChoice;
  duckDbPath: string;
}): string | null {
  if (input.runtimeChoice === "existing-duckdb" && !input.duckDbPath.trim()) {
    return "Choose a DuckDB file before continuing.";
  }

  return null;
}

function formatDatabaseFileName(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const segments = normalized.split("/");
  return segments.at(-1) || path;
}

export function resolveStartupProjectDisplayPath(
  project: Pick<OpenProjectState, "name" | "rootPath">,
): string | null {
  const projectPath = project.rootPath?.trim() || project.name.trim();
  const normalizedPath = projectPath.replace(/\\/g, "/").replace(/\/+$/, "");

  if (
    normalizedPath.endsWith("/packages/cli") ||
    normalizedPath.endsWith("/packages/bridge")
  ) {
    return null;
  }

  return projectPath || null;
}

function StartupIntroPanel({
  project,
  step,
  showAllOptions,
}: {
  project: OpenProjectState;
  step: StartupStep;
  showAllOptions: boolean;
}) {
  const projectPath = resolveStartupProjectDisplayPath(project);
  const heading = showAllOptions
    ? `Set up ${project.name}`
    : `Open ${project.name}`;
  const description = showAllOptions
    ? step === 1
      ? "Choose the database Pondview should use."
      : "Choose where Pondview should save its project files."
    : "Pondview found a database for this project.";

  return (
    <div className="relative min-w-0 border-border border-b bg-gradient-to-br from-primary/10 via-muted/20 to-background p-5 sm:p-6 md:border-r md:border-b-0 md:p-8">
      <div
        className="pointer-events-none absolute inset-y-8 left-0 w-px bg-gradient-to-b from-transparent via-primary/50 to-transparent"
        aria-hidden="true"
      />

      <div className="flex h-full min-w-0 flex-col">
        <div
          className="startup-gate-intro-item flex items-center gap-2.5"
          style={{ animationDelay: "80ms" }}
        >
          <PondviewLogo
            title=""
            className="h-7 w-7 shrink-0 opacity-80"
            style={
              {
                "--secondary": "var(--primary)",
              } as CSSProperties
            }
          />
          <span className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.18em]">
            Pondview
          </span>
        </div>

        <div className="mt-7 sm:mt-9">
          <p
            className="startup-gate-intro-item font-mono text-[11px] text-primary uppercase tracking-[0.16em]"
            style={{ animationDelay: "120ms" }}
          >
            {showAllOptions ? `Step ${step} of 2` : "Ready to open"}
          </p>
          <h1
            id="startup-gate-title"
            className="startup-gate-display startup-gate-intro-item mt-2 break-words font-semibold text-[1.9rem] text-foreground leading-[1.05] tracking-tight sm:text-[2.25rem]"
            style={{ animationDelay: "160ms" }}
          >
            {heading}
          </h1>

          <p
            className="startup-gate-intro-item mt-3 max-w-sm text-muted-foreground text-sm leading-6"
            style={{ animationDelay: "200ms" }}
          >
            {description}
          </p>
        </div>

        {projectPath ? (
          <div
            className="startup-gate-intro-item mt-6 flex min-w-0 items-start gap-2 border-border/60 border-t pt-4 font-mono text-[11px] text-muted-foreground md:mt-auto md:pt-6"
            style={{ animationDelay: "240ms" }}
            title={projectPath}
          >
            <FolderOpen
              className="mt-0.5 h-3.5 w-3.5 shrink-0"
              aria-hidden="true"
            />
            <span className="truncate">{projectPath}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ProjectStartupGateView({
  project,
  runtimeChoice,
  duckDbPath,
  detectedDuckDbPaths,
  configuredDatabasePath,
  isWorking,
  isPickingDuckDbPath,
  error,
  onRuntimeChoiceChange,
  onDuckDbPathChange,
  onPickDuckDbPath,
  onQuickStart,
  onInitProject,
  onUseBrowser,
}: ProjectStartupGateViewProps) {
  const quickStartPath = resolveQuickStartDatabasePath({
    configuredDatabasePath,
    detectedDuckDbPaths,
  });
  const quickStartEligible = quickStartPath !== null;
  const [showAllOptions, setShowAllOptions] = useState(!quickStartEligible);
  const [step, setStep] = useState<StartupStep>(1);
  const [storageChoice, setStorageChoice] =
    useState<StartupStorageChoice>("local");
  const [localError, setLocalError] = useState<string | null>(null);
  const runtimeGroupId = useId();
  const storageGroupId = useId();
  const statusRegionId = useId();
  const displayError = error ?? localError;

  useEffect(() => {
    setShowAllOptions(!quickStartEligible);
    setStep(1);
    setStorageChoice("local");
    setLocalError(null);
  }, [quickStartEligible]);

  useEffect(() => {
    if (runtimeChoice === "wasm") {
      setStorageChoice("browser");
    }
    setLocalError(null);
  }, [runtimeChoice]);

  const handleContinue = () => {
    const validationError = validateStartupRuntime({
      runtimeChoice,
      duckDbPath,
    });
    if (validationError) {
      setLocalError(validationError);
      return;
    }

    setLocalError(null);
    setStep(2);
  };

  const handleOpenPondview = () => {
    if (storageChoice === "local") {
      onInitProject();
      return;
    }

    onUseBrowser();
  };

  const showQuickStart = quickStartEligible && !showAllOptions;
  const localStorageDisabled = runtimeChoice === "wasm";

  return (
    <div className="startup-gate-overlay fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background/95 px-4 py-4 backdrop-blur-sm md:items-center md:py-8">
      <div className="relative w-full max-w-4xl">
        <ProjectStartupGateBackdrop />

        <section
          className="startup-gate-panel relative z-10 w-full overflow-hidden border border-border/80 bg-background/92 shadow-[0_24px_80px_-24px_color-mix(in_oklch,var(--foreground)_28%,transparent)] backdrop-blur-xl"
          aria-labelledby="startup-gate-title"
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />

          <div className="grid min-w-0 gap-0 md:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)]">
            <StartupIntroPanel
              project={project}
              step={step}
              showAllOptions={showAllOptions}
            />

            <div className="min-w-0 p-4 sm:p-6">
              {showQuickStart ? (
                <QuickStartPanel
                  databasePath={quickStartPath ?? ""}
                  isWorking={isWorking}
                  onOpen={onQuickStart}
                  onShowAllOptions={() => setShowAllOptions(true)}
                />
              ) : (
                <div className="grid gap-5">
                  <StepIndicator currentStep={step} />

                  {step === 1 ? (
                    <RuntimeStep
                      groupId={runtimeGroupId}
                      runtimeChoice={runtimeChoice}
                      duckDbPath={duckDbPath}
                      detectedDuckDbPaths={detectedDuckDbPaths}
                      isWorking={isWorking}
                      isPickingDuckDbPath={isPickingDuckDbPath}
                      onRuntimeChoiceChange={onRuntimeChoiceChange}
                      onDuckDbPathChange={onDuckDbPathChange}
                      onPickDuckDbPath={onPickDuckDbPath}
                    />
                  ) : (
                    <StorageStep
                      groupId={storageGroupId}
                      storageChoice={storageChoice}
                      localStorageDisabled={localStorageDisabled}
                      isWorking={isWorking}
                      onStorageChoiceChange={setStorageChoice}
                    />
                  )}

                  <div
                    className={cn(
                      "startup-gate-footer flex min-w-0 flex-wrap items-center gap-3 border-border border-t pt-4",
                      step === 2 ? "justify-between" : "justify-end",
                    )}
                  >
                    {step === 2 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="rounded-none px-2 font-mono text-[11px] uppercase tracking-[0.14em]"
                        disabled={isWorking}
                        onClick={() => setStep(1)}
                      >
                        <ArrowLeft
                          className="mr-1.5 h-3.5 w-3.5"
                          aria-hidden="true"
                        />
                        Back
                      </Button>
                    ) : null}

                    {step === 1 ? (
                      <Button
                        type="button"
                        className="startup-gate-primary-action rounded-none px-5 font-medium"
                        disabled={
                          isWorking ||
                          validateStartupRuntime({
                            runtimeChoice,
                            duckDbPath,
                          }) !== null
                        }
                        onClick={handleContinue}
                      >
                        Continue
                        <ArrowRight
                          className="ml-2 h-4 w-4"
                          aria-hidden="true"
                        />
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        className="startup-gate-primary-action rounded-none px-5 font-medium"
                        disabled={isWorking}
                        onClick={handleOpenPondview}
                      >
                        {isWorking ? (
                          <>
                            <Loader2
                              className="mr-2 h-4 w-4 animate-spin"
                              aria-hidden="true"
                            />
                            Opening…
                          </>
                        ) : (
                          <>
                            Open Pondview
                            <ArrowRight
                              className="ml-2 h-4 w-4"
                              aria-hidden="true"
                            />
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              )}

              <div
                id={statusRegionId}
                aria-live="polite"
                aria-atomic="true"
                className="startup-gate-footer"
              >
                {isWorking && showQuickStart ? (
                  <p className="mt-4 flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground uppercase tracking-[0.16em]">
                    <Loader2
                      className="h-3.5 w-3.5 animate-spin"
                      aria-hidden="true"
                    />
                    Opening…
                  </p>
                ) : null}

                {displayError ? (
                  <p className="mt-3 border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive text-sm">
                    {displayError}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function QuickStartPanel({
  databasePath,
  isWorking,
  onOpen,
  onShowAllOptions,
}: {
  databasePath: string;
  isWorking: boolean;
  onOpen: () => void;
  onShowAllOptions: () => void;
}) {
  const fileName = formatDatabaseFileName(databasePath);

  return (
    <div className="grid gap-5">
      <div
        className="startup-gate-choice flex min-w-0 items-start gap-4 border border-primary/25 bg-primary/5 p-5"
        style={{ animationDelay: "80ms" }}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center border border-primary/25 bg-background/70">
          <Database className="h-5 w-5 text-primary" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.14em]">
            Database ready
          </p>
          <p className="startup-gate-display mt-1.5 truncate font-medium text-2xl text-foreground tracking-tight">
            {fileName}
          </p>
          {databasePath !== fileName ? (
            <p className="mt-2 truncate font-mono text-[11px] text-muted-foreground">
              {databasePath}
            </p>
          ) : null}
        </div>
      </div>

      <div className="startup-gate-footer grid gap-3">
        <Button
          type="button"
          className="startup-gate-primary-action h-11 rounded-none font-medium"
          disabled={isWorking}
          onClick={onOpen}
        >
          {isWorking ? (
            <>
              <Loader2
                className="mr-2 h-4 w-4 animate-spin"
                aria-hidden="true"
              />
              Opening…
            </>
          ) : (
            <>
              Open project
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
            </>
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="rounded-none font-mono text-[11px] text-muted-foreground uppercase tracking-[0.14em]"
          disabled={isWorking}
          onClick={onShowAllOptions}
        >
          Change setup
        </Button>
      </div>
    </div>
  );
}

function StepIndicator({ currentStep }: { currentStep: StartupStep }) {
  return (
    <nav
      className="startup-gate-intro-item flex min-w-0 items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em]"
      style={{ animationDelay: "60ms" }}
      aria-label={`Setup progress, step ${currentStep} of 2`}
    >
      <StepPill active={currentStep === 1} label="Database" step={1} />
      <span className="h-px min-w-3 flex-1 bg-border/80" aria-hidden="true" />
      <StepPill active={currentStep === 2} label="Project files" step={2} />
    </nav>
  );
}

function StepPill({
  active,
  label,
  step,
}: {
  active: boolean;
  label: string;
  step: StartupStep;
}) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center gap-2 border px-2.5 py-1.5 transition-colors",
        active
          ? "border-primary/50 bg-primary/10 text-foreground"
          : "border-border/70 text-muted-foreground",
      )}
    >
      <span
        className={cn(
          "flex h-4 w-4 items-center justify-center rounded-full text-[9px]",
          active
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground",
        )}
        aria-hidden="true"
      >
        {step}
      </span>
      {label}
    </span>
  );
}

function RuntimeStep({
  groupId,
  runtimeChoice,
  duckDbPath,
  detectedDuckDbPaths,
  isWorking,
  isPickingDuckDbPath,
  onRuntimeChoiceChange,
  onDuckDbPathChange,
  onPickDuckDbPath,
}: {
  groupId: string;
  runtimeChoice: StartupRuntimeChoice;
  duckDbPath: string;
  detectedDuckDbPaths: string[];
  isWorking: boolean;
  isPickingDuckDbPath: boolean;
  onRuntimeChoiceChange: (value: StartupRuntimeChoice) => void;
  onDuckDbPathChange: (value: string) => void;
  onPickDuckDbPath: () => void;
}) {
  return (
    <fieldset className="grid min-w-0 gap-3 border-0 p-0">
      <legend className="mb-1 font-mono text-[11px] text-muted-foreground uppercase tracking-[0.14em]">
        Choose a database
      </legend>
      <div
        id={groupId}
        role="radiogroup"
        aria-label="Database"
        className="grid min-w-0 gap-3"
      >
        <RadioChoiceCard
          name={`${groupId}-runtime`}
          value="new-duckdb"
          icon={Plus}
          title="Create a new database"
          description="Create a DuckDB file inside this project."
          selected={runtimeChoice === "new-duckdb"}
          disabled={isWorking}
          delayMs={80}
          onSelect={() => onRuntimeChoiceChange("new-duckdb")}
        />
        <RadioChoiceCard
          name={`${groupId}-runtime`}
          value="existing-duckdb"
          icon={Database}
          title="Open a DuckDB file"
          description="Use a database from this project or choose another file."
          selected={runtimeChoice === "existing-duckdb"}
          disabled={isWorking}
          delayMs={110}
          onSelect={() => onRuntimeChoiceChange("existing-duckdb")}
        >
          <ExistingDatabasePicker
            duckDbPath={duckDbPath}
            detectedDuckDbPaths={detectedDuckDbPaths}
            isWorking={isWorking}
            isPickingDuckDbPath={isPickingDuckDbPath}
            onDuckDbPathChange={onDuckDbPathChange}
            onPickDuckDbPath={onPickDuckDbPath}
          />
        </RadioChoiceCard>
        <RadioChoiceCard
          name={`${groupId}-runtime`}
          value="wasm"
          icon={Globe}
          title="Use a browser database"
          description="Run locally in this browser without creating a database file."
          selected={runtimeChoice === "wasm"}
          disabled={isWorking}
          delayMs={140}
          onSelect={() => onRuntimeChoiceChange("wasm")}
        />
      </div>
    </fieldset>
  );
}

function ExistingDatabasePicker({
  duckDbPath,
  detectedDuckDbPaths,
  isWorking,
  isPickingDuckDbPath,
  onDuckDbPathChange,
  onPickDuckDbPath,
}: {
  duckDbPath: string;
  detectedDuckDbPaths: string[];
  isWorking: boolean;
  isPickingDuckDbPath: boolean;
  onDuckDbPathChange: (value: string) => void;
  onPickDuckDbPath: () => void;
}) {
  const isDetectedPath = detectedDuckDbPaths.includes(duckDbPath);
  const [showPathInput, setShowPathInput] = useState(
    detectedDuckDbPaths.length === 0 || !isDetectedPath,
  );

  useEffect(() => {
    if (detectedDuckDbPaths.length === 0 || !isDetectedPath) {
      setShowPathInput(true);
    }
  }, [detectedDuckDbPaths.length, isDetectedPath]);

  return (
    <div className="grid min-w-0 gap-2">
      <label
        htmlFor="startup-duckdb-path"
        className="block font-mono text-[11px] text-muted-foreground uppercase tracking-[0.14em]"
      >
        {detectedDuckDbPaths.length > 0
          ? "Detected in this project"
          : "Database path"}
      </label>
      {detectedDuckDbPaths.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {detectedDuckDbPaths.map((path) => (
            <Button
              key={path}
              type="button"
              variant={duckDbPath === path ? "default" : "outline"}
              size="sm"
              className="h-7 rounded-none px-2 font-mono text-[11px]"
              disabled={isWorking || isPickingDuckDbPath}
              onClick={() => {
                onDuckDbPathChange(path);
                setShowPathInput(false);
              }}
            >
              {path}
            </Button>
          ))}
        </div>
      ) : null}
      {showPathInput ? (
        <div className="grid min-w-0 gap-2">
          {detectedDuckDbPaths.length > 0 ? (
            <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.14em]">
              Or enter another path
            </span>
          ) : null}
          <div className="flex min-w-0 gap-2">
            <Input
              id="startup-duckdb-path"
              value={isDetectedPath ? "" : duckDbPath}
              onChange={(event) =>
                onDuckDbPathChange(event.currentTarget.value)
              }
              disabled={isWorking || isPickingDuckDbPath}
              placeholder="Choose a .duckdb file"
              className="h-8 min-w-0 flex-1 rounded-none border-border/70 bg-background/70 font-mono text-xs shadow-none"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8 shrink-0 rounded-none border-border/70 bg-background/70 shadow-none"
              disabled={isWorking || isPickingDuckDbPath}
              onClick={onPickDuckDbPath}
              title="Choose DuckDB file"
              aria-label="Choose DuckDB file"
            >
              {isPickingDuckDbPath ? (
                <Loader2
                  className="h-3.5 w-3.5 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 rounded-none px-2 text-muted-foreground text-xs"
            disabled={isWorking || isPickingDuckDbPath}
            onClick={() => setShowPathInput(true)}
          >
            Enter a path
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 rounded-none px-2 text-xs"
            disabled={isWorking || isPickingDuckDbPath}
            onClick={onPickDuckDbPath}
          >
            {isPickingDuckDbPath ? (
              <Loader2
                className="mr-1.5 h-3.5 w-3.5 animate-spin"
                aria-hidden="true"
              />
            ) : (
              <FolderOpen className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            )}
            Choose another file
          </Button>
        </div>
      )}
    </div>
  );
}

function StorageStep({
  groupId,
  storageChoice,
  localStorageDisabled,
  isWorking,
  onStorageChoiceChange,
}: {
  groupId: string;
  storageChoice: StartupStorageChoice;
  localStorageDisabled: boolean;
  isWorking: boolean;
  onStorageChoiceChange: (value: StartupStorageChoice) => void;
}) {
  return (
    <fieldset className="grid min-w-0 gap-3 border-0 p-0">
      <legend className="mb-1 font-mono text-[11px] text-muted-foreground uppercase tracking-[0.14em]">
        Where should Pondview save project files?
      </legend>
      <div
        id={groupId}
        role="radiogroup"
        aria-label="Project storage"
        className="grid min-w-0 gap-3"
      >
        <RadioChoiceCard
          name={`${groupId}-storage`}
          value="local"
          icon={HardDrive}
          title="Save to this folder"
          description={
            localStorageDisabled
              ? "Unavailable with browser-only runtime. Pick a local database on the previous step."
              : "Keep Pondview project files and settings with this project."
          }
          selected={storageChoice === "local"}
          disabled={isWorking || localStorageDisabled}
          delayMs={80}
          onSelect={() => onStorageChoiceChange("local")}
        />
        <RadioChoiceCard
          name={`${groupId}-storage`}
          value="browser"
          icon={Cloud}
          title="Save in this browser"
          description="Keep Pondview state in this browser without creating project files."
          selected={storageChoice === "browser"}
          disabled={isWorking}
          delayMs={110}
          onSelect={() => onStorageChoiceChange("browser")}
        />
      </div>
    </fieldset>
  );
}

export function ProjectStartupGatePreview() {
  return (
    <ProjectStartupGateView
      project={PREVIEW_PROJECT}
      runtimeChoice="existing-duckdb"
      duckDbPath="analytics.duckdb"
      detectedDuckDbPaths={["analytics.duckdb"]}
      isWorking={false}
      isPickingDuckDbPath={false}
      error={null}
      onRuntimeChoiceChange={() => {}}
      onDuckDbPathChange={() => {}}
      onPickDuckDbPath={() => {}}
      onQuickStart={() => {}}
      onInitProject={() => {}}
      onUseBrowser={() => {}}
    />
  );
}

function createBrowserProject(projectName: string): OpenProjectState {
  const now = Date.now();
  const suffix =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : String(now);

  return {
    id: `browser-project-${suffix}`,
    name: projectName,
    backingKind: "browser-indexeddb",
    openedAt: now,
    updatedAt: now,
    defaultSourceRef: "local",
  };
}

type ProjectManifestSourceBindingInput = {
  runtimeBackend: SqlBackend;
  dbIdentifier: string;
  catalogContext: string | null;
};

export function createProjectManifest(
  projectName: string,
  sourceBinding?: ProjectManifestSourceBindingInput | null,
): string {
  return `${JSON.stringify(
    {
      schemaVersion: 1,
      name: projectName,
      ...(sourceBinding
        ? {
            defaultSourceRef: "local",
            sourceBindings: {
              local: {
                runtimeBackend: sourceBinding.runtimeBackend,
                dbIdentifier: sourceBinding.dbIdentifier,
                catalogContext: sourceBinding.catalogContext,
              },
            },
          }
        : {}),
    },
    null,
    2,
  )}\n`;
}

export function createProjectGitignore(): string {
  return ".pondview/\n";
}

export function createLocalSourceBindings(input: {
  runtimeBackend: SqlBackend;
  dbIdentifier: string;
  catalogContext: string | null;
}): string {
  return `${JSON.stringify(
    {
      schemaVersion: 1,
      bindings: {
        local: {
          runtimeBackend: input.runtimeBackend,
          dbIdentifier: input.dbIdentifier,
          catalogContext: input.catalogContext,
        },
      },
    },
    null,
    2,
  )}\n`;
}

export function ProjectStartupGate() {
  const bridgeRuntime = useBridgeRuntimeState();
  const [state, setState] = useState<StartupChoiceState>("checking");
  const [project, setProject] = useState<OpenProjectState | null>(null);
  const [runtimeChoice, setRuntimeChoice] =
    useState<StartupRuntimeChoice>("new-duckdb");
  const [duckDbPath, setDuckDbPath] = useState(DEFAULT_PROJECT_DATABASE_PATH);
  const [detectedDuckDbPaths, setDetectedDuckDbPaths] = useState<string[]>([]);
  const [configuredDatabasePath, setConfiguredDatabasePath] = useState<
    string | undefined
  >();
  const [error, setError] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [isPickingDuckDbPath, setIsPickingDuckDbPath] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function checkProject() {
      if (!bridgeRuntime.isQueryReady) {
        setState("hidden");
        return;
      }

      setState("checking");
      try {
        const [{ project }, { files }, databasePaths] = await Promise.all([
          getBridgeProject(),
          listBridgeProjectFiles(),
          listBridgeProjectDatabasePaths(),
        ]);
        if (cancelled) {
          return;
        }

        setProject(project);
        setDetectedDuckDbPaths(databasePaths.paths);
        setConfiguredDatabasePath(databasePaths.configuredDatabasePath);
        const hasProjectArtifacts = hasStartupProjectArtifacts(files);
        const projectStoreMode = getProjectStoreMode(project.id);
        if (
          project &&
          shouldHideStartupGateForBrowserProject({
            projectStoreMode,
            hasProjectArtifacts,
            configuredDatabasePath: databasePaths.configuredDatabasePath,
            detectedDuckDbPaths: databasePaths.paths,
          })
        ) {
          setState("hidden");
          return;
        }
        const initialRuntime = resolveInitialStartupRuntime({
          configuredDatabasePath: databasePaths.configuredDatabasePath,
          detectedDuckDbPaths: databasePaths.paths,
        });
        setRuntimeChoice(initialRuntime.choice);
        setDuckDbPath(initialRuntime.duckDbPath);
        if (hasProjectArtifacts) {
          if (
            shouldAdoptBridgeFilesystemProject({
              projectStoreMode,
              hasProjectArtifacts,
            })
          ) {
            setProjectStoreMode(project.id, "bridge-filesystem");
          }
          await hydrateAndImportOpenProjectFromStore();
          if (cancelled) {
            return;
          }
          setState("hidden");
          return;
        }

        setState("ready");
      } catch {
        if (!cancelled) {
          setState("hidden");
        }
      }
    }

    void checkProject();
    return () => {
      cancelled = true;
    };
  }, [bridgeRuntime.isQueryReady]);

  if (state !== "ready" || !project) {
    return null;
  }

  const persistRuntimeSelection = (
    targetProject: OpenProjectState,
    selection: ReturnType<typeof resolveStartupRuntimeSelection>,
  ) => {
    setProjectRuntimeSelection({
      projectId: targetProject.id,
      sourceRef: "local",
      runtimeBackend: selection.backend,
      dbIdentifier: selection.dbIdentifier,
      catalogContext: selection.catalogContext,
      setupSql: null,
    });
    setSqlBackendPreferenceInStorage(selection.backend);
  };

  const handleRuntimeChoiceChange = (choice: StartupRuntimeChoice) => {
    setRuntimeChoice(choice);
    setError(null);
    if (choice === "new-duckdb") {
      setDuckDbPath(DEFAULT_PROJECT_DATABASE_PATH);
    } else if (
      choice === "existing-duckdb" &&
      !duckDbPath.trim() &&
      detectedDuckDbPaths.length === 1
    ) {
      setDuckDbPath(detectedDuckDbPaths[0] ?? "");
    }
  };

  const handleInitProject = async () => {
    const validationError = validateStartupRuntime({
      runtimeChoice,
      duckDbPath,
    });
    if (validationError) {
      setError(validationError);
      return;
    }
    if (runtimeChoice === "wasm") {
      setError("Saving to this folder requires a local database runtime.");
      return;
    }

    setIsWorking(true);
    setError(null);
    try {
      const runtimeSelection = resolveStartupRuntimeSelection({
        runtimeChoice,
        duckDbPath,
      });
      setProjectStoreMode(project.id, "bridge-filesystem");
      await initializeBridgeProject({
        files: [
          {
            path: ".gitignore",
            content: createProjectGitignore(),
          },
          {
            path: "pondview/project.json",
            content: createProjectManifest(project.name, {
              runtimeBackend: runtimeSelection.backend,
              dbIdentifier: runtimeSelection.dbIdentifier,
              catalogContext: runtimeSelection.catalogContext,
            }),
          },
        ],
        ...(runtimeSelection.databasePath
          ? { databasePath: runtimeSelection.databasePath }
          : {}),
      });
      await refreshBridgeHealth();
      await hydrateAndImportOpenProjectFromStore();
      setState("hidden");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Failed to initialize.",
      );
    } finally {
      setIsWorking(false);
    }
  };

  const handleUseBrowser = async () => {
    const validationError = validateStartupRuntime({
      runtimeChoice,
      duckDbPath,
    });
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsWorking(true);
    setError(null);
    try {
      const runtimeSelection = resolveStartupRuntimeSelection({
        runtimeChoice,
        duckDbPath,
      });
      if (runtimeSelection.backend === "bridge") {
        await initializeBridgeProject({
          files: [],
          ...(runtimeSelection.databasePath
            ? { databasePath: runtimeSelection.databasePath }
            : {}),
        });
        await refreshBridgeHealth();
      }
      const browserProject = createBrowserProject(project.name);
      setProjectStoreMode(project.id, "browser-indexeddb");
      await setOpenProject(browserProject);
      persistRuntimeSelection(browserProject, runtimeSelection);
      setState("hidden");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Failed to switch to browser mode.",
      );
    } finally {
      setIsWorking(false);
    }
  };

  const handleQuickStart = async () => {
    const quickStartPath = resolveQuickStartDatabasePath({
      configuredDatabasePath,
      detectedDuckDbPaths,
    });
    if (!quickStartPath) {
      setError("Choose a DuckDB file before continuing.");
      return;
    }

    setRuntimeChoice("existing-duckdb");
    setDuckDbPath(quickStartPath);
    setIsWorking(true);
    setError(null);

    try {
      const runtimeSelection = resolveStartupRuntimeSelection({
        runtimeChoice: "existing-duckdb",
        duckDbPath: quickStartPath,
      });
      setProjectStoreMode(project.id, "bridge-filesystem");
      await initializeBridgeProject({
        files: [
          {
            path: ".gitignore",
            content: createProjectGitignore(),
          },
          {
            path: "pondview/project.json",
            content: createProjectManifest(project.name, {
              runtimeBackend: runtimeSelection.backend,
              dbIdentifier: runtimeSelection.dbIdentifier,
              catalogContext: runtimeSelection.catalogContext,
            }),
          },
        ],
        ...(runtimeSelection.databasePath
          ? { databasePath: runtimeSelection.databasePath }
          : {}),
      });
      await refreshBridgeHealth();
      await hydrateAndImportOpenProjectFromStore();
      setState("hidden");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Failed to initialize.",
      );
    } finally {
      setIsWorking(false);
    }
  };

  const handlePickDuckDbPath = async () => {
    setIsPickingDuckDbPath(true);
    setError(null);
    try {
      const result = await pickBridgeProjectDatabasePath();
      if (result.path) {
        setRuntimeChoice("existing-duckdb");
        setDuckDbPath(result.path);
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Failed to choose DuckDB file.",
      );
    } finally {
      setIsPickingDuckDbPath(false);
    }
  };

  return (
    <ProjectStartupGateView
      project={project}
      runtimeChoice={runtimeChoice}
      duckDbPath={duckDbPath}
      detectedDuckDbPaths={detectedDuckDbPaths}
      configuredDatabasePath={configuredDatabasePath}
      isWorking={isWorking}
      isPickingDuckDbPath={isPickingDuckDbPath}
      error={error}
      onRuntimeChoiceChange={handleRuntimeChoiceChange}
      onDuckDbPathChange={setDuckDbPath}
      onPickDuckDbPath={handlePickDuckDbPath}
      onQuickStart={() => void handleQuickStart()}
      onInitProject={() => void handleInitProject()}
      onUseBrowser={() => void handleUseBrowser()}
    />
  );
}

function RadioChoiceCard({
  name,
  value,
  icon: Icon,
  title,
  description,
  selected,
  disabled,
  delayMs,
  onSelect,
  children,
}: {
  name: string;
  value: string;
  icon: LucideIcon;
  title: string;
  description: string;
  selected: boolean;
  disabled: boolean;
  delayMs: number;
  onSelect: () => void;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "startup-gate-choice group relative min-w-0 w-full overflow-hidden rounded-none border border-border/80 bg-background/70 text-left transition-[border-color,background-color,transform,box-shadow] duration-300",
        !disabled &&
          "hover:-translate-y-0.5 hover:border-primary/40 hover:bg-primary/5 hover:shadow-[0_12px_32px_-20px_color-mix(in_oklch,var(--primary)_55%,transparent)]",
        disabled && "pointer-events-none opacity-50",
        selected && "border-primary/60 bg-primary/5",
      )}
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <label className="flex cursor-pointer items-start gap-4 p-4">
        <input
          type="radio"
          name={name}
          value={value}
          checked={selected}
          disabled={disabled}
          onChange={onSelect}
          className="sr-only"
        />
        <span className="startup-gate-choice-icon flex h-10 w-10 shrink-0 items-center justify-center border border-border bg-background">
          <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-foreground">{title}</span>
          <span className="mt-1 block whitespace-normal text-muted-foreground text-xs leading-5">
            {description}
          </span>
        </span>
        <span
          className={cn(
            "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
            selected
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-background",
          )}
          aria-hidden="true"
        >
          {selected ? <Check className="h-2.5 w-2.5" /> : null}
        </span>
      </label>
      {selected && children ? (
        <div className="border-border/60 border-t bg-muted/15 px-4 py-3">
          {children}
        </div>
      ) : null}
    </div>
  );
}
