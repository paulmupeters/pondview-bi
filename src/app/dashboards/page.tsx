"use client";

import { Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type DashboardLite = { id: string; title: string | null; updatedAt: number };

export default function DashboardsPage() {
  const [dashboards, setDashboards] = useState<DashboardLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/dashboards", { cache: "no-store" });
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
      const res = await fetch("/api/dashboards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (res.ok) await load();
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (dashboardId: string) => {
    if (!confirm("Are you sure you want to delete this dashboard?")) return;
    setDeleting(dashboardId);
    try {
      // Optimistically remove from UI
      setDashboards((prev) => prev.filter((d) => d.id !== dashboardId));
      const res = await fetch(`/api/dashboards/${dashboardId}`, {
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
    <div className="mx-auto flex h-full w-full max-w-4xl flex-col gap-6 overflow-y-auto px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboards</h1>
        <Button onClick={handleCreate} disabled={creating}>
          {creating ? "Creating…" : "New Dashboard"}
        </Button>
      </div>
      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : dashboards.length === 0 ? (
        <div className="text-sm text-muted-foreground">No dashboards yet</div>
      ) : (
        <ul className="grid gap-3">
          {dashboards.map((d) => (
            <li
              key={d.id}
              className="group border rounded-lg p-4 bg-card hover:bg-card/80 flex items-center justify-between"
            >
              <Link href={`/dashboards/${d.id}`} className="font-medium flex-1">
                {d.title || d.id}
              </Link>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  void handleDelete(d.id);
                }}
                disabled={deleting === d.id}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-input bg-background text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive opacity-0 group-hover:opacity-100 disabled:opacity-50"
                aria-label="Delete dashboard"
                title="Delete dashboard"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
