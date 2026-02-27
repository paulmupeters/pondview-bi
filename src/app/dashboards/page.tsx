import { LayoutDashboard, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api/client";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type DashboardLite = { id: string; title: string | null; updatedAt: number };

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} day${days > 1 ? "s" : ""} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
  return "Just now";
}

export default function DashboardsPage() {
  const [dashboards, setDashboards] = useState<DashboardLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/dashboards", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as { dashboards: DashboardLite[] };
        setDashboards(data.dashboards ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const title = prompt("New dashboard title")?.trim();
      if (!title) return;
      const res = await apiFetch("/api/dashboards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (res.ok) await load();
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (
    dashboardId: string,
    dashboardTitle: string | null,
  ) => {
    if (
      !confirm(
        `Are you sure you want to delete "${dashboardTitle || "Untitled Dashboard"}"? This action cannot be undone.`,
      )
    )
      return;
    setDeleting(dashboardId);
    try {
      // Optimistically remove from UI
      setDashboards((prev) => prev.filter((d) => d.id !== dashboardId));
      const res = await apiFetch(`/api/dashboards/${dashboardId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        // Reload list on failure to restore
        await load();
      }
    } catch {
      // Reload list on error to restore
      await load();
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-6xl flex-col gap-8 overflow-y-auto px-6 py-10">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <LayoutDashboard className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Dashboards</h1>
              <p className="text-sm text-muted-foreground">
                Manage and view your analytics dashboards
              </p>
            </div>
          </div>
          <Button onClick={handleCreate} disabled={creating} size="default">
            <Plus className="mr-2 h-4 w-4" />
            {creating ? "Creating…" : "New Dashboard"}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]" />
            <p className="mt-4 text-sm text-muted-foreground">
              Loading dashboards...
            </p>
          </div>
        </div>
      ) : dashboards.length === 0 ? (
        <Card className="border-dashed">
          <CardHeader className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <LayoutDashboard className="h-8 w-8 text-muted-foreground" />
            </div>
            <CardTitle>No dashboards yet</CardTitle>
            <CardDescription className="max-w-sm">
              Get started by creating your first dashboard. You can add visuals
              from your chat conversations.
            </CardDescription>
            <Button
              onClick={handleCreate}
              disabled={creating}
              className="mt-6"
            >
              <Plus className="mr-2 h-4 w-4" />
              Create Your First Dashboard
            </Button>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {dashboards.map((dashboard) => (
            <Card
              key={dashboard.id}
              className="group relative overflow-hidden transition-all hover:shadow-md"
            >
              <Link
                href={`/dashboards/view?id=${encodeURIComponent(dashboard.id)}`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="truncate text-lg">
                        {dashboard.title || "Untitled Dashboard"}
                      </CardTitle>
                      <CardDescription className="mt-2 text-xs">
                        Updated {formatRelativeTime(dashboard.updatedAt)}
                      </CardDescription>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void handleDelete(dashboard.id, dashboard.title);
                      }}
                      disabled={deleting === dashboard.id}
                      aria-label="Delete dashboard"
                      title="Delete dashboard"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
              </Link>
              <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-primary/50 to-primary opacity-0 transition-opacity group-hover:opacity-100" />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
