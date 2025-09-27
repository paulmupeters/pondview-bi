"use client";

import { useArtifact } from "@ai-sdk-tools/artifacts/client";
import { Cog6ToothIcon } from "@heroicons/react/24/outline";
import { BarChart3, ChevronDown, Table } from "lucide-react";
import { useState } from "react";
import { ExecuteSqlArtifact } from "@/ai/artifacts/execute-sql";
import { SqlChart } from "@/components/sql-chart";
import { SqlResultsTable } from "@/components/sql-results-table";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { Config } from "@/lib/types";

export function SqlAnalysisPanel() {
  const sqlData = useArtifact(ExecuteSqlArtifact);
  const [activeView, setActiveView] = useState<"table" | "chart">("table");
  const [customConfig, setCustomConfig] = useState<Config | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  console.log("sqlData", sqlData);
  if (!sqlData?.data) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* View Toggle Buttons */}
      <div className="flex gap-2 p-4 border-b">
        <Button
          variant={activeView === "table" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveView("table")}
          className="flex items-center gap-2"
        >
          <Table className="w-4 h-4" />
          Data
        </Button>
        <Button
          variant={activeView === "chart" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveView("chart")}
          className="flex items-center gap-2"
        >
          <BarChart3 className="w-4 h-4" />
          Chart
        </Button>
      </div>

      {/* Render appropriate view */}
      {activeView === "chart" ? (
        <div className="relative">
          {/* Configuration button in top right */}
          <div className="absolute top-0 right-0 z-10">
            <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-2"
                >
                  <Cog6ToothIcon className="w-4 h-4" />
                  Configure
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80">
                <div className="space-y-4">
                  <h4 className="font-medium">Create Custom Chart Config</h4>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const formData = new FormData(
                        e.target as HTMLFormElement,
                      );
                      const config: Config = {
                        description: formData.get("description") as string,
                        takeaway: formData.get("takeaway") as string,
                        type: formData.get("type") as
                          | "bar"
                          | "line"
                          | "area"
                          | "pie",
                        title: formData.get("title") as string,
                        xKey: formData.get("xKey") as string,
                        yKeys: (() => {
                          const yKeysRaw = formData.getAll("yKeys") as string[];
                          return yKeysRaw.filter((key) => key !== "count");
                        })(),
                        legend: formData.get("legend") === "on",
                        multipleLines: formData.get("multipleLines") === "on",
                        measurementColumn:
                          (formData.get("measurementColumn") as string) ||
                          undefined,
                        lineCategories:
                          (formData.getAll("lineCategories") as string[]) ||
                          undefined,
                        colors: undefined, // TODO
                        countMode: (() => {
                          const yKeysRaw = formData.getAll("yKeys") as string[];
                          return yKeysRaw.includes("count") ? true : undefined;
                        })(),
                      };
                      setCustomConfig(config);
                      setPopoverOpen(false);
                    }}
                  >
                    <div className="space-y-2">
                      <label htmlFor="description">Description</label>
                      <Input
                        id="description"
                        name="description"
                        required
                        defaultValue={customConfig?.description || ""}
                      />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="takeaway">Takeaway</label>
                      <Input
                        id="takeaway"
                        name="takeaway"
                        required
                        defaultValue={customConfig?.takeaway || ""}
                      />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="type">Type</label>
                      <select
                        id="type"
                        name="type"
                        required
                        className="w-full p-2 border rounded"
                        defaultValue={customConfig?.type || "bar"}
                      >
                        <option value="bar">Bar</option>
                        <option value="line">Line</option>
                        <option value="area">Area</option>
                        <option value="pie">Pie</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="title">Title</label>
                      <Input
                        id="title"
                        name="title"
                        required
                        defaultValue={customConfig?.title || ""}
                      />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="xKey">X Key</label>
                      <select
                        id="xKey"
                        name="xKey"
                        required
                        className="w-full p-2 border rounded"
                        defaultValue={customConfig?.xKey || ""}
                      >
                        <option value="">Select X Key</option>
                        {sqlData.data.columns.map((col) => (
                          <option key={col.name} value={col.name}>
                            {col.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="yKeys">Y Keys</label>
                      <select
                        id="yKeys"
                        name="yKeys"
                        // multiple
                        required
                        className="w-full p-2 border rounded"
                        defaultValue={
                          customConfig?.yKeys?.[0] ||
                          (customConfig?.countMode ? "count" : "")
                        }
                      >
                        <option value="">Select Y Key</option>
                        {sqlData.data.columns.map((col) => (
                          <option key={col.name} value={col.name}>
                            {col.name}
                          </option>
                        ))}
                        <option value="count">Count</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="legend">Legend</label>
                      <Input
                        id="legend"
                        type="checkbox"
                        name="legend"
                        defaultChecked={customConfig?.legend || false}
                      />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="multipleLines">Multiple Lines</label>
                      <Input
                        id="multipleLines"
                        type="checkbox"
                        name="multipleLines"
                        defaultChecked={customConfig?.multipleLines || false}
                      />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="measurementColumn">
                        Measurement Column
                      </label>
                      <select
                        id="measurementColumn"
                        name="measurementColumn"
                        className="w-full p-2 border rounded"
                        defaultValue={customConfig?.measurementColumn || ""}
                      >
                        <option value="">None</option>
                        {sqlData.data.columns.map((col) => (
                          <option key={col.name} value={col.name}>
                            {col.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="lineCategories">Line Categories</label>
                      <select
                        id="lineCategories"
                        name="lineCategories"
                        // multiple
                        className="w-full p-2 border rounded"
                        defaultValue={customConfig?.lineCategories?.[0] || ""}
                      >
                        <option value="">None</option>
                        {sqlData.data.columns.map((col) => (
                          <option key={col.name} value={col.name}>
                            {col.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <Button type="submit" className="mt-4">
                      Save
                    </Button>
                  </form>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {/* Chart content */}
          {customConfig ? (
            <SqlChart customChartConfig={customConfig} />
          ) : (
            <div className="flex items-center justify-center h-64 text-muted-foreground">
              Add configuration first
            </div>
          )}
        </div>
      ) : (
        <SqlResultsTable />
      )}

      {/* Query Collapsible */}
      <Collapsible>
        <CollapsibleTrigger className="flex items-center justify-between w-full p-4 border-t hover:bg-muted/50 cursor-pointer">
          <span className="text-sm font-medium">SQL Query</span>
          <ChevronDown className="w-4 h-4" />
        </CollapsibleTrigger>
        <CollapsibleContent className="p-4 border-t">
          <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
            {sqlData.data.query || "No query available"}
          </pre>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
