import {
  ArrowRight,
  Database,
  FolderOpen,
  HardDrive,
  Loader2,
  type LucideIcon,
  Monitor,
} from "lucide-react";
import { type CSSProperties, useEffect, useState } from "react";
import {
  getBridgeProject,
  initializeBridgeProject,
  listBridgeProjectFiles,
  pickBridgeProjectDatabasePath,
} from "@/lib/bridge/pondview-bridge";
import { hydrateAndImportOpenProjectFromStore } from "@/lib/project-runtime";
import {
  type OpenProjectState,
  setOpenProject,
  setProjectStoreMode,
} from "@/lib/project-store";
import { refreshBridgeHealth } from "@/lib/sql/sql-runtime";
import { useBridgeRuntimeState } from "@/lib/sql/use-sql-backend";
import { cn } from "@/lib/utils";
import { PondviewLogo } from "./pondview-logo";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

type StartupChoiceState = "checking" | "ready" | "hidden";

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
  duckDbPath: string;
  isWorking: boolean;
  isPickingDuckDbPath: boolean;
  error: string | null;
  onDuckDbPathChange: (value: string) => void;
  onPickDuckDbPath: () => void;
  onInitProject: () => void;
  onUseBrowser: () => void;
};

function ProjectStartupGateBackdrop() {
  return (
    <div
      className="pointer-events-none absolute -inset-x-6 -top-28 bottom-0 overflow-visible"
      aria-hidden="true"
    >
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

export function ProjectStartupGateView({
  project,
  duckDbPath,
  isWorking,
  isPickingDuckDbPath,
  error,
  onDuckDbPathChange,
  onPickDuckDbPath,
  onInitProject,
  onUseBrowser,
}: ProjectStartupGateViewProps) {
  return (
    <div className="startup-gate-overlay fixed inset-0 z-50 flex items-center justify-center bg-background/95 px-4 backdrop-blur-sm">
      <div className="relative w-full max-w-4xl">
        <ProjectStartupGateBackdrop />

        <section className="startup-gate-panel relative z-10 w-full overflow-hidden border border-border/80 bg-background/92 shadow-[0_24px_80px_-24px_color-mix(in_oklch,var(--foreground)_28%,transparent)] backdrop-blur-xl">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />

          <div className="grid gap-0 md:grid-cols-[0.92fr_1.08fr]">
            <div className="relative border-border border-b bg-gradient-to-br from-primary/10 via-muted/20 to-background p-8 md:border-r md:border-b-0">
              <div
                className="pointer-events-none absolute inset-y-8 left-0 w-px bg-gradient-to-b from-transparent via-primary/50 to-transparent"
                aria-hidden="true"
              />

              <div
                className="startup-gate-intro-item mb-6 flex h-12 w-12 items-center justify-center border border-primary/20 bg-background/80 shadow-sm"
                style={{ animationDelay: "120ms" }}
              >
                <FolderOpen
                  className="h-5 w-5 text-primary"
                  aria-hidden="true"
                />
              </div>

              <h1
                className="startup-gate-intro-item font-semibold text-3xl text-foreground tracking-tight md:text-[2rem]"
                style={{ animationDelay: "280ms" }}
              >
                Open the Pond
              </h1>

              <p
                className="startup-gate-intro-item mt-4 max-w-sm text-muted-foreground text-sm leading-6"
                style={{ animationDelay: "360ms" }}
              >
                Pick a place for Pondview to keep this project’s state.
              </p>

              <div
                className="startup-gate-intro-item mt-8 flex items-center gap-3"
                style={{ animationDelay: "440ms" }}
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

            <div className="p-4 sm:p-6">
              <div className="grid gap-3">
                <ChoiceButton
                  icon={HardDrive}
                  title="Initialize locally"
                  description="Create Pondview project files in this folder so changes stay with the project."
                  disabled={isWorking}
                  delayMs={520}
                  onClick={onInitProject}
                />
                <div
                  className="startup-gate-choice -mt-1 border border-border/60 bg-muted/20 px-3 py-2"
                  style={{ animationDelay: "580ms" }}
                >
                  <label
                    htmlFor="startup-duckdb-path"
                    className="mb-1.5 block font-mono text-[10px] text-muted-foreground uppercase tracking-[0.16em]"
                  >
                    DuckDB file
                  </label>
                  <div className="flex gap-2">
                    <Input
                      id="startup-duckdb-path"
                      value={duckDbPath}
                      onChange={(event) =>
                        onDuckDbPathChange(event.currentTarget.value)
                      }
                      disabled={isWorking || isPickingDuckDbPath}
                      className="h-8 rounded-none border-border/70 bg-background/70 font-mono text-xs shadow-none"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 rounded-none border-border/70 bg-background/70 shadow-none"
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
                        <FolderOpen
                          className="h-3.5 w-3.5"
                          aria-hidden="true"
                        />
                      )}
                    </Button>
                  </div>
                </div>
                <ChoiceButton
                  icon={Monitor}
                  title="Work from browser"
                  description="Start in browser storage and decide later whether to save files locally."
                  disabled={isWorking}
                  delayMs={640}
                  onClick={onUseBrowser}
                />
              </div>

              <div
                className="startup-gate-footer mt-5 flex items-center justify-between gap-3 border-border border-t pt-4"
                style={{ animationDelay: "760ms" }}
              >
                <div className="startup-gate-path flex min-w-0 items-center gap-2 font-mono text-[11px] text-muted-foreground">
                  <Database
                    className="h-3.5 w-3.5 shrink-0"
                    aria-hidden="true"
                  />
                  <span className="truncate">
                    {project.rootPath ?? project.name}
                  </span>
                </div>
                {isWorking ? (
                  <span className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground uppercase tracking-[0.16em]">
                    <Loader2
                      className="h-3.5 w-3.5 animate-spin"
                      aria-hidden="true"
                    />
                    Working
                  </span>
                ) : null}
              </div>

              {error ? (
                <p className="startup-gate-footer mt-3 border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive text-sm">
                  {error}
                </p>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export function ProjectStartupGatePreview() {
  return (
    <ProjectStartupGateView
      project={PREVIEW_PROJECT}
      duckDbPath="default"
      isWorking={false}
      isPickingDuckDbPath={false}
      error={null}
      onDuckDbPathChange={() => {}}
      onPickDuckDbPath={() => {}}
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
    defaultSourceRef: null,
  };
}

function createProjectManifest(projectName: string): string {
  return `${JSON.stringify(
    {
      schemaVersion: 1,
      name: projectName,
      defaultSourceRef: "local",
    },
    null,
    2,
  )}\n`;
}

function createLocalSourceBindings(): string {
  return `${JSON.stringify(
    {
      schemaVersion: 1,
      bindings: {
        local: {
          runtimeBackend: "bridge",
          dbIdentifier: null,
          catalogContext: "main",
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
  const [duckDbPath, setDuckDbPath] = useState("default");
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
        const [{ project }, { files }] = await Promise.all([
          getBridgeProject(),
          listBridgeProjectFiles(),
        ]);
        if (cancelled) {
          return;
        }

        setProject(project);
        if (files.length > 0) {
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

  const handleInitProject = async () => {
    setIsWorking(true);
    setError(null);
    try {
      const normalizedDuckDbPath = duckDbPath.trim();
      const databasePath =
        normalizedDuckDbPath && normalizedDuckDbPath.toLowerCase() !== "default"
          ? normalizedDuckDbPath
          : undefined;
      setProjectStoreMode(project.id, "bridge-filesystem");
      await initializeBridgeProject({
        files: [
          {
            path: "pondview/project.json",
            content: createProjectManifest(project.name),
          },
          {
            path: "pondview.sources.local.json",
            content: createLocalSourceBindings(),
          },
        ],
        ...(databasePath ? { databasePath } : {}),
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
    setIsWorking(true);
    setError(null);
    try {
      setProjectStoreMode(project.id, "browser-indexeddb");
      await setOpenProject(createBrowserProject(project.name));
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

  const handlePickDuckDbPath = async () => {
    setIsPickingDuckDbPath(true);
    setError(null);
    try {
      const result = await pickBridgeProjectDatabasePath();
      if (result.path) {
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
      duckDbPath={duckDbPath}
      isWorking={isWorking}
      isPickingDuckDbPath={isPickingDuckDbPath}
      error={error}
      onDuckDbPathChange={setDuckDbPath}
      onPickDuckDbPath={handlePickDuckDbPath}
      onInitProject={handleInitProject}
      onUseBrowser={handleUseBrowser}
    />
  );
}

function ChoiceButton({
  icon: Icon,
  title,
  description,
  disabled,
  delayMs,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  disabled: boolean;
  delayMs: number;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      className={cn(
        "startup-gate-choice group relative h-auto justify-start gap-4 overflow-hidden rounded-none border-border/80 bg-background/70 p-4 text-left transition-[border-color,background-color,transform,box-shadow] duration-300",
        "hover:-translate-y-0.5 hover:border-primary/40 hover:bg-primary/5 hover:shadow-[0_12px_32px_-20px_color-mix(in_oklch,var(--primary)_55%,transparent)]",
        "disabled:hover:translate-y-0 disabled:hover:shadow-none",
      )}
      style={{ animationDelay: `${delayMs}ms` }}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="startup-gate-choice-icon flex h-10 w-10 shrink-0 items-center justify-center border border-border bg-background">
        <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-foreground">{title}</span>
        <span className="mt-1 block whitespace-normal text-muted-foreground text-xs leading-5">
          {description}
        </span>
      </span>
      <ArrowRight
        className="startup-gate-choice-arrow h-4 w-4 shrink-0 text-primary"
        aria-hidden="true"
      />
    </Button>
  );
}
