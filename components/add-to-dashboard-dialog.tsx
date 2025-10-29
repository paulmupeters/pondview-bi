"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import type { CardConfig, Config } from "@/lib/types";

type DashboardLite = { id: string; title: string | null; updatedAt: number };

export function AddToDashboardDialog({
  trigger,
  sql,
  chartConfig,
  cardConfig,
  defaultTitle,
}: {
  trigger: React.ReactNode;
  sql: string;
  chartConfig?: Config;
  cardConfig?: CardConfig;
  defaultTitle?: string;
}) {
  const [open, setOpen] = useState(false);
  const [dashboards, setDashboards] = useState<DashboardLite[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDashboardId, setSelectedDashboardId] = useState<string | "new">("new");
  const [newDashboardTitle, setNewDashboardTitle] = useState("My Dashboard");
  const config = chartConfig ?? cardConfig;
  const [chartTitle, setChartTitle] = useState(defaultTitle ?? config?.title ?? (cardConfig ? "Card" : "Chart"));
  const [chartDescription, setChartDescription] = useState(cardConfig?.description ?? chartConfig?.description ?? "");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/dashboards", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { dashboards: DashboardLite[] };
        if (!cancelled) setDashboards(data.dashboards ?? []);
      } catch { }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const canSubmit = useMemo(() => {
    if (selectedDashboardId === "new") return newDashboardTitle.trim().length > 0;
    return (selectedDashboardId ?? "").length > 0;
  }, [selectedDashboardId, newDashboardTitle]);

  const handleSave = async () => {
    if (!canSubmit) return;
    setLoading(true);
    try {
      let dashboardId = selectedDashboardId as string;
      if (selectedDashboardId === "new") {
        const res = await fetch("/api/dashboards", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: newDashboardTitle.trim() }),
        });
        if (!res.ok) throw new Error("Failed to create dashboard");
        const data = (await res.json()) as { id: string };
        dashboardId = data.id;
      }

      const res2 = await fetch(`/api/dashboard/${dashboardId}/charts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: chartTitle,
          description: chartDescription,
          sql,
          dbIdentifier: "md:my_db",
          chartConfigJson: JSON.stringify(chartConfig ?? cardConfig ?? {}),
        }),
      });
      if (!res2.ok) throw new Error("Failed to add chart");
      setOpen(false);
    } catch {
      // no-op for now; could show a toast
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-xl bg-card">
        <DialogHeader>
          <DialogTitle>Add to Dashboard</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Select dashboard</label>
            <select
              className="w-full px-3 py-2 border border-input bg-background rounded-md text-sm"
              value={selectedDashboardId}
              onChange={(e) => setSelectedDashboardId(e.target.value as any)}
            >
              <option value="new">Create new dashboard…</option>
              {dashboards.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title || d.id}
                </option>
              ))}
            </select>
          </div>

          {selectedDashboardId === "new" && (
            <div className="space-y-2">
              <label className="text-sm font-medium">New dashboard title</label>
              <Input
                value={newDashboardTitle}
                onChange={(e) => setNewDashboardTitle(e.target.value)}
                placeholder="e.g. Sales KPIs"
              />
            </div>
          )}

          <Separator />

          <div className="space-y-2">
            <label className="text-sm font-medium">{cardConfig ? "Card" : "Chart"} title</label>
            <Input
              value={chartTitle}
              onChange={(e) => setChartTitle(e.target.value)}
              placeholder={cardConfig ? "e.g. Total Revenue" : "e.g. Revenue by Month"}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">{cardConfig ? "Card" : "Chart"} description (optional)</label>
            <Input
              value={chartDescription}
              onChange={(e) => setChartDescription(e.target.value)}
              placeholder="Short description"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={!canSubmit || loading}>
              {loading ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}


