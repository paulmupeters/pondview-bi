import {
  ArrowRight,
  ClockIcon,
  Database,
  Eye,
  LayoutDashboard,
  Plus,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { addSampleDashboard } from "@/lib/dashboard/sample-dashboard";
import {
  DASHBOARD_MODE_QUERY_PARAM,
  DASHBOARD_PREVIEW_QUERY_VALUE,
  resolveDashboardMode,
} from "@/lib/dashboard-mode";
import { parseProjectArtifactFileSet } from "@/lib/project-artifacts/parse";
import { getOpenProject, listOpenProjectFiles } from "@/lib/project-store";
import { cn } from "@/lib/utils";
import {
  createDashboard,
  deleteDashboard,
  listDashboards,
} from "@/lib/workspace/dashboard-repo";
import Link from "@/vite/next-link";

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

type DashboardLite = {
  id: string;
  title: string | null;
  updatedAt: number;
  storageStatus?: "shared" | "best-effort" | null;
  sourceKind?: "attached" | null;
  sourceCatalog?: string | null;
  projectPath?: string | null;
};

const EMPTY_INITIAL_DASHBOARDS: DashboardLite[] = [];
const DASHBOARD_SKELETON_KEYS = [
  "dashboard-skeleton-1",
  "dashboard-skeleton-2",
  "dashboard-skeleton-3",
  "dashboard-skeleton-4",
  "dashboard-skeleton-5",
  "dashboard-skeleton-6",
] as const;
const DASHBOARD_PREVIEW_HREF = `/dashboards?${DASHBOARD_MODE_QUERY_PARAM}=${DASHBOARD_PREVIEW_QUERY_VALUE}`;

/* ------------------------------------------------------------------ */
/*  Time formatting                                                     */
/* ------------------------------------------------------------------ */

function useRelativeTimeFormatter() {
  return useMemo(
    () => new Intl.RelativeTimeFormat("en", { numeric: "auto" }),
    [],
  );
}

function formatRelativeTime(
  rtf: Intl.RelativeTimeFormat,
  timestamp: number,
): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.round(diff / 1000);
  if (seconds < 10) return "Just now";

  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return rtf.format(-seconds, "second");

  const hours = Math.round(minutes / 60);
  if (hours < 1) return rtf.format(-minutes, "minute");

  const days = Math.round(hours / 24);
  if (days < 1) return rtf.format(-hours, "hour");

  const weeks = Math.round(days / 7);
  if (weeks < 4) return rtf.format(-days, "day");

  const months = Math.round(days / 30);
  if (months < 12) return rtf.format(-months, "month");

  return rtf.format(-Math.round(days / 365), "year");
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                      */
/* ------------------------------------------------------------------ */

function SkeletonGrid() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {DASHBOARD_SKELETON_KEYS.map((key) => (
        <div
          key={key}
          className="h-36 animate-pulse rounded-lg border border-border bg-muted/40 border-l-[3px] border-l-primary/20"
        />
      ))}
    </div>
  );
}

function EmptyState({
  onAddSample,
  onCreate,
  sampleError,
  sampleLoading,
}: {
  onAddSample?: () => void;
  onCreate?: () => void;
  sampleError?: string | null;
  sampleLoading?: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center animate-in fade-in zoom-in-95 duration-500">
      <div className="relative mb-8">
        <div className="absolute -inset-4 rounded-full bg-primary/10 blur-2xl" />
        <div className="relative flex h-20 w-20 items-center justify-center rounded-full border-2 border-dashed border-primary/30 bg-primary/5">
          <LayoutDashboard className="h-8 w-8 text-primary/60" />
        </div>
      </div>
      <h2 className="text-2xl font-bold tracking-tight text-foreground">
        No dashboards yet
      </h2>
      {onCreate ? (
        <>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
            Create your first dashboard, or attach the sample stations dashboard
            to explore Pondview.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
            {onAddSample ? (
              <Button
                size="lg"
                className="gap-2 rounded-full px-6 shadow-lg shadow-primary/20"
                onClick={onAddSample}
                disabled={sampleLoading}
              >
                <Database className="h-4 w-4" />
                {sampleLoading ? "Adding sample..." : "Add sample dashboard"}
              </Button>
            ) : null}
            <Button
              size="lg"
              variant={onAddSample ? "outline" : "default"}
              className="gap-2 rounded-full px-6"
              onClick={onCreate}
              disabled={sampleLoading}
            >
              <Plus className="h-4 w-4" />
              Create Dashboard
            </Button>
          </div>
          {sampleError ? (
            <p className="mt-4 max-w-md text-sm text-destructive">
              {sampleError}
            </p>
          ) : null}
        </>
      ) : (
        <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
          No dashboards are available to view.
        </p>
      )}
    </div>
  );
}

function ErrorState({
  error,
  onRetry,
}: {
  error: string;
  onRetry: () => void;
}) {
  return (
    <div className="animate-in fade-in zoom-in-95 duration-500">
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-8 text-left border-l-4 border-l-destructive">
        <h3 className="text-lg font-semibold text-destructive">
          Dashboard storage unavailable
        </h3>
        <p className="mt-2 text-sm text-destructive/80">{error}</p>
        <Button variant="outline" className="mt-6" onClick={onRetry}>
          Retry
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page                                                           */
/* ------------------------------------------------------------------ */

export default function DashboardsPage() {
  const rtf = useRelativeTimeFormatter();
  const isDashboardMode = resolveDashboardMode(
    typeof window === "undefined" ? "" : window.location.search,
  );

  const [dashboards, setDashboards] = useState<DashboardLite[]>(
    EMPTY_INITIAL_DASHBOARDS,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [gridVisible, setGridVisible] = useState(false);

  const [isCreating, setIsCreating] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [isAddingSample, setIsAddingSample] = useState(false);
  const [sampleError, setSampleError] = useState<string | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [dashboardToDelete, setDashboardToDelete] =
    useState<DashboardLite | null>(null);

  const sortedDashboards = useMemo(
    () => [...dashboards].sort((a, b) => b.updatedAt - a.updatedAt),
    [dashboards],
  );

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [project, list] = await Promise.all([
        getOpenProject(),
        listDashboards(),
      ]);
      if (project?.backingKind === "bridge-filesystem") {
        const parsed = parseProjectArtifactFileSet(
          await listOpenProjectFiles(),
        );
        const projectDashboardPaths = new Set(
          parsed.dashboards.map((dashboard) => dashboard.rootPath),
        );
        setDashboards(
          list.filter(
            (dashboard) =>
              dashboard.projectPath &&
              projectDashboardPaths.has(dashboard.projectPath),
          ),
        );
        return;
      }
      setDashboards(list);
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Failed to load dashboards.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /* Staggered entrance */
  useEffect(() => {
    if (sortedDashboards.length > 0 && !isLoading) {
      const id = requestAnimationFrame(() => setGridVisible(true));
      return () => cancelAnimationFrame(id);
    }
    if (isLoading) setGridVisible(false);
  }, [sortedDashboards.length, isLoading]);

  const handleCreate = useCallback(async () => {
    const title = createTitle.trim();
    if (!title) return;
    setIsCreating(true);
    try {
      await createDashboard(title);
      setCreateTitle("");
      setCreateDialogOpen(false);
      await load();
    } catch {
      // silently fail; Dialog stays open so user can retry
    } finally {
      setIsCreating(false);
    }
  }, [createTitle, load]);

  const handleAddSampleDashboard = useCallback(async () => {
    setIsAddingSample(true);
    setSampleError(null);
    try {
      await addSampleDashboard();
      await load();
    } catch (error) {
      setSampleError(
        error instanceof Error
          ? error.message
          : "Failed to add sample dashboard.",
      );
    } finally {
      setIsAddingSample(false);
    }
  }, [load]);

  const confirmDelete = useCallback(async () => {
    if (!dashboardToDelete) return;
    setDeletingId(dashboardToDelete.id);
    try {
      // Optimistically remove from UI
      setDashboards((prev) =>
        prev.filter((d) => d.id !== dashboardToDelete.id),
      );
      await deleteDashboard(dashboardToDelete.id);
      setDashboardToDelete(null);
    } catch {
      await load();
      setDashboardToDelete(null);
    } finally {
      setDeletingId(null);
    }
  }, [dashboardToDelete, load]);

  return (
    <div className="relative min-h-full w-full overflow-y-auto bg-background">
      {/* Atmospheric top glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 40% at 50% 0%, hsl(var(--primary) / 0.06), transparent)",
        }}
      />

      <div className="relative mx-auto max-w-7xl px-6 py-12 lg:px-8">
        {/* Header */}
        <header className="mb-16 flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-3">
            <h1 className="text-5xl font-black tracking-tighter text-foreground sm:text-6xl">
              Dashboards
            </h1>
          </div>

          <div className="flex items-center gap-6">
            {!isLoading && (
              <div className="hidden text-right sm:block">
                <p className="font-mono text-3xl font-bold leading-none text-foreground">
                  {sortedDashboards.length}
                </p>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {sortedDashboards.length === 1 ? "Dashboard" : "Dashboards"}
                </p>
              </div>
            )}
            {!isDashboardMode ? (
              <div className="flex items-center gap-2">
                <Button asChild size="lg" variant="outline">
                  <Link href={DASHBOARD_PREVIEW_HREF}>
                    <Eye className="h-4 w-4" />
                    Preview
                  </Link>
                </Button>
                <Button
                  size="lg"
                  className="gap-2 rounded-full px-6 shadow-lg shadow-primary/20 transition-all hover:-translate-y-0.5 hover:shadow-primary/35"
                  onClick={() => {
                    setCreateTitle("");
                    setCreateDialogOpen(true);
                  }}
                  disabled={isCreating}
                >
                  <Plus className="h-4 w-4" />
                  New Dashboard
                </Button>
              </div>
            ) : null}
          </div>
        </header>

        {/* Content */}
        {isLoading && dashboards.length === 0 ? (
          <SkeletonGrid />
        ) : loadError ? (
          <ErrorState error={loadError} onRetry={() => void load()} />
        ) : sortedDashboards.length === 0 ? (
          <EmptyState
            onAddSample={
              isDashboardMode
                ? undefined
                : () => void handleAddSampleDashboard()
            }
            onCreate={
              isDashboardMode ? undefined : () => setCreateDialogOpen(true)
            }
            sampleError={sampleError}
            sampleLoading={isAddingSample}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sortedDashboards.map((dashboard, i) => {
              const isFeatured = i === 0;
              const delayMs = Math.min(i, 15) * 60;

              return (
                <article
                  key={dashboard.id}
                  className={cn(
                    "group relative flex flex-col gap-5 rounded-lg border border-border bg-card p-5 text-left transition-[transform,box-shadow,background-color,border-color] ease-out hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/5 hover:bg-accent/[0.06]",
                    isFeatured && "lg:col-span-2",
                    i === 1 && "lg:col-start-1",
                    isFeatured ? "border-l-[4px]" : "border-l-[3px]",
                    "border-l-primary",
                  )}
                  style={{
                    transitionProperty:
                      "opacity, transform, box-shadow, background-color, border-color",
                    transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
                    transitionDuration: gridVisible ? "600ms" : "0ms",
                    transitionDelay: gridVisible ? `${delayMs}ms` : "0ms",
                    opacity: gridVisible ? 1 : 0,
                    transform: gridVisible
                      ? "translateY(0)"
                      : "translateY(12px)",
                  }}
                >
                  {/* Stretched link for card-level navigation */}
                  <Link
                    href={`/dashboards/view?id=${encodeURIComponent(dashboard.id)}`}
                    className="absolute inset-0 z-10 rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    aria-label={`Open ${dashboard.title || "Untitled Dashboard"}`}
                  />

                  <div className="pointer-events-none relative z-20 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-primary/70">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        {isFeatured && (
                          <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-primary">
                            Latest
                          </span>
                        )}
                        {dashboard.sourceKind === "attached" && (
                          <span
                            className="inline-flex items-center rounded-full bg-sky-500/10 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400"
                            title={
                              dashboard.sourceCatalog
                                ? `Attached from ${dashboard.sourceCatalog}`
                                : "Attached dashboard"
                            }
                          >
                            Attached
                          </span>
                        )}
                      </div>
                      <h3
                        className={cn(
                          "font-semibold leading-snug text-card-foreground line-clamp-2",
                          isFeatured ? "text-lg" : "text-base",
                        )}
                      >
                        {dashboard.title || "Untitled Dashboard"}
                      </h3>
                    </div>

                    {!isDashboardMode && dashboard.sourceKind !== "attached" ? (
                      <button
                        type="button"
                        className="pointer-events-auto relative z-20 mt-0.5 inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground opacity-0 ring-offset-background transition-all hover:bg-destructive/10 hover:text-destructive focus:opacity-100 group-hover:opacity-100"
                        onClick={() => setDashboardToDelete(dashboard)}
                        disabled={deletingId === dashboard.id}
                        aria-label="Delete dashboard"
                        title="Delete dashboard"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>

                  <div className="pointer-events-none relative z-20 mt-auto flex items-center justify-between">
                    <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      <ClockIcon className="h-3 w-3" />
                      {formatRelativeTime(rtf, dashboard.updatedAt)}
                    </div>
                    <ArrowRight className="h-4 w-4 -translate-x-1 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {!isDashboardMode ? (
        <>
          {/* Create dashboard dialog */}
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>New Dashboard</DialogTitle>
                <DialogDescription>
                  Give your dashboard a name to get started.
                </DialogDescription>
              </DialogHeader>
              <div className="py-2">
                <Input
                  placeholder="Dashboard title"
                  value={createTitle}
                  onChange={(e) => setCreateTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && createTitle.trim()) {
                      void handleCreate();
                    }
                  }}
                  autoFocus
                />
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  variant="outline"
                  onClick={() => setCreateDialogOpen(false)}
                  disabled={isCreating}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => void handleCreate()}
                  disabled={!createTitle.trim() || isCreating}
                >
                  {isCreating ? "Creating..." : "Create"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Delete confirmation dialog */}
          <Dialog
            open={!!dashboardToDelete}
            onOpenChange={(open) => !open && setDashboardToDelete(null)}
          >
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Delete Dashboard</DialogTitle>
                <DialogDescription>
                  Are you sure you want to delete{" "}
                  <span className="font-semibold text-foreground">
                    &ldquo;
                    {dashboardToDelete?.title || "Untitled Dashboard"}
                    &rdquo;
                  </span>
                  ? This action cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  variant="outline"
                  onClick={() => setDashboardToDelete(null)}
                  disabled={!!deletingId}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => void confirmDelete()}
                  disabled={!!deletingId}
                >
                  {deletingId ? "Deleting..." : "Delete"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      ) : null}
    </div>
  );
}
