import {
  AreaChart,
  BarChart3,
  Layers,
  LineChart,
  PieChart,
} from "lucide-react";
import type React from "react";
import { useRef, useState } from "react";
import {
  SqlPreviewPanel,
  type SqlPreviewRunResult,
} from "@/components/sql-preview-panel";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { SqlBackendPreference } from "@/lib/sql/sql-runtime";
import type { Config, Result } from "@/lib/types";

interface ChartConfigFormProps {
  config: Config | null;
  columns: Array<{ name: string }>;
  rows?: Result[];
  onConfigChange: (config: Config) => void;
  onCancel?: () => void;
  inline?: boolean;
  sqlEditor?: React.ReactNode;
}

export function ChartConfigForm({
  config,
  columns,
  rows = [],
  onConfigChange,
  onCancel,
  inline = false,
  sqlEditor,
}: ChartConfigFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [chartType, setChartType] = useState<string>(config?.type || "line");
  const [multipleLines, setMultipleLines] = useState<boolean>(
    config?.multipleLines || false,
  );
  const [categoryColumn, setCategoryColumn] = useState<string>(
    config?.categoryColumn || "",
  );
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    config?.lineCategories || [],
  );

  // Get distinct values for a column
  const getDistinctValues = (columnName: string): string[] => {
    if (!rows || rows.length === 0) return [];
    const values = rows.map((row) => String(row[columnName])).filter(Boolean);
    return Array.from(new Set(values)).sort();
  };

  const availableCategories = categoryColumn
    ? getDistinctValues(categoryColumn)
    : [];

  const toggleCategory = (category: string) => {
    setSelectedCategories((prev) =>
      prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category],
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
    e.stopPropagation();
    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    processFormData(formData);
  };

  const handleButtonClick = () => {
    if (inline && containerRef.current) {
      // When inline, read values from the container div
      const formData = new FormData();
      const container = containerRef.current;

      // Helper to get input value
      const getValue = (name: string): string | null => {
        const el = container.querySelector(`[name="${name}"]`) as
          | HTMLInputElement
          | HTMLSelectElement
          | null;
        return el?.value ?? null;
      };

      // Helper to get checked radio value
      const getRadioValue = (name: string): string | null => {
        const el = container.querySelector(
          `[name="${name}"]:checked`,
        ) as HTMLInputElement | null;
        return el?.value ?? null;
      };

      // Helper to get all checked checkbox values
      const getCheckedValues = (name: string): string[] => {
        const els = container.querySelectorAll(
          `[name="${name}"]:checked`,
        ) as NodeListOf<HTMLInputElement>;
        return Array.from(els).map((el) => el.value);
      };

      // Build FormData
      formData.append("type", getRadioValue("type") || chartType);
      formData.append("title", getValue("title") || "");
      formData.append("description", getValue("description") || "");
      formData.append("takeaway", getValue("takeaway") || "");
      formData.append("xKey", getValue("xKey") || "");

      getCheckedValues("yKeys").forEach((val) => {
        formData.append("yKeys", val);
      });

      // Handle countMode checkbox separately
      const countModeChecked = container.querySelector(
        `[name="countMode"]:checked`,
      ) as HTMLInputElement | null;
      if (countModeChecked) {
        formData.append("countMode", "true");
      }

      formData.append(
        "legend",
        getRadioValue("legend") || (config?.legend ? "yes" : "no"),
      );
      formData.append("multipleLines", multipleLines ? "yes" : "no");
      formData.append("measurementColumn", getValue("measurementColumn") || "");
      formData.append("categoryColumn", categoryColumn || "");

      selectedCategories.forEach((cat) => {
        formData.append("lineCategories", cat);
      });

      formData.append(
        "showGrid",
        getRadioValue("showGrid") ||
          (config?.showGrid !== false ? "true" : "false"),
      );
      formData.append(
        "showXAxis",
        getRadioValue("showXAxis") ||
          (config?.showXAxis !== false ? "true" : "false"),
      );
      formData.append(
        "showYAxis",
        getRadioValue("showYAxis") ||
          (config?.showYAxis !== false ? "true" : "false"),
      );
      formData.append(
        "showDots",
        getRadioValue("showDots") ||
          (config?.showDots !== false ? "true" : "false"),
      );
      formData.append(
        "showTooltip",
        getRadioValue("showTooltip") ||
          (config?.showTooltip !== false ? "true" : "false"),
      );
      formData.append(
        "lineSize",
        getValue("lineSize") || String(config?.lineSize ?? 2),
      );
      formData.append("suffixLabelY", getValue("suffixLabelY") || "");
      formData.append(
        "labelYAngle",
        getValue("labelYAngle") || String(config?.labelYAngle ?? -90),
      );
      formData.append(
        "referenceLineLabel",
        getValue("referenceLineLabel") || "",
      );

      processFormData(formData);
    } else if (formRef.current) {
      const formData = new FormData(formRef.current);
      processFormData(formData);
    }
  };

  const processFormData = (formData: FormData) => {
    const getBooleanField = (name: string, fallback: boolean): boolean => {
      const value = formData.get(name);
      if (value === null) return fallback;
      return String(value) === "true";
    };

    const getNumberField = (
      name: string,
      fallback: number | undefined,
    ): number | undefined => {
      const value = formData.get(name);
      if (value === null || value === "") return fallback;
      const parsed = Number(value);
      return Number.isNaN(parsed) ? fallback : parsed;
    };
    const visualType = formData.get("type") || config?.type ? "chart" : "table";

    const newConfig: Config = {
      description: formData.get("description") as string,
      takeaway: formData.get("takeaway") as string,
      type: formData.get("type") as "bar" | "line" | "area" | "pie",
      title: formData.get("title") as string,
      xKey: formData.get("xKey") as string,
      yKeys: formData.getAll("yKeys") as string[],
      legend: formData.get("legend") === "yes",
      multipleLines: formData.get("multipleLines") === "yes",
      measurementColumn:
        (formData.get("measurementColumn") as string) || undefined,
      categoryColumn: (formData.get("categoryColumn") as string) || undefined,
      lineCategories:
        (formData.getAll("lineCategories") as string[]) || undefined,
      colors: undefined,
      countMode: formData.get("countMode") === "true",
      showGrid: getBooleanField("showGrid", config?.showGrid ?? true),
      showXAxis: getBooleanField("showXAxis", config?.showXAxis ?? true),
      showYAxis: getBooleanField("showYAxis", config?.showYAxis ?? true),
      showDots: getBooleanField("showDots", config?.showDots ?? true),
      showTooltip: getBooleanField("showTooltip", config?.showTooltip ?? true),
      lineSize: getNumberField("lineSize", config?.lineSize ?? 2),
      visualType,
      suffixLabelY:
        ((formData.get("suffixLabelY") as string) || "").trim() || undefined,
      labelYAngle: getNumberField("labelYAngle", config?.labelYAngle ?? -90),
      referenceLineLabel:
        ((formData.get("referenceLineLabel") as string) || "").trim() ||
        undefined,
    };

    // If multipleLines is enabled, ensure measurementColumn is in yKeys and legend is enabled
    if (newConfig.multipleLines && newConfig.measurementColumn) {
      if (!newConfig.yKeys.includes(newConfig.measurementColumn)) {
        newConfig.yKeys = [
          ...new Set([...newConfig.yKeys, newConfig.measurementColumn]),
        ];
      }
      newConfig.legend = true;
    }

    onConfigChange(newConfig);
  };

  const formContent = (
    <div ref={inline ? containerRef : undefined}>
      <Tabs defaultValue="data" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="data">Data</TabsTrigger>
          <TabsTrigger value="content">Content</TabsTrigger>
          <TabsTrigger value="appearance">Appearance</TabsTrigger>
          <TabsTrigger value="advanced">Advanced</TabsTrigger>
        </TabsList>

        <TabsContent value="data" className="space-y-6 mt-4">
          {sqlEditor ? (
            <>
              {sqlEditor}
              <Separator />
            </>
          ) : null}

          {/* Chart Type */}
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Chart type</legend>
            <div className="flex gap-2">
              {(
                [
                  { type: "line", icon: LineChart, label: "Line" },
                  { type: "bar", icon: BarChart3, label: "Bar" },
                  { type: "pie", icon: PieChart, label: "Pie" },
                  { type: "stackbar", icon: Layers, label: "StackBar" },
                  { type: "area", icon: AreaChart, label: "Area" },
                ] as const
              ).map(({ type, icon: Icon, label }) => (
                <label key={type} className="cursor-pointer">
                  <input
                    type="radio"
                    name="type"
                    value={type}
                    checked={chartType === type}
                    onChange={(e) => setChartType(e.target.value)}
                    className="sr-only peer"
                  />
                  <div
                    className="flex flex-col items-center gap-1 px-4 py-2 border rounded-lg hover:bg-card-foreground/10 peer-checked:bg-card-foreground/10 peer-checked:border-card-foreground/20"
                    title={label}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="text-xs">{label}</span>
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
                X-Axis Column (categories)
              </label>
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
            <legend className="text-sm font-medium">
              Y-Axis Columns (values)
            </legend>
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
                  name="countMode"
                  value="true"
                  defaultChecked={config?.countMode}
                  className="rounded border-input"
                />
                <span className="text-sm">Count (aggregate by X-axis)</span>
              </label>
            </div>
          </fieldset>

          {/* Multi-line Configuration (for line charts only) */}
          {chartType === "line" && (
            <>
              <Separator />

              <fieldset className="space-y-3">
                <legend className="text-sm font-medium">
                  Multi-line Chart
                </legend>
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
                      <label
                        htmlFor="categoryColumn"
                        className="text-sm font-medium"
                      >
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
                        <legend className="text-sm font-medium">
                          Categories
                        </legend>
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
                            {selectedCategories.length ===
                            availableCategories.length
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
                                  checked={selectedCategories.includes(
                                    category,
                                  )}
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
                      <label
                        htmlFor="measurementColumn"
                        className="text-sm font-medium"
                      >
                        Measurement Column
                      </label>
                      <p className="text-xs text-gray-500">
                        The numeric column to measure (e.g., num_unicorns,
                        revenue)
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
            </>
          )}
        </TabsContent>

        <TabsContent value="content" className="space-y-6 mt-4">
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
        </TabsContent>

        <TabsContent value="appearance" className="space-y-6 mt-4">
          {/* Hide Legend */}
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Legend</legend>
            <div className="flex gap-2">
              <label className="cursor-pointer">
                <input
                  type="radio"
                  name="legend"
                  value="yes"
                  defaultChecked={config?.legend}
                  className="sr-only peer"
                />
                <div className="px-4 py-2 border rounded-lg hover:bg-card-foreground/10 peer-checked:bg-card-foreground/10 peer-checked:border-card-foreground/20">
                  Show
                </div>
              </label>
              <label className="cursor-pointer">
                <input
                  type="radio"
                  name="legend"
                  value="no"
                  defaultChecked={!config?.legend}
                  className="sr-only peer"
                />
                <div className="px-4 py-2 border rounded-lg hover:bg-card-foreground/10 peer-checked:bg-card-foreground/10 peer-checked:border-card-foreground/20">
                  Hide
                </div>
              </label>
            </div>
          </fieldset>

          <Separator />

          {/* Hide Grid */}
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Grid</legend>
            <div className="flex gap-2">
              <label className="cursor-pointer">
                <input
                  type="radio"
                  name="showGrid"
                  value="true"
                  defaultChecked={config?.showGrid ?? true}
                  className="sr-only peer"
                />
                <div className="px-4 py-2 border rounded-lg hover:bg-card-foreground/10 peer-checked:bg-card-foreground/10 peer-checked:border-card-foreground/20">
                  Show
                </div>
              </label>
              <label className="cursor-pointer">
                <input
                  type="radio"
                  name="showGrid"
                  value="false"
                  defaultChecked={config?.showGrid === false}
                  className="sr-only peer"
                />
                <div className="px-4 py-2 border rounded-lg hover:bg-card-foreground/10 peer-checked:bg-card-foreground/10 peer-checked:border-card-foreground/20">
                  Hide
                </div>
              </label>
            </div>
          </fieldset>

          <Separator />

          {/* Hide Dots */}
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Dots</legend>
            <div className="flex gap-2">
              <label className="cursor-pointer">
                <input
                  type="radio"
                  name="showDots"
                  value="true"
                  defaultChecked={config?.showDots ?? true}
                  className="sr-only peer"
                />
                <div className="px-4 py-2 border rounded-lg hover:bg-card-foreground/10 peer-checked:bg-card-foreground/10 peer-checked:border-card-foreground/20">
                  Show
                </div>
              </label>
              <label className="cursor-pointer">
                <input
                  type="radio"
                  name="showDots"
                  value="false"
                  defaultChecked={config?.showDots === false}
                  className="sr-only peer"
                />
                <div className="px-4 py-2 border rounded-lg hover:bg-card-foreground/10 peer-checked:bg-card-foreground/10 peer-checked:border-card-foreground/20">
                  Hide
                </div>
              </label>
            </div>
          </fieldset>

          <Separator />

          {/* Hide Tooltip */}
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Tooltip</legend>
            <p className="text-xs text-gray-500">
              Show/Hide tooltip when hover on graph
            </p>
            <div className="flex gap-2">
              <label className="cursor-pointer">
                <input
                  type="radio"
                  name="showTooltip"
                  value="true"
                  defaultChecked={config?.showTooltip ?? true}
                  className="sr-only peer"
                />
                <div className="px-4 py-2 border rounded-lg hover:bg-card-foreground/10 peer-checked:bg-card-foreground/10 peer-checked:border-card-foreground/20">
                  Show
                </div>
              </label>
              <label className="cursor-pointer">
                <input
                  type="radio"
                  name="showTooltip"
                  value="false"
                  defaultChecked={config?.showTooltip === false}
                  className="sr-only peer"
                />
                <div className="px-4 py-2 border rounded-lg hover:bg-card-foreground/10 peer-checked:bg-card-foreground/10 peer-checked:border-card-foreground/20">
                  Hide
                </div>
              </label>
            </div>
          </fieldset>

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
              defaultValue={config?.lineSize ?? 2}
              min="1"
              max="10"
            />
          </div>
        </TabsContent>

        <TabsContent value="advanced" className="space-y-6 mt-4">
          {/* X Axis and Y Axis side by side */}
          <div className="grid grid-cols-2 gap-4">
            {/* Hide X Axis */}
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">X Axis</legend>
              <div className="flex gap-2">
                <label className="cursor-pointer">
                  <input
                    type="radio"
                    name="showXAxis"
                    value="true"
                    defaultChecked={config?.showXAxis ?? true}
                    className="sr-only peer"
                  />
                  <div className="px-4 py-2 border rounded-lg hover:bg-card-foreground/10 peer-checked:bg-card-foreground/10 peer-checked:border-card-foreground/20">
                    Show
                  </div>
                </label>
                <label className="cursor-pointer">
                  <input
                    type="radio"
                    name="showXAxis"
                    value="false"
                    defaultChecked={config?.showXAxis === false}
                    className="sr-only peer"
                  />
                  <div className="px-4 py-2 border rounded-lg hover:bg-card-foreground/10 peer-checked:bg-card-foreground/10 peer-checked:border-card-foreground/20">
                    Hide
                  </div>
                </label>
              </div>
            </fieldset>

            {/* Hide Y Axis */}
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">Y Axis</legend>
              <div className="flex gap-2">
                <label className="cursor-pointer">
                  <input
                    type="radio"
                    name="showYAxis"
                    value="true"
                    defaultChecked={config?.showYAxis ?? true}
                    className="sr-only peer"
                  />
                  <div className="px-4 py-2 border rounded-lg hover:bg-card-foreground/10 peer-checked:bg-card-foreground/10 peer-checked:border-card-foreground/20">
                    Show
                  </div>
                </label>
                <label className="cursor-pointer">
                  <input
                    type="radio"
                    name="showYAxis"
                    value="false"
                    defaultChecked={config?.showYAxis === false}
                    className="sr-only peer"
                  />
                  <div className="px-4 py-2 border rounded-lg hover:bg-card-foreground/10 peer-checked:bg-card-foreground/10 peer-checked:border-card-foreground/20">
                    Hide
                  </div>
                </label>
              </div>
            </fieldset>
          </div>

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
            <Input
              id="suffixLabelY"
              name="suffixLabelY"
              placeholder=""
              defaultValue={config?.suffixLabelY ?? ""}
            />
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
              defaultValue={config?.labelYAngle ?? -90}
              min="-90"
              max="90"
            />
          </div>

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
              defaultValue={config?.referenceLineLabel ?? ""}
            />
          </div>
        </TabsContent>

        <div className="flex justify-end gap-2 pt-4 mt-6 border-t">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
          {inline ? (
            <Button type="button" onClick={handleButtonClick}>
              Apply
            </Button>
          ) : (
            <Button type="submit">Apply</Button>
          )}
        </div>
      </Tabs>
    </div>
  );

  if (inline) {
    return formContent;
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit}>
      {formContent}
    </form>
  );
}

interface ChartConfigDialogProps {
  trigger: React.ReactNode;
  config: Config | null;
  columns: Array<{ name: string }>;
  rows?: Result[];
  onConfigChange: (config: Config) => void;
  tooltip?: string;
  sql?: string;
  dbIdentifier?: string;
  backendPreference?: SqlBackendPreference;
  onSqlSave?: (newSql: string) => Promise<void>;
}

export function ChartConfigDialog({
  trigger,
  config,
  columns,
  rows = [],
  onConfigChange,
  tooltip,
  sql,
  dbIdentifier,
  backendPreference,
  onSqlSave,
}: ChartConfigDialogProps) {
  const [open, setOpen] = useState(false);
  const [sqlPreviewRows, setSqlPreviewRows] = useState<Result[] | null>(null);
  const [sqlPreviewColumns, setSqlPreviewColumns] = useState<Array<{
    name: string;
  }> | null>(null);

  const handleConfigChange = (newConfig: Config) => {
    onConfigChange(newConfig);
    setOpen(false);
  };

  const handleSqlRun = (result: SqlPreviewRunResult) => {
    setSqlPreviewRows(result.rows as Result[]);
    setSqlPreviewColumns(
      result.columns.map((column) => ({ name: column.name })),
    );
  };

  const handleSqlSave = async (newSql: string) => {
    await onSqlSave?.(newSql);
    setSqlPreviewRows(null);
    setSqlPreviewColumns(null);
  };

  const effectiveRows = sqlPreviewRows ?? rows;
  const effectiveColumns = sqlPreviewColumns ?? columns;
  const canEditSql = Boolean(sql && onSqlSave);
  const sqlEditor = canEditSql ? (
    <SqlPreviewPanel
      query={sql ?? ""}
      dbIdentifier={dbIdentifier}
      backendPreference={backendPreference}
      defaultOpen={false}
      onSave={handleSqlSave}
      onRunStart={() => {
        setSqlPreviewRows([]);
        setSqlPreviewColumns(null);
      }}
      onRun={handleSqlRun}
      onCancel={() => {
        setSqlPreviewRows(null);
        setSqlPreviewColumns(null);
      }}
    />
  ) : undefined;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {tooltip ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>{trigger}</DialogTrigger>
          </TooltipTrigger>
          <TooltipContent>
            <p>{tooltip}</p>
          </TooltipContent>
        </Tooltip>
      ) : (
        <DialogTrigger asChild>{trigger}</DialogTrigger>
      )}
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto bg-card">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-gray-500">⚙️</span>
            Parameters
          </DialogTitle>
        </DialogHeader>
        <ChartConfigForm
          config={config}
          columns={effectiveColumns}
          rows={effectiveRows}
          onConfigChange={handleConfigChange}
          onCancel={() => setOpen(false)}
          sqlEditor={sqlEditor}
        />
      </DialogContent>
    </Dialog>
  );
}
