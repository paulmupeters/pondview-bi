"use client";

import { useState } from "react";
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
import type { Config, Result } from "@/lib/types";

interface ChartConfigDialogProps {
  trigger: React.ReactNode;
  config: Config | null;
  columns: Array<{ name: string }>;
  rows?: Result[];
  onConfigChange: (config: Config) => void;
}

export function ChartConfigDialog({
  trigger,
  config,
  columns,
  rows = [],
  onConfigChange,
}: ChartConfigDialogProps) {
  const [open, setOpen] = useState(false);
  const [chartType, setChartType] = useState<string>(config?.type || "line");
  const [multipleLines, setMultipleLines] = useState<boolean>(config?.multipleLines || false);
  const [categoryColumn, setCategoryColumn] = useState<string>(config?.categoryColumn || "");
  const [selectedCategories, setSelectedCategories] = useState<string[]>(config?.lineCategories || []);

  // Get distinct values for a column
  const getDistinctValues = (columnName: string): string[] => {
    if (!rows || rows.length === 0) return [];
    const values = rows.map(row => String(row[columnName])).filter(Boolean);
    return Array.from(new Set(values)).sort();
  };

  const availableCategories = categoryColumn ? getDistinctValues(categoryColumn) : [];

  const toggleCategory = (category: string) => {
    setSelectedCategories(prev =>
      prev.includes(category)
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  };

  const toggleAllCategories = () => {
    if (selectedCategories.length === availableCategories.length) {
      setSelectedCategories([]);
    } else {
      setSelectedCategories(availableCategories);
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);

    const newConfig: Config = {
      description: formData.get("description") as string,
      takeaway: formData.get("takeaway") as string,
      type: formData.get("type") as "bar" | "line" | "area" | "pie",
      title: formData.get("title") as string,
      xKey: formData.get("xKey") as string,
      yKeys: (() => {
        const yKeysRaw = formData.getAll("yKeys") as string[];
        return yKeysRaw.filter((key) => key !== "count");
      })(),
      legend: formData.get("legend") === "on",
      multipleLines: formData.get("multipleLines") === "yes",
      measurementColumn:
        (formData.get("measurementColumn") as string) || undefined,
      categoryColumn:
        (formData.get("categoryColumn") as string) || undefined,
      lineCategories:
        (formData.getAll("lineCategories") as string[]) || undefined,
      colors: undefined,
      countMode: (() => {
        const yKeysRaw = formData.getAll("yKeys") as string[];
        return yKeysRaw.includes("count") ? true : false;
      })(),
    };

    // If multipleLines is enabled, ensure measurementColumn is in yKeys and legend is enabled
    if (newConfig.multipleLines && newConfig.measurementColumn) {
      if (!newConfig.yKeys.includes(newConfig.measurementColumn)) {
        newConfig.yKeys = [...new Set([...newConfig.yKeys, newConfig.measurementColumn])];
      }
      newConfig.legend = true;
    }

    onConfigChange(newConfig);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-card">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-gray-500">⚙️</span>
            Parameters
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Chart Type */}
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Chart type</legend>
            <p className="text-xs text-card-foreground">Type of chart</p>
            <div className="flex gap-2">
              {["Line", "Bar", "Pie", "StackBar", "Area"].map((type) => (
                <label key={type} className="cursor-pointer">
                  <input
                    type="radio"
                    name="type"
                    value={type.toLowerCase()}
                    checked={chartType === type.toLowerCase()}
                    onChange={(e) => setChartType(e.target.value)}
                    className="sr-only peer"
                  />
                  <div className="px-4 py-2 border rounded-lg hover:bg-card-foreground/10 peer-checked:bg-card-foreground/10 peer-checked:border-card-foreground/20">
                    {type}
                  </div>
                </label>
              ))}
            </div>
          </fieldset>

          <Separator />

          {/* X-Axis Configuration */}
          <div className="space-y-3">
            <div>
              <label htmlFor="xKey" className="text-sm font-medium">
                X-Axis Column
              </label>
              <p className="text-xs text-gray-500">
                Select the column for the X-axis (categories)
              </p>
            </div>
            <select
              id="xKey"
              name="xKey"
              defaultValue={config?.xKey || columns[0]?.name || ""}
              className="w-full px-3 py-2 border border-input bg-background rounded-md text-sm"
            >
              {columns.map((column) => (
                <option key={column.name} value={column.name}>
                  {column.name}
                </option>
              ))}
            </select>
          </div>

          <Separator />

          {/* Y-Axis Configuration */}
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Y-Axis Columns</legend>
            <p className="text-xs text-gray-500">
              Select one or more columns for the Y-axis (values)
            </p>
            <div className="space-y-2 max-h-32 overflow-y-auto border rounded-md p-2">
              {columns.map((column) => (
                <label
                  key={column.name}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    name="yKeys"
                    value={column.name}
                    defaultChecked={
                      config?.yKeys?.includes(column.name) ||
                      (!config?.yKeys && column.name === columns[1]?.name)
                    }
                    className="rounded border-input"
                  />
                  <span className="text-sm">{column.name}</span>
                </label>
              ))}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  name="yKeys"
                  value="count"
                  defaultChecked={config?.countMode}
                  className="rounded border-input"
                />
                <span className="text-sm">Count (aggregate by X-axis)</span>
              </label>
            </div>
          </fieldset>

          <Separator />

          {/* Multi-line Configuration (for line charts only) */}
          {chartType === "line" && (
            <>
              <fieldset className="space-y-3">
                <legend className="text-sm font-medium">Multi-line Chart</legend>
                <p className="text-xs text-gray-500">
                  Enable to compare multiple categories as separate lines
                </p>
                <div className="flex gap-2">
                  <label className="cursor-pointer">
                    <input
                      type="radio"
                      name="multipleLines"
                      value="yes"
                      checked={multipleLines}
                      onChange={() => setMultipleLines(true)}
                      className="sr-only peer"
                    />
                    <div className="px-4 py-2 border rounded-lg hover:bg-card-foreground/10 peer-checked:bg-card-foreground/10 peer-checked:border-card-foreground/20">
                      Yes
                    </div>
                  </label>
                  <label className="cursor-pointer">
                    <input
                      type="radio"
                      name="multipleLines"
                      value="no"
                      checked={!multipleLines}
                      onChange={() => setMultipleLines(false)}
                      className="sr-only peer"
                    />
                    <div className="px-4 py-2 border rounded-lg hover:bg-card-foreground/10 peer-checked:bg-card-foreground/10 peer-checked:border-card-foreground/20">
                      No
                    </div>
                  </label>
                </div>
              </fieldset>

              {multipleLines && (
                <>
                  <Separator />

                  {/* Category Column */}
                  <div className="space-y-3">
                    <div>
                      <label htmlFor="categoryColumn" className="text-sm font-medium">
                        Category Column
                      </label>
                      <p className="text-xs text-gray-500">
                        Column to group lines by (e.g., Country, Region)
                      </p>
                    </div>
                    <select
                      id="categoryColumn"
                      name="categoryColumn"
                      value={categoryColumn}
                      onChange={(e) => {
                        setCategoryColumn(e.target.value);
                        setSelectedCategories([]);
                      }}
                      className="w-full px-3 py-2 border border-input bg-background rounded-md text-sm"
                    >
                      <option value="">Select a column</option>
                      {columns.map((column) => (
                        <option key={column.name} value={column.name}>
                          {column.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {categoryColumn && availableCategories.length > 0 && (
                    <>
                      <Separator />

                      {/* Line Categories */}
                      <fieldset className="space-y-3">
                        <legend className="text-sm font-medium">Categories</legend>
                        <p className="text-xs text-gray-500">
                          Select which categories to display as lines
                        </p>
                        <div className="space-y-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={toggleAllCategories}
                            className="mb-2"
                          >
                            {selectedCategories.length === availableCategories.length
                              ? "Deselect All"
                              : "Select All"}
                          </Button>
                          <div className="space-y-2 max-h-32 overflow-y-auto border rounded-md p-2">
                            {availableCategories.map((category) => (
                              <label
                                key={category}
                                className="flex items-center gap-2 cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  name="lineCategories"
                                  value={category}
                                  checked={selectedCategories.includes(category)}
                                  onChange={() => toggleCategory(category)}
                                  className="rounded border-input"
                                />
                                <span className="text-sm">{category}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      </fieldset>
                    </>
                  )}

                  <Separator />

                  {/* Measurement Column */}
                  <div className="space-y-3">
                    <div>
                      <label htmlFor="measurementColumn" className="text-sm font-medium">
                        Measurement Column
                      </label>
                      <p className="text-xs text-gray-500">
                        The numeric column to measure (e.g., num_unicorns, revenue)
                      </p>
                    </div>
                    <select
                      id="measurementColumn"
                      name="measurementColumn"
                      defaultValue={config?.measurementColumn || ""}
                      className="w-full px-3 py-2 border border-input bg-background rounded-md text-sm"
                    >
                      <option value="">Select a column</option>
                      {columns.map((column) => (
                        <option key={column.name} value={column.name}>
                          {column.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              <Separator />
            </>
          )}

          {/* Chart Title */}
          <div className="space-y-3">
            <div>
              <label htmlFor="title" className="text-sm font-medium">
                Chart Title
              </label>
              <p className="text-xs text-gray-500">
                Title to display above the chart
              </p>
            </div>
            <Input
              id="title"
              name="title"
              defaultValue={config?.title || "Chart"}
              placeholder="Enter chart title"
            />
          </div>

          <Separator />

          {/* Chart Description */}
          <div className="space-y-3">
            <div>
              <label htmlFor="description" className="text-sm font-medium">
                Description
              </label>
              <p className="text-xs text-gray-500">
                Brief description of what the chart shows
              </p>
            </div>
            <Input
              id="description"
              name="description"
              defaultValue={config?.description || "Chart"}
              placeholder="Enter chart description"
            />
          </div>

          <Separator />

          {/* Chart Takeaway */}
          <div className="space-y-3">
            <div>
              <label htmlFor="takeaway" className="text-sm font-medium">
                Key Takeaway
              </label>
              <p className="text-xs text-gray-500">
                Main insight or conclusion from the chart
              </p>
            </div>
            <Input
              id="takeaway"
              name="takeaway"
              defaultValue={config?.takeaway || "Data visualization"}
              placeholder="Enter key takeaway"
            />
          </div>

          <Separator />

          {/* Size of line */}
          <div className="space-y-3">
            <div>
              <label htmlFor="lineSize" className="text-sm font-medium">
                Size of line
              </label>
              <p className="text-xs text-gray-500">
                Size of line unit in pixel
              </p>
            </div>
            <Input
              id="lineSize"
              name="lineSize"
              type="number"
              defaultValue="1"
              min="1"
              max="10"
            />
          </div>

          <Separator />

          {/* Hide Legend */}
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Hide Legend</legend>
            <p className="text-xs text-card-foreground">Hide/Show legend.</p>
            <div className="flex gap-2">
              <label className="cursor-pointer">
                <input
                  type="radio"
                  name="legend"
                  value="yes"
                  defaultChecked={!config?.legend}
                  className="sr-only peer"
                />
                <div className="px-4 py-2 border rounded-lg hover:bg-card-foreground/10 peer-checked:bg-card-foreground/10 peer-checked:border-card-foreground/20">
                  Yes
                </div>
              </label>
              <label className="cursor-pointer">
                <input
                  type="radio"
                  name="legend"
                  value="no"
                  defaultChecked={config?.legend}
                  className="sr-only peer"
                />
                <div className="px-4 py-2 border rounded-lg hover:bg-gray-50 peer-checked:bg-blue-50 peer-checked:border-blue-200">
                  No
                </div>
              </label>
            </div>
          </fieldset>

          <Separator />

          {/* Hide Grid */}
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Hide Grid</legend>
            <p className="text-xs text-gray-500">
              Hide/Show Grid for minimal graph
            </p>
            <div className="flex gap-2">
              <label className="cursor-pointer">
                <input
                  type="radio"
                  name="hideGrid"
                  value="yes"
                  className="sr-only peer"
                />
                <div className="px-4 py-2 border rounded-lg hover:bg-card-foreground/10 peer-checked:bg-card-foreground/10 peer-checked:border-card-foreground/20">
                  Yes
                </div>
              </label>
              <label className="cursor-pointer">
                <input
                  type="radio"
                  name="hideGrid"
                  value="no"
                  defaultChecked
                  className="sr-only peer"
                />
                <div className="px-4 py-2 border rounded-lg hover:bg-card-foreground/10 peer-checked:bg-card-foreground/10 peer-checked:border-card-foreground/20">
                  No
                </div>
              </label>
            </div>
          </fieldset>

          <Separator />

          {/* Hide X Axis */}
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Hide X Axis</legend>
            <p className="text-xs text-gray-500">
              Hide/Show X Axis for minimal graph
            </p>
            <div className="flex gap-2">
              <label className="cursor-pointer">
                <input
                  type="radio"
                  name="hideXAxis"
                  value="yes"
                  defaultChecked
                  className="sr-only peer"
                />
                <div className="px-4 py-2 border rounded-lg hover:bg-card-foreground/10 peer-checked:bg-card-foreground/10 peer-checked:border-card-foreground/20">
                  Yes
                </div>
              </label>
              <label className="cursor-pointer">
                <input
                  type="radio"
                  name="hideXAxis"
                  value="no"
                  className="sr-only peer"
                />
                <div className="px-4 py-2 border rounded-lg hover:bg-card-foreground/10 peer-checked:bg-card-foreground/10 peer-checked:border-card-foreground/20">
                  No
                </div>
              </label>
            </div>
          </fieldset>

          <Separator />

          {/* Hide Dots */}
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Hide Dots</legend>
            <p className="text-xs text-gray-500">Hide/Show Dots</p>
            <div className="flex gap-2">
              <label className="cursor-pointer">
                <input
                  type="radio"
                  name="hideDots"
                  value="yes"
                  className="sr-only peer"
                />
                <div className="px-4 py-2 border rounded-lg hover:bg-card-foreground/10 peer-checked:bg-card-foreground/10 peer-checked:border-card-foreground/20">
                  Yes
                </div>
              </label>
              <label className="cursor-pointer">
                <input
                  type="radio"
                  name="hideDots"
                  value="no"
                  defaultChecked
                  className="sr-only peer"
                />
                <div className="px-4 py-2 border rounded-lg hover:bg-card-foreground/10 peer-checked:bg-card-foreground/10 peer-checked:border-card-foreground/20">
                  No
                </div>
              </label>
            </div>
          </fieldset>

          <Separator />

          {/* Hide Y Axis */}
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Hide Y Axis</legend>
            <p className="text-xs text-gray-500">
              Hide/Show Y Axis for minimal graph
            </p>
            <div className="flex gap-2">
              <label className="cursor-pointer">
                <input
                  type="radio"
                  name="hideYAxis"
                  value="yes"
                  className="sr-only peer"
                />
                <div className="px-4 py-2 border rounded-lg hover:bg-card-foreground/10 peer-checked:bg-card-foreground/10 peer-checked:border-card-foreground/20">
                  Yes
                </div>
              </label>
              <label className="cursor-pointer">
                <input
                  type="radio"
                  name="hideYAxis"
                  value="no"
                  defaultChecked
                  className="sr-only peer"
                />
                <div className="px-4 py-2 border rounded-lg hover:bg-card-foreground/10 peer-checked:bg-card-foreground/10 peer-checked:border-card-foreground/20">
                  No
                </div>
              </label>
            </div>
          </fieldset>

          <Separator />

          {/* Suffix for label Y */}
          <div className="space-y-3">
            <div>
              <label htmlFor="suffixLabelY" className="text-sm font-medium">
                Suffix for label Y
              </label>
              <p className="text-xs text-gray-500">
                Suffix for label Y for display something like unit
              </p>
            </div>
            <Input id="suffixLabelY" name="suffixLabelY" placeholder="" />
          </div>

          <Separator />

          {/* Label Y angle */}
          <div className="space-y-3">
            <div>
              <label htmlFor="labelYAngle" className="text-sm font-medium">
                Label Y angle
              </label>
              <p className="text-xs text-gray-500">Angle for rotate Y label</p>
            </div>
            <Input
              id="labelYAngle"
              name="labelYAngle"
              type="number"
              defaultValue="0"
              min="-90"
              max="90"
            />
          </div>

          <Separator />

          {/* Hide Tooltip */}
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Hide Tooltip</legend>
            <p className="text-xs text-gray-500">
              Enable or disable tooltip when hover on graph
            </p>
            <div className="flex gap-2">
              <label className="cursor-pointer">
                <input
                  type="radio"
                  name="hideTooltip"
                  value="yes"
                  className="sr-only peer"
                />
                <div className="px-4 py-2 border rounded-lg hover:bg-card-foreground/10 peer-checked:bg-card-foreground/10 peer-checked:border-card-foreground/20">
                  Yes
                </div>
              </label>
              <label className="cursor-pointer">
                <input
                  type="radio"
                  name="hideTooltip"
                  value="no"
                  defaultChecked
                  className="sr-only peer"
                />
                <div className="px-4 py-2 border rounded-lg hover:bg-card-foreground/10 peer-checked:bg-card-foreground/10 peer-checked:border-card-foreground/20">
                  No
                </div>
              </label>
            </div>
          </fieldset>

          <Separator />

          {/* Reference line label */}
          <div className="space-y-3">
            <div>
              <label
                htmlFor="referenceLineLabel"
                className="text-sm font-medium"
              >
                Reference line label
              </label>
              <p className="text-xs text-gray-500">
                Display reference line label
              </p>
            </div>
            <Input
              id="referenceLineLabel"
              name="referenceLineLabel"
              placeholder=""
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit">Apply</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
