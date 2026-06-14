import {
  AreaChart,
  BarChart3,
  Layers,
  LineChart,
  PieChart,
  Settings2,
  Type,
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

  const pillToggle = (
    name: string,
    value: string,
    label: string,
    checked: boolean,
  ) => (
    <label className="cursor-pointer">
      <input
        type="radio"
        name={name}
        value={value}
        defaultChecked={checked}
        className="sr-only peer"
      />
      <div className="px-3 py-1.5 border rounded-md text-sm transition-colors hover:bg-muted peer-checked:bg-primary/10 peer-checked:border-primary/30 peer-checked:text-primary">
        {label}
      </div>
    </label>
  );

  const formContent = (
    <div ref={inline ? containerRef : undefined}>
      <Tabs defaultValue="data" className="w-full">
        <TabsList className="grid w-full grid-cols-2 h-10">
          <TabsTrigger value="data" className="gap-1.5">
            <Settings2 className="h-4 w-4" />
            Data & Content
          </TabsTrigger>
          <TabsTrigger value="style" className="gap-1.5">
            <Type className="h-4 w-4" />
            Appearance
          </TabsTrigger>
        </TabsList>

        <TabsContent value="data" className="mt-5">
          {sqlEditor ? (
            <>
              {sqlEditor}
              <Separator className="my-5" />
            </>
          ) : null}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-5">
            {/* Left column – Data mapping */}
            <div className="space-y-5">
              {/* Chart Type */}
              <fieldset className="space-y-2">
                <legend className="text-sm font-semibold">Chart type</legend>
                <div className="flex flex-wrap gap-1.5">
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
                        className="flex items-center gap-1.5 px-3 py-1.5 border rounded-md text-sm transition-colors hover:bg-muted peer-checked:bg-primary/10 peer-checked:border-primary/30 peer-checked:text-primary"
                        title={label}
                      >
                        <Icon className="w-4 h-4" />
                        {label}
                      </div>
                    </label>
                  ))}
                </div>
              </fieldset>

              <Separator />

              {/* X-Axis Configuration */}
              <div className="space-y-2">
                <label htmlFor="xKey" className="text-sm font-semibold">
                  X-Axis Column
                </label>
                <p className="text-xs text-muted-foreground">
                  Category or label column
                </p>
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

              {/* Y-Axis Configuration */}
              <fieldset className="space-y-2">
                <legend className="text-sm font-semibold">
                  Y-Axis Columns (values)
                </legend>
                <div className="space-y-1.5 max-h-36 overflow-y-auto border rounded-md p-2 bg-muted/20">
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
                  <label className="flex items-center gap-2 cursor-pointer pt-1 border-t mt-1">
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
                <div className="space-y-4">
                  <Separator />

                  <fieldset className="space-y-2">
                    <legend className="text-sm font-semibold">
                      Multi-line Chart
                    </legend>
                    <p className="text-xs text-muted-foreground">
                      Compare multiple categories as separate lines
                    </p>
                    <div className="flex gap-1.5">
                      <label className="cursor-pointer">
                        <input
                          type="radio"
                          name="multipleLines"
                          value="yes"
                          checked={multipleLines}
                          onChange={() => setMultipleLines(true)}
                          className="sr-only peer"
                        />
                        <div className="px-3 py-1.5 border rounded-md text-sm transition-colors hover:bg-muted peer-checked:bg-primary/10 peer-checked:border-primary/30 peer-checked:text-primary">
                          On
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
                        <div className="px-3 py-1.5 border rounded-md text-sm transition-colors hover:bg-muted peer-checked:bg-primary/10 peer-checked:border-primary/30 peer-checked:text-primary">
                          Off
                        </div>
                      </label>
                    </div>
                  </fieldset>

                  {multipleLines && (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label
                          htmlFor="categoryColumn"
                          className="text-sm font-semibold"
                        >
                          Category Column
                        </label>
                        <p className="text-xs text-muted-foreground">
                          Column to group lines by
                        </p>
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
                        <fieldset className="space-y-2">
                          <legend className="text-sm font-semibold">
                            Categories
                          </legend>
                          <div className="flex items-center justify-between">
                            <p className="text-xs text-muted-foreground">
                              Select which categories to display
                            </p>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={toggleAllCategories}
                              className="h-6 text-xs"
                            >
                              {selectedCategories.length ===
                              availableCategories.length
                                ? "Deselect All"
                                : "Select All"}
                            </Button>
                          </div>
                          <div className="space-y-1.5 max-h-32 overflow-y-auto border rounded-md p-2 bg-muted/20">
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
                        </fieldset>
                      )}

                      <div className="space-y-2">
                        <label
                          htmlFor="measurementColumn"
                          className="text-sm font-semibold"
                        >
                          Measurement Column
                        </label>
                        <p className="text-xs text-muted-foreground">
                          Numeric column to measure
                        </p>
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
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right column – Content */}
            <div className="space-y-5">
              <div className="space-y-2">
                <label htmlFor="title" className="text-sm font-semibold">
                  Chart Title
                </label>
                <Input
                  id="title"
                  name="title"
                  defaultValue={config?.title || ""}
                  placeholder="Title shown above the chart"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="description" className="text-sm font-semibold">
                  Description
                </label>
                <Input
                  id="description"
                  name="description"
                  defaultValue={config?.description || ""}
                  placeholder="Brief description of what the chart shows"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="takeaway" className="text-sm font-semibold">
                  Key Takeaway
                </label>
                <Input
                  id="takeaway"
                  name="takeaway"
                  defaultValue={config?.takeaway || ""}
                  placeholder="Main insight or conclusion"
                />
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="style" className="mt-5">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-6">
            {/* Visibility toggles */}
            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold">Legend</legend>
              <div className="flex gap-1.5">
                {pillToggle("legend", "yes", "Show", config?.legend || false)}
                {pillToggle("legend", "no", "Hide", !config?.legend)}
              </div>
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold">Grid</legend>
              <div className="flex gap-1.5">
                {pillToggle(
                  "showGrid",
                  "true",
                  "Show",
                  config?.showGrid ?? true,
                )}
                {pillToggle(
                  "showGrid",
                  "false",
                  "Hide",
                  config?.showGrid === false,
                )}
              </div>
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold">Dots</legend>
              <div className="flex gap-1.5">
                {pillToggle(
                  "showDots",
                  "true",
                  "Show",
                  config?.showDots ?? true,
                )}
                {pillToggle(
                  "showDots",
                  "false",
                  "Hide",
                  config?.showDots === false,
                )}
              </div>
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold">Tooltip</legend>
              <p className="text-xs text-muted-foreground">On hover</p>
              <div className="flex gap-1.5">
                {pillToggle(
                  "showTooltip",
                  "true",
                  "Show",
                  config?.showTooltip ?? true,
                )}
                {pillToggle(
                  "showTooltip",
                  "false",
                  "Hide",
                  config?.showTooltip === false,
                )}
              </div>
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold">X Axis</legend>
              <div className="flex gap-1.5">
                {pillToggle(
                  "showXAxis",
                  "true",
                  "Show",
                  config?.showXAxis ?? true,
                )}
                {pillToggle(
                  "showXAxis",
                  "false",
                  "Hide",
                  config?.showXAxis === false,
                )}
              </div>
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold">Y Axis</legend>
              <div className="flex gap-1.5">
                {pillToggle(
                  "showYAxis",
                  "true",
                  "Show",
                  config?.showYAxis ?? true,
                )}
                {pillToggle(
                  "showYAxis",
                  "false",
                  "Hide",
                  config?.showYAxis === false,
                )}
              </div>
            </fieldset>
          </div>

          <Separator className="my-6" />

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-5">
            <div className="space-y-2">
              <label htmlFor="lineSize" className="text-sm font-semibold">
                Line Width
              </label>
              <p className="text-xs text-muted-foreground">In pixels</p>
              <Input
                id="lineSize"
                name="lineSize"
                type="number"
                defaultValue={config?.lineSize ?? 2}
                min="1"
                max="10"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="labelYAngle" className="text-sm font-semibold">
                Y-Label Angle
              </label>
              <p className="text-xs text-muted-foreground">
                Rotation in degrees
              </p>
              <Input
                id="labelYAngle"
                name="labelYAngle"
                type="number"
                defaultValue={config?.labelYAngle ?? -90}
                min="-90"
                max="90"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="suffixLabelY" className="text-sm font-semibold">
                Y-Label Suffix
              </label>
              <p className="text-xs text-muted-foreground">e.g. %, USD, kg</p>
              <Input
                id="suffixLabelY"
                name="suffixLabelY"
                placeholder=""
                defaultValue={config?.suffixLabelY ?? ""}
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="referenceLineLabel"
                className="text-sm font-semibold"
              >
                Reference Line Label
              </label>
              <p className="text-xs text-muted-foreground">Optional</p>
              <Input
                id="referenceLineLabel"
                name="referenceLineLabel"
                placeholder=""
                defaultValue={config?.referenceLineLabel ?? ""}
              />
            </div>
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
      alwaysOpen
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
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto bg-card p-6">
        <DialogHeader className="pb-2">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Settings2 className="h-5 w-5 text-muted-foreground" />
            Chart Settings
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
