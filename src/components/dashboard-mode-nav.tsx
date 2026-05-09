import { LayoutDashboard } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { listDashboards } from "@/lib/workspace/dashboard-repo";
import Link from "@/vite/next-link";
import { usePathname, useSearchParams } from "@/vite/next-navigation";

type DashboardModeNavItem = {
  id: string;
  title: string | null;
  updatedAt: number;
};

const DASHBOARD_MODE_PARAM = "pondviewMode=dashboard";

function dashboardModeHref(path: string): string {
  return `${path}${path.includes("?") ? "&" : "?"}${DASHBOARD_MODE_PARAM}`;
}

export function DashboardModeNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeDashboardId = searchParams.get("id");
  const [dashboards, setDashboards] = useState<DashboardModeNavItem[]>([]);

  useEffect(() => {
    let cancelled = false;

    void listDashboards()
      .then((items) => {
        if (!cancelled) {
          setDashboards(items);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDashboards([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const sortedDashboards = useMemo(
    () => [...dashboards].sort((a, b) => b.updatedAt - a.updatedAt),
    [dashboards],
  );

  return (
    <div className="flex h-14 flex-none items-center gap-2 overflow-x-auto border-b border-border bg-sidebar px-3">
      <Link
        href={dashboardModeHref("/dashboards")}
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
    </div>
  );
}
