import { LayoutDashboard } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  DASHBOARD_MODE_QUERY_PARAM,
  DASHBOARD_MODE_QUERY_VALUE,
  DASHBOARD_PREVIEW_QUERY_VALUE,
} from "@/lib/dashboard-mode";
import { parseProjectArtifactFileSet } from "@/lib/project-artifacts/parse";
import { getOpenProject, listOpenProjectFiles } from "@/lib/project-store";
import { cn } from "@/lib/utils";
import { listDashboards } from "@/lib/workspace/dashboard-repo";
import Link from "@/vite/next-link";
import { usePathname, useSearchParams } from "@/vite/next-navigation";

type DashboardModeNavItem = {
  id: string;
  title: string | null;
  updatedAt: number;
  projectPath?: string | null;
};

const DASHBOARD_LOAD_RETRY_DELAYS_MS = [250, 750, 1500, 3000] as const;

function dashboardModeHref(path: string, modeValue: string): string {
  return `${path}${path.includes("?") ? "&" : "?"}${DASHBOARD_MODE_QUERY_PARAM}=${modeValue}`;
}

function exitPreviewHref(pathname: string, searchParams: URLSearchParams) {
  const params = new URLSearchParams(searchParams);
  params.delete(DASHBOARD_MODE_QUERY_PARAM);
  const search = params.toString();
  return search ? `${pathname}?${search}` : pathname;
}

export function DashboardModeNav({
  canExitPreview = false,
}: {
  canExitPreview?: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeDashboardId = searchParams.get("id");
  const routeKey = `${pathname}?${searchParams.toString()}`;
  const modeValue = canExitPreview
    ? DASHBOARD_PREVIEW_QUERY_VALUE
    : DASHBOARD_MODE_QUERY_VALUE;
  const [dashboards, setDashboards] = useState<DashboardModeNavItem[]>([]);

  useEffect(() => {
    void routeKey;
    let cancelled = false;
    const timeoutIds: number[] = [];

    const load = async (retryIndex = 0) => {
      try {
        const [project, allItems] = await Promise.all([
          getOpenProject(),
          listDashboards(),
        ]);
        if (cancelled) {
          return;
        }

        const projectDashboardPaths =
          project?.backingKind === "bridge-filesystem"
            ? new Set(
                parseProjectArtifactFileSet(
                  await listOpenProjectFiles(),
                ).dashboards.map((item) => item.rootPath),
              )
            : null;
        const items =
          project?.backingKind === "bridge-filesystem"
            ? allItems.filter((dashboard) => {
                return (
                  dashboard.projectPath &&
                  projectDashboardPaths?.has(dashboard.projectPath)
                );
              })
            : allItems;

        setDashboards(items);

        const shouldRetry =
          items.length === 0 &&
          retryIndex < DASHBOARD_LOAD_RETRY_DELAYS_MS.length;
        if (shouldRetry) {
          timeoutIds.push(
            window.setTimeout(
              () => void load(retryIndex + 1),
              DASHBOARD_LOAD_RETRY_DELAYS_MS[retryIndex],
            ),
          );
        }
      } catch {
        if (cancelled) {
          return;
        }

        setDashboards([]);
        if (retryIndex < DASHBOARD_LOAD_RETRY_DELAYS_MS.length) {
          timeoutIds.push(
            window.setTimeout(
              () => void load(retryIndex + 1),
              DASHBOARD_LOAD_RETRY_DELAYS_MS[retryIndex],
            ),
          );
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
      for (const timeoutId of timeoutIds) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [routeKey]);

  const sortedDashboards = useMemo(
    () => [...dashboards].sort((a, b) => b.updatedAt - a.updatedAt),
    [dashboards],
  );

  return (
    <div className="flex h-14 flex-none items-center gap-2 overflow-x-auto border-b border-border bg-sidebar px-3">
      <Link
        href={dashboardModeHref("/dashboards", modeValue)}
        className={cn(
          "inline-flex h-9 flex-none items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors",
          pathname === "/dashboards"
            ? "border-primary/50 bg-primary/10 text-primary"
            : "border-transparent text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
        )}
      >
        <LayoutDashboard className="h-4 w-4" />
        Dashboards
      </Link>
      <div className="h-6 w-px flex-none bg-border" />
      {sortedDashboards.map((dashboard) => (
        <Link
          key={dashboard.id}
          href={dashboardModeHref(
            `/dashboards/view?id=${encodeURIComponent(dashboard.id)}`,
            modeValue,
          )}
          className={cn(
            "inline-flex h-9 max-w-56 flex-none items-center truncate rounded-md border px-3 text-sm font-medium transition-colors",
            activeDashboardId === dashboard.id
              ? "border-primary/50 bg-primary/10 text-primary"
              : "border-transparent text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
          )}
          title={dashboard.title || "Untitled Dashboard"}
        >
          <span className="truncate">{dashboard.title || "Untitled"}</span>
        </Link>
      ))}
      {canExitPreview ? (
        <>
          <div className="ml-auto h-6 w-px flex-none bg-border" />
          <Link
            href={exitPreviewHref(pathname, searchParams)}
            className="inline-flex h-9 flex-none items-center rounded-md border border-transparent px-3 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
          >
            Exit preview
          </Link>
        </>
      ) : null}
    </div>
  );
}
