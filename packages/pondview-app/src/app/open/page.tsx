import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Database,
  FileArchive,
  FileText,
  LayoutDashboard,
  Loader2,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";
import { type DragEvent, useRef, useState } from "react";
import { PondviewLogo } from "@/components/pondview-logo";
import { Button } from "@/components/ui/button";
import {
  type InspectedPortableProject,
  importInspectedPortableProject,
  inspectPortableProjectFile,
} from "@/lib/project-store/project-import-service";
import { cn } from "@/lib/utils";
import Link from "@/vite/next-link";
import { useRouter } from "@/vite/next-navigation";

const PROJECT_FILE_ACCEPT =
  ".pondview,.zip,.json,application/zip,application/json,application/vnd.pondview.project+zip";

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  const unitIndex = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  );
  const value = bytes / 1024 ** unitIndex;
  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

function PackageStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof LayoutDashboard;
  label: string;
  value: string | number;
}) {
  return (
    <div className="border-l border-border/80 pl-4 first:border-l-0 first:pl-0">
      <Icon className="mb-2 h-4 w-4 text-primary" aria-hidden="true" />
      <p className="font-mono text-xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

export default function OpenProjectPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [inspection, setInspection] = useState<InspectedPortableProject | null>(
    null,
  );
  const [isDragging, setIsDragging] = useState(false);
  const [isInspecting, setIsInspecting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dangerousWarnings =
    inspection?.warnings.filter((warning) => warning.severity === "danger") ??
    [];

  const inspectFile = async (file: File) => {
    setIsInspecting(true);
    setError(null);
    setInspection(null);
    try {
      setInspection(await inspectPortableProjectFile(file));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "This project package could not be opened.",
      );
    } finally {
      setIsInspecting(false);
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) {
      void inspectFile(file);
    }
  };

  const handleImport = async () => {
    if (!inspection) {
      return;
    }

    setIsImporting(true);
    setError(null);
    try {
      const result = await importInspectedPortableProject(inspection);
      if (result.dashboardId) {
        router.push(
          `/dashboards/view?id=${encodeURIComponent(result.dashboardId)}&pondviewMode=dashboard-preview`,
        );
      } else {
        router.push("/dashboards?pondviewMode=dashboard-preview");
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The project package could not be imported.",
      );
      setIsImporting(false);
    }
  };

  return (
    <div className="relative min-h-full overflow-y-auto bg-background text-foreground">
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        aria-hidden="true"
        style={{
          backgroundImage:
            "linear-gradient(to right, hsl(var(--border) / 0.22) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--border) / 0.22) 1px, transparent 1px)",
          backgroundSize: "42px 42px",
          maskImage: "linear-gradient(to bottom, black 0%, transparent 78%)",
        }}
      />
      <div
        className="pointer-events-none absolute -right-36 -top-40 h-[34rem] w-[34rem] rounded-full bg-primary/10 blur-3xl"
        aria-hidden="true"
      />

      <main className="relative mx-auto flex min-h-full w-full max-w-6xl flex-col px-5 py-6 sm:px-8 lg:px-12">
        <header className="flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to Pondview
          </Link>
          <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            <PondviewLogo title="" className="h-7 w-7" />
            Local package reader
          </div>
        </header>

        <div className="grid flex-1 items-center gap-12 py-12 lg:grid-cols-[0.78fr_1.22fr] lg:py-20">
          <section className="max-w-xl">
            <h1 className="font-serif text-5xl font-semibold leading-[0.95] tracking-[-0.045em] sm:text-6xl">
              Open a Pondview project in your browser.
            </h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-muted-foreground">
              A .pondview file carries dashboards, SQL, notebooks, and
              optionally its DuckDB data. Nothing is uploaded—the package stays
              in this browser.
            </p>

            <div className="mt-9 space-y-4 border-t border-border/70 pt-6 text-sm">
              <div className="flex gap-3">
                <ShieldCheck
                  className="mt-0.5 h-5 w-5 shrink-0 text-primary"
                  aria-hidden="true"
                />
                <div>
                  <p className="font-medium">Browser-isolated</p>
                  <p className="mt-1 text-muted-foreground">
                    Bridge connections and source setup SQL are disabled during
                    portable import.
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <Database
                  className="mt-0.5 h-5 w-5 shrink-0 text-primary"
                  aria-hidden="true"
                />
                <div>
                  <p className="font-medium">Powered by DuckDB WASM</p>
                  <p className="mt-1 text-muted-foreground">
                    Self-contained snapshots execute locally using browser
                    storage.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="relative">
            <div className="absolute -inset-3 -rotate-1 rounded-2xl border border-primary/20 bg-primary/[0.025]" />
            <div className="relative overflow-hidden rounded-xl border border-border bg-card shadow-2xl shadow-black/10">
              <div className="flex items-center justify-between border-b border-border bg-muted/25 px-5 py-3">
                <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                  <FileArchive className="h-4 w-4" aria-hidden="true" />
                  Project intake
                </div>
                <span className="h-2 w-2 rounded-full bg-primary shadow-[0_0_0_5px_hsl(var(--primary)/0.12)]" />
              </div>

              {!inspection ? (
                <div className="p-5 sm:p-7">
                  <section
                    aria-label="Project file drop zone"
                    className={cn(
                      "flex min-h-80 flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 text-center transition-all",
                      isDragging
                        ? "scale-[1.01] border-primary bg-primary/5"
                        : "border-border bg-background/50 hover:border-primary/45 hover:bg-primary/[0.025]",
                    )}
                    onDragEnter={(event) => {
                      event.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragOver={(event) => event.preventDefault()}
                    onDragLeave={(event) => {
                      if (
                        !event.currentTarget.contains(
                          event.relatedTarget as Node | null,
                        )
                      ) {
                        setIsDragging(false);
                      }
                    }}
                    onDrop={handleDrop}
                  >
                    <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-primary/30 bg-primary/10">
                      {isInspecting ? (
                        <Loader2
                          className="h-7 w-7 animate-spin text-primary"
                          aria-hidden="true"
                        />
                      ) : (
                        <UploadCloud
                          className="h-7 w-7 text-primary"
                          aria-hidden="true"
                        />
                      )}
                    </div>
                    <h2 className="text-xl font-semibold">
                      {isInspecting
                        ? "Inspecting package…"
                        : "Drop a .pondview file here"}
                    </h2>
                    <p className="mt-2 max-w-xs text-sm leading-6 text-muted-foreground">
                      Existing .zip project exports and legacy JSON bundles are
                      supported too.
                    </p>
                    <Button
                      type="button"
                      className="mt-7"
                      variant="outline"
                      disabled={isInspecting}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Choose file
                    </Button>
                  </section>
                </div>
              ) : (
                <div className="p-5 sm:p-7">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-mono text-xs uppercase tracking-wider text-primary">
                        Ready to open
                      </p>
                      <h2 className="mt-2 truncate text-2xl font-semibold">
                        {inspection.bundle.project.name}
                      </h2>
                      <p className="mt-1 truncate text-sm text-muted-foreground">
                        {inspection.fileName} ·{" "}
                        {formatBytes(inspection.archiveSizeBytes)}
                      </p>
                    </div>
                    <CheckCircle2
                      className="h-8 w-8 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                  </div>

                  <div className="mt-7 grid grid-cols-4 gap-3 border-y border-border py-5">
                    <PackageStat
                      icon={LayoutDashboard}
                      label="Dashboards"
                      value={inspection.dashboardCount}
                    />
                    <PackageStat
                      icon={FileText}
                      label="Queries"
                      value={inspection.queryCount}
                    />
                    <PackageStat
                      icon={FileArchive}
                      label="Notebooks"
                      value={inspection.notebookCount}
                    />
                    <PackageStat
                      icon={Database}
                      label="Snapshot"
                      value={
                        inspection.runtimeSnapshotBytes
                          ? formatBytes(
                              inspection.runtimeSnapshotBytes.byteLength,
                            )
                          : "None"
                      }
                    />
                  </div>

                  {inspection.warnings.length > 0 ? (
                    <div className="mt-5 max-h-44 space-y-2 overflow-y-auto pr-1">
                      {inspection.warnings.map((warning) => (
                        <div
                          key={warning.code}
                          className={cn(
                            "flex gap-3 rounded border px-3 py-2.5 text-sm",
                            warning.severity === "danger"
                              ? "border-amber-400/50 bg-amber-400/10 text-amber-950 dark:text-amber-100"
                              : "border-border bg-muted/25 text-muted-foreground",
                          )}
                        >
                          <AlertTriangle
                            className="mt-0.5 h-4 w-4 shrink-0"
                            aria-hidden="true"
                          />
                          <p>{warning.message}</p>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="mt-6 rounded border border-primary/20 bg-primary/5 px-4 py-3 text-xs leading-5 text-muted-foreground">
                    Opening approves the dashboard SQL to run inside DuckDB
                    WASM. Source connection metadata is removed.{" "}
                    {inspection.runtimeSnapshotBytes
                      ? "The included snapshot replaces the active local browser database."
                      : "No data snapshot is included."}
                  </div>

                  <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={isImporting}
                      onClick={() => {
                        setInspection(null);
                        setError(null);
                        if (fileInputRef.current) {
                          fileInputRef.current.value = "";
                        }
                      }}
                    >
                      Choose another file
                    </Button>
                    <Button
                      type="button"
                      disabled={isImporting}
                      onClick={() => void handleImport()}
                    >
                      {isImporting ? (
                        <>
                          <Loader2
                            className="h-4 w-4 animate-spin"
                            aria-hidden="true"
                          />
                          Opening locally…
                        </>
                      ) : dangerousWarnings.length > 0 ? (
                        "Trust and open locally"
                      ) : (
                        "Open locally"
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {error ? (
                <div
                  role="alert"
                  className="border-t border-destructive/20 bg-destructive/5 px-5 py-3 text-sm text-destructive"
                >
                  {error}
                </div>
              ) : null}
            </div>
          </section>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 py-5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          <span>Runs locally in this browser</span>
          <Link href="/settings" className="hover:text-foreground">
            Open project settings
          </Link>
        </footer>
      </main>

      <input
        ref={fileInputRef}
        type="file"
        accept={PROJECT_FILE_ACCEPT}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void inspectFile(file);
          }
        }}
      />
    </div>
  );
}
