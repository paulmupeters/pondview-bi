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
    input.hasProjectArtifacts &&
    input.projectStoreMode !== "bridge-filesystem"
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

  return (
    <div className="relative order-2 border-border border-b bg-gradient-to-br from-primary/10 via-muted/20 to-background p-6 sm:p-8 md:order-1 md:border-r md:border-b-0">
      <div
        className="pointer-events-none absolute inset-y-8 left-0 w-px bg-gradient-to-b from-transparent via-primary/50 to-transparent"
        aria-hidden="true"
      />

      {projectPath ? (
        <div
          className="startup-gate-intro-item mb-5 flex min-w-0 items-start gap-2 font-mono text-[11px] text-muted-foreground"
          style={{ animationDelay: "80ms" }}
          title={projectPath}
        >
          <FolderOpen
            className="mt-0.5 h-3.5 w-3.5 shrink-0"
            aria-hidden="true"
          />
          <span className="truncate">{projectPath}</span>
        </div>
      ) : null}

      <h1
        id="startup-gate-title"
        className="startup-gate-display startup-gate-intro-item font-semibold text-[2rem] text-foreground leading-[1.05] tracking-tight sm:text-[2.35rem]"
        style={{ animationDelay: "160ms" }}
      >
        Open the Pond
      </h1>

      <p
        className="startup-gate-intro-item mt-4 max-w-sm text-muted-foreground text-sm leading-6"
        style={{ animationDelay: "240ms" }}
      >
        {showAllOptions
          ? step === 1
            ? "Choose where queries run, then pick where Pondview saves your project."
            : "Decide whether project files live in this folder or in browser storage."
          : "We found a database in this folder. Open it now, or choose a different setup."}
      </p>

      <div
        className="startup-gate-intro-item mt-8 flex items-center gap-3"
        style={{ animationDelay: "320ms" }}
      >
        <PondviewLogo
          title=""
          className="h-10 w-10 shrink-0 opacity-80"
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
    <div className="startup-gate-overlay fixed inset-0 z-50 flex items-center justify-center bg-background/95 px-4 backdrop-blur-sm">
      <div className="relative w-full max-w-4xl">
        <ProjectStartupGateBackdrop />

        <section
          className="startup-gate-panel relative z-10 w-full overflow-hidden border border-border/80 bg-background/92 shadow-[0_24px_80px_-24px_color-mix(in_oklch,var(--foreground)_28%,transparent)] backdrop-blur-xl"
          aria-labelledby="startup-gate-title"
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />

          <div className="grid gap-0 md:grid-cols-[0.92fr_1.08fr]">
            <StartupIntroPanel
              project={project}
              step={step}
              showAllOptions={showAllOptions}
            />

            <div className="order-1 p-4 sm:p-6 md:order-2">
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

                  <div className="startup-gate-footer flex flex-wrap items-center justify-between gap-3 border-border border-t pt-4">
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
                    ) : (
                      <span aria-hidden="true" />
                    )}

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
        className="startup-gate-choice border border-primary/25 bg-primary/5 p-5"
        style={{ animationDelay: "420ms" }}
      >
        <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.16em]">
          Detected database
        </p>
        <p className="startup-gate-display mt-2 font-medium text-2xl text-foreground tracking-tight">
          {fileName}
        </p>
        <p className="mt-2 font-mono text-[11px] text-muted-foreground">
          {databasePath}
        </p>
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
              Open with this database
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
          Choose another setup
        </Button>
      </div>
    </div>
  );
}

function StepIndicator({ currentStep }: { currentStep: StartupStep }) {
  return (
    <nav
      className="startup-gate-intro-item flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.16em]"
      style={{ animationDelay: "380ms" }}
      aria-label={`Setup progress, step ${currentStep} of 2`}
    >
      <StepPill active={currentStep === 1} label="Runtime" />
      <span className="text-border" aria-hidden="true">
        /
      </span>
      <StepPill active={currentStep === 2} label="Storage" />
    </nav>
  );
}

function StepPill({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      className={cn(
        "border px-2 py-1 transition-colors",
        active
          ? "border-primary/50 bg-primary/10 text-foreground"
          : "border-border/70 text-muted-foreground",
      )}
    >
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
    <fieldset className="grid gap-3 border-0 p-0">
      <legend className="mb-1 font-mono text-[10px] text-muted-foreground uppercase tracking-[0.16em]">
        Where should queries run?
      </legend>
      <div
        id={groupId}
        role="radiogroup"
        aria-label="Query runtime"
        className="grid gap-3"
      >
        <RadioChoiceCard
          name={`${groupId}-runtime`}
          value="new-duckdb"
          icon={Plus}
          title="Create new database"
          description="Start with a fresh DuckDB file in this project folder."
          selected={runtimeChoice === "new-duckdb"}
          disabled={isWorking}
          delayMs={440}
          onSelect={() => onRuntimeChoiceChange("new-duckdb")}
        />
        <RadioChoiceCard
          name={`${groupId}-runtime`}
          value="existing-duckdb"
          icon={Database}
          title="Use existing database"
          description="Open a DuckDB file from this folder or pick another path."
          selected={runtimeChoice === "existing-duckdb"}
          disabled={isWorking}
          delayMs={500}
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
          title="Run in browser only"
          description="Use DuckDB in the browser without a local database file."
          selected={runtimeChoice === "wasm"}
          disabled={isWorking}
          delayMs={580}
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
  return (
    <div className="grid gap-2">
      <label
        htmlFor="startup-duckdb-path"
        className="block font-mono text-[10px] text-muted-foreground uppercase tracking-[0.16em]"
      >
        Database file
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
              onClick={() => onDuckDbPathChange(path)}
            >
              {path}
            </Button>
          ))}
        </div>
      ) : null}
      <div className="flex gap-2">
        <Input
          id="startup-duckdb-path"
          value={duckDbPath}
          onChange={(event) => onDuckDbPathChange(event.currentTarget.value)}
          disabled={isWorking || isPickingDuckDbPath}
          placeholder="Choose a .duckdb file"
          className="h-8 rounded-none border-border/70 bg-background/70 font-mono text-xs shadow-none"
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
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
          )}
        </Button>
      </div>
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
    <fieldset className="grid gap-3 border-0 p-0">
      <legend className="mb-1 font-mono text-[10px] text-muted-foreground uppercase tracking-[0.16em]">
        Where should Pondview save your project?
      </legend>
      <div
        id={groupId}
        role="radiogroup"
        aria-label="Project storage"
        className="grid gap-3"
      >
        <RadioChoiceCard
          name={`${groupId}-storage`}
          value="local"
          icon={HardDrive}
          title="Save to this folder"
          description={
            localStorageDisabled
              ? "Unavailable with browser-only runtime. Pick a local database on the previous step."
              : "Create Pondview project files here so work stays with the repo."
          }
          selected={storageChoice === "local"}
          disabled={isWorking || localStorageDisabled}
          delayMs={620}
          onSelect={() => onStorageChoiceChange("local")}
        />
        <RadioChoiceCard
          name={`${groupId}-storage`}
          value="browser"
          icon={Cloud}
          title="Keep in browser storage"
          description="Skip project files for now and store state in this browser."
          selected={storageChoice === "browser"}
          disabled={isWorking}
          delayMs={680}
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
        "startup-gate-choice group relative w-full overflow-hidden rounded-none border border-border/80 bg-background/70 text-left transition-[border-color,background-color,transform,box-shadow] duration-300",
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
