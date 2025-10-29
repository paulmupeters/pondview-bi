"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type DashboardLite = { id: string; title: string | null; updatedAt: number };

export default function DashboardsPage() {
  const [dashboards, setDashboards] = useState<DashboardLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

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
            <li key={d.id} className="border rounded-lg p-4 bg-card hover:bg-card/80">
              <Link href={`/dashboards/${d.id}`} className="font-medium">
                {d.title || d.id}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}


