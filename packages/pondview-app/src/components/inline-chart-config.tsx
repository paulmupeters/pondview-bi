import { AreaChart, BarChart3, LineChart, PieChart } from "lucide-react";
import { useMemo } from "react";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import type { CardConfig, Config, Result } from "@/lib/types";
import { cn } from "@/lib/utils";

interface InlineChartConfigProps {
  chartConfig: Config | null;
  defaultChartConfig: Config;
  onChartConfigChange: (config: Config | null) => void;
  columns: { name: string; type?: string }[];
  rows?: Result[];

  cardConfig?: CardConfig | null;
  onCardConfigChange?: (config: CardConfig | null) => void;
  isCardMode?: boolean;

  showAdvancedConfig?: boolean;
  onToggleAdvanced?: () => void;
  hideNarrativeFields?: boolean;

  /** Use a single-column layout suitable for narrow sidebars */
  sidebar?: boolean;
}

export function InlineChartConfig({
  chartConfig,
  defaultChartConfig,
  onChartConfigChange,
  columns,
  rows = [],
  cardConfig,
  onCardConfigChange,
  isCardMode = false,
  showAdvancedConfig = false,
  onToggleAdvanced,
  hideNarrativeFields = false,
  sidebar = false,
}: InlineChartConfigProps) {
  const effectiveChartConfig = chartConfig ?? defaultChartConfig;

  const updateChartConfig = (updater: (config: Config) => Config) => {
    onChartConfigChange(updater(effectiveChartConfig));
  };

  const updateCardConfig = (updater: (config: CardConfig) => CardConfig) => {
    if (!onCardConfigChange) return;
    const current = cardConfig ?? {
      configType: "card" as const,
      title: "",
      description: "",
    };
    onCardConfigChange(updater(current));
  };

  const handleColorChange = (color?: string) => {
    updateChartConfig((config) => {
      if (!config.yKeys.length) {
        return { ...config };
      }
      if (!color) {
        return { ...config, colors: undefined };
      }
      return {
        ...config,
        colors: {
          ...(config.colors ?? {}),
          [config.yKeys[0]]: color,
        },
      };
    });
  };

  const primaryYKey = effectiveChartConfig.yKeys[0];
  const selectedColor =
    primaryYKey && effectiveChartConfig.colors
      ? effectiveChartConfig.colors[primaryYKey]
      : undefined;

  const chartColorOptions = useMemo(
    () => Array.from({ length: 5 }, (_, idx) => `var(--chart-${idx + 1})`),
    [],
  );

  const getDistinctValues = (columnName: string): string[] => {
    if (!rows || rows.length === 0) return [];
    const values = rows.map((row) => String(row[columnName])).filter(Boolean);
    return Array.from(new Set(values)).sort();
  };

  const availableCategories = effectiveChartConfig.categoryColumn
    ? getDistinctValues(effectiveChartConfig.categoryColumn)
    : [];

  const toggleCategory = (category: string) => {
    const currentCategories = effectiveChartConfig.lineCategories ?? [];
    const newCategories = currentCategories.includes(category)
      ? currentCategories.filter((c) => c !== category)
      : [...currentCategories, category];

    updateChartConfig((config) => ({
      ...config,
      lineCategories: newCategories.length > 0 ? newCategories : undefined,
    }));
  };

  const toggleAllCategories = () => {
    const currentCategories = effectiveChartConfig.lineCategories ?? [];
    if (currentCategories.length === availableCategories.length) {
      updateChartConfig((config) => ({
        ...config,
        lineCategories: undefined,
      }));
    } else {
      updateChartConfig((config) => ({
        ...config,
        lineCategories: availableCategories,
      }));
    }
  };

  /* ------------------------------------------------------------------ */
  /* Card config                                                        */
  /* ------------------------------------------------------------------ */

  if (isCardMode && onCardConfigChange) {
    return (
      <div className="border-t border-border/60 bg-card/30">
        <div className="flex flex-wrap items-end gap-x-4 gap-y-2 px-4 py-2.5">
          <ControlGroup label="Title">
            <CompactInput
              type="text"
              value={cardConfig?.title ?? ""}
              onChange={(e) =>
                updateCardConfig((config) => ({
                  ...config,
                  title: e.target.value,
                }))
              }
            />
          </ControlGroup>
          <ControlGroup label="Description">
            <CompactInput
              type="text"
              value={cardConfig?.description ?? ""}
              onChange={(e) =>
                updateCardConfig((config) => ({
                  ...config,
                  description: e.target.value,
                }))
              }
            />
          </ControlGroup>
          <ControlGroup label="Takeaway">
            <CompactInput
              type="text"
              value={cardConfig?.takeaway ?? ""}
              onChange={(e) =>
                updateCardConfig((config) => ({
                  ...config,
                  takeaway: e.target.value.trim() || undefined,
                }))
              }
            />
          </ControlGroup>
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------------ */
  /* Chart config                                                       */
  /* ------------------------------------------------------------------ */

  return (
    <div className="border-t border-border/60 bg-card/30">
      {/* Primary row */}
      <div className="flex flex-wrap items-end gap-x-5 gap-y-2 px-4 py-2.5">
        <ControlGroup label="Type">
          <div className="flex gap-0.5 rounded-md border border-border/60 bg-card p-0.5">
            {(
              [
                { type: "line" as const, icon: LineChart, label: "Line" },
                { type: "bar" as const, icon: BarChart3, label: "Bar" },
                { type: "area" as const, icon: AreaChart, label: "Area" },
                { type: "pie" as const, icon: PieChart, label: "Pie" },
              ] as const
            ).map(({ type, icon: Icon, label }) => (
              <button
                key={type}
                type="button"
                title={`${label} Chart`}
                onClick={() =>
                  updateChartConfig((config) => ({ ...config, type }))
                }
                className={cn(
                  "rounded p-1 transition-colors",
                  effectiveChartConfig.type === type
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" />
              </button>
            ))}
          </div>
        </ControlGroup>

        <ControlGroup label="X Axis">
          <CompactSelect
            value={effectiveChartConfig.xKey}
            onChange={(e) =>
              updateChartConfig((config) => ({
                ...config,
                xKey: e.target.value,
              }))
            }
            options={columns.map((c) => c.name)}
          />
        </ControlGroup>

        <ControlGroup label="Y Axis">
          <CompactSelect
            value={effectiveChartConfig.yKeys[0] ?? ""}
            onChange={(e) =>
              updateChartConfig((config) => ({
                ...config,
                yKeys: e.target.value ? [e.target.value] : [],
              }))
            }
            options={columns.map((c) => c.name)}
            placeholder="Select"
          />
        </ControlGroup>

        <ControlGroup label="Color">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label="Default"
              title="Default"
              className={cn(
                "size-4 rounded-full border border-input bg-background transition-all",
                !selectedColor && "ring-2 ring-primary ring-offset-1",
              )}
              onClick={() => handleColorChange(undefined)}
            />
            {chartColorOptions.map((color, index) => {
              const isSelected = selectedColor === color;
              return (
                <button
                  key={color}
                  type="button"
                  aria-label={`Color ${index + 1}`}
                  title={`Color ${index + 1}`}
                  className={cn(
                    "size-4 rounded-full border border-border transition-all",
                    isSelected && "ring-2 ring-primary ring-offset-1",
                  )}
                  style={{ backgroundColor: color }}
                  onClick={() => handleColorChange(color)}
                />
              );
            })}
          </div>
        </ControlGroup>
      </div>

      {/* Quick toggles */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-1.5 border-t border-border/40">
        <MiniSwitch
          label="Legend"
          value={effectiveChartConfig.legend}
          onChange={(v) =>
            updateChartConfig((config) => ({ ...config, legend: v }))
          }
        />
        <MiniSwitch
          label="Grid"
          value={effectiveChartConfig.showGrid !== false}
          onChange={(v) =>
            updateChartConfig((config) => ({ ...config, showGrid: v }))
          }
        />
        <MiniSwitch
          label="Dots"
          value={effectiveChartConfig.showDots !== false}
          onChange={(v) =>
            updateChartConfig((config) => ({ ...config, showDots: v }))
          }
        />
        {effectiveChartConfig.type === "line" && (
          <MiniSwitch
            label="Line"
            value={effectiveChartConfig.showLine !== false}
            onChange={(v) =>
              updateChartConfig((config) => ({ ...config, showLine: v }))
            }
          />
        )}
        <MiniSwitch
          label="Tooltip"
          value={effectiveChartConfig.showTooltip !== false}
          onChange={(v) =>
            updateChartConfig((config) => ({ ...config, showTooltip: v }))
          }
        />
      </div>

      {/* Advanced */}
      <Collapsible open={showAdvancedConfig} onOpenChange={onToggleAdvanced}>
        <CollapsibleContent>
          <div
            className={cn(
              "gap-3 px-4 py-3 border-t border-border/40 bg-card/20",
              sidebar ? "flex flex-col" : "grid grid-cols-2 sm:grid-cols-4",
            )}
          >
            {!hideNarrativeFields && (
              <>
                <ControlGroup label="Title">
                  <CompactInput
                    type="text"
                    value={effectiveChartConfig.title}
                    onChange={(e) =>
                      updateChartConfig((config) => ({
                        ...config,
                        title: e.target.value,
                      }))
                    }
                  />
                </ControlGroup>
                <ControlGroup label="Description">
                  <CompactInput
                    type="text"
                    value={effectiveChartConfig.description || ""}
                    onChange={(e) =>
                      updateChartConfig((config) => ({
                        ...config,
                        description: e.target.value,
                      }))
                    }
                  />
                </ControlGroup>
                <ControlGroup label="Takeaway">
                  <CompactInput
                    type="text"
                    value={effectiveChartConfig.takeaway || ""}
                    onChange={(e) =>
                      updateChartConfig((config) => ({
                        ...config,
                        takeaway: e.target.value,
                      }))
                    }
                  />
                </ControlGroup>
                <div className="hidden sm:block" />
              </>
            )}

            <ControlGroup label="Line size">
              <CompactInput
                type="number"
                min={1}
                max={10}
                value={effectiveChartConfig.lineSize ?? 2}
                onChange={(e) =>
                  updateChartConfig((config) => ({
                    ...config,
                    lineSize: Number(e.target.value) || 2,
                  }))
                }
              />
            </ControlGroup>

            <MiniSwitch
              label="X Axis"
              value={effectiveChartConfig.showXAxis !== false}
              onChange={(v) =>
                updateChartConfig((config) => ({
                  ...config,
                  showXAxis: v,
                }))
              }
            />
            <MiniSwitch
              label="Y Axis"
              value={effectiveChartConfig.showYAxis !== false}
              onChange={(v) =>
                updateChartConfig((config) => ({
                  ...config,
                  showYAxis: v,
                }))
              }
            />
            <ControlGroup label="Y Label angle">
              <CompactInput
                type="number"
                min={-90}
                max={90}
                value={effectiveChartConfig.labelYAngle ?? -90}
                onChange={(e) =>
                  updateChartConfig((config) => ({
                    ...config,
                    labelYAngle: Number(e.target.value) || -90,
                  }))
                }
              />
            </ControlGroup>

            <ControlGroup label="Y Suffix">
              <CompactInput
                type="text"
                value={effectiveChartConfig.suffixLabelY || ""}
                onChange={(e) =>
                  updateChartConfig((config) => ({
                    ...config,
                    suffixLabelY: e.target.value.trim() || undefined,
                  }))
                }
              />
            </ControlGroup>
            <ControlGroup label="Reference line">
              <CompactInput
                type="text"
                value={effectiveChartConfig.referenceLineLabel || ""}
                onChange={(e) =>
                  updateChartConfig((config) => ({
                    ...config,
                    referenceLineLabel: e.target.value.trim() || undefined,
                  }))
                }
              />
            </ControlGroup>

            {/* Multi-line */}
            {effectiveChartConfig.type === "line" && (
              <>
                <div className="col-span-2 sm:col-span-4">
                  <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
                    <MiniSwitch
                      label="Multi-line"
                      value={!!effectiveChartConfig.multipleLines}
                      onChange={(v) =>
                        updateChartConfig((config) => ({
                          ...config,
                          multipleLines: v,
                          legend: v ? true : config.legend,
                        }))
                      }
                    />

                    {effectiveChartConfig.multipleLines && (
                      <ControlGroup label="Category">
                        <CompactSelect
                          value={effectiveChartConfig.categoryColumn || ""}
                          onChange={(e) =>
                            updateChartConfig((config) => ({
                              ...config,
                              categoryColumn: e.target.value || undefined,
                              lineCategories: undefined,
                            }))
                          }
                          options={columns.map((c) => c.name)}
                          placeholder="Select"
                        />
                      </ControlGroup>
                    )}

                    {effectiveChartConfig.multipleLines && (
                      <ControlGroup label="Measure">
                        <CompactSelect
                          value={effectiveChartConfig.measurementColumn || ""}
                          onChange={(e) => {
                            const col = e.target.value || undefined;
                            updateChartConfig((config) => ({
                              ...config,
                              measurementColumn: col,
                              yKeys: col
                                ? [...new Set([...config.yKeys, col])]
                                : config.yKeys,
                            }));
                          }}
                          options={columns.map((c) => c.name)}
                          placeholder="Select"
                        />
                      </ControlGroup>
                    )}
                  </div>
                </div>

                {effectiveChartConfig.multipleLines &&
                  availableCategories.length > 0 && (
                    <div className="col-span-2 sm:col-span-4">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/60">
                          Lines
                        </span>
                        <button
                          type="button"
                          onClick={toggleAllCategories}
                          className="text-[10px] text-primary hover:underline"
                        >
                          {(effectiveChartConfig.lineCategories ?? [])
                            .length === availableCategories.length
                            ? "Deselect all"
                            : "Select all"}
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {availableCategories.map((category) => {
                          const isSelected = (
                            effectiveChartConfig.lineCategories ?? []
                          ).includes(category);
                          return (
                            <label
                              key={category}
                              className={cn(
                                "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] cursor-pointer transition-colors",
                                isSelected
                                  ? "border-primary/30 bg-primary/5 text-foreground"
                                  : "border-border/60 bg-card text-muted-foreground hover:border-border",
                              )}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleCategory(category)}
                                className="size-3 rounded-sm"
                              />
                              {category}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}

                {effectiveChartConfig.multipleLines && (
                  <div className="col-span-2 sm:col-span-4">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/60">
                      Y Columns
                    </span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {columns.map((col) => {
                        const isSelected = effectiveChartConfig.yKeys.includes(
                          col.name,
                        );
                        return (
                          <label
                            key={col.name}
                            className={cn(
                              "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] cursor-pointer transition-colors",
                              isSelected
                                ? "border-primary/30 bg-primary/5 text-foreground"
                                : "border-border/60 bg-card text-muted-foreground hover:border-border",
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {
                                updateChartConfig((config) => {
                                  const newYKeys = isSelected
                                    ? config.yKeys.filter((k) => k !== col.name)
                                    : [...config.yKeys, col.name];
                                  return { ...config, yKeys: newYKeys };
                                });
                              }}
                              className="size-3 rounded-sm"
                            />
                            {col.name}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                <MiniSwitch
                  label="Count mode"
                  value={!!effectiveChartConfig.countMode}
                  onChange={(v) =>
                    updateChartConfig((config) => ({
                      ...config,
                      countMode: v,
                    }))
                  }
                />
              </>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Toggle advanced */}
      {onToggleAdvanced && (
        <div className="flex justify-center border-t border-border/40 bg-card/20">
          <button
            type="button"
            onClick={onToggleAdvanced}
            className="px-3 py-1 text-[11px] font-mono uppercase tracking-wider text-muted-foreground/60 hover:text-foreground transition-colors"
          >
            {showAdvancedConfig ? "Less options" : "More options"}
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Primitives                                                         */
/* ------------------------------------------------------------------ */

function ControlGroup({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/60">
        {label}
      </span>
      {children}
    </div>
  );
}

function CompactSelect({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  options: string[];
  placeholder?: string;
}) {
  return (
    <select
      value={value}
      onChange={onChange}
      className="h-7 min-w-[100px] rounded-md border border-border bg-card px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}

function CompactInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="h-7 w-full min-w-[80px] rounded-md border border-border bg-card px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    />
  );
}

function MiniSwitch({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <ControlGroup label={label}>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={cn(
          "inline-flex h-7 w-fit items-center gap-2 rounded-md border border-border/60 bg-card px-2 text-[11px] transition-colors",
          value
            ? "border-primary/30 bg-primary/5 text-primary"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <span
          className={cn(
            "relative inline-flex h-3.5 w-6 items-center rounded-full transition-colors",
            value ? "bg-primary" : "bg-muted-foreground/30",
          )}
        >
          <span
            className={cn(
              "size-2.5 rounded-full bg-background shadow-sm transition-transform",
              value ? "translate-x-3" : "translate-x-0.5",
            )}
          />
        </span>
        {label}
      </button>
    </ControlGroup>
  );
}
