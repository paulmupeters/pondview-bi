"use client";

import { useMemo, useState } from "react";
import type { CardConfig, Config, Result } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Separator } from "./ui/separator";

interface InlineChartConfigProps {
  // Chart config props
  chartConfig: Config | null;
  defaultChartConfig: Config;
  onChartConfigChange: (config: Config | null) => void;
  columns: { name: string; type?: string }[];
  rows?: Result[];
  
  // Card config props (optional)
  cardConfig?: CardConfig | null;
  onCardConfigChange?: (config: CardConfig | null) => void;
  isCardMode?: boolean;
  
  // UI props
  showAdvancedConfig?: boolean;
  onToggleAdvancedConfig?: () => void;
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
  onToggleAdvancedConfig,
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

  // Get distinct values for a column (for multi-line charts)
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

  // Card config UI
  if (isCardMode && onCardConfigChange) {
    return (
      <div className="border-b border-border bg-popover p-2">
        <div className="p-4 py-8 grid grid-cols-2 xxl:grid-cols-4 gap-4">
          <div>
            <label
              htmlFor="card-title"
              className="block text-[10px] text-muted-foreground mb-1 tracking-wider font-bold uppercase"
            >
              Title
            </label>
            <input
              type="text"
              id="card-title"
              className="w-full bg-background border border-input rounded px-2 py-1.5 text-xs focus:outline-none focus:border-primary"
              value={cardConfig?.title ?? ""}
              onChange={(e) =>
                updateCardConfig((config) => ({
                  ...config,
                  title: e.target.value,
                }))
              }
            />
          </div>
          <div>
            <label
              htmlFor="card-description"
              className="block text-[10px] text-muted-foreground mb-1 tracking-wider font-bold uppercase"
            >
              Description
            </label>
            <input
              type="text"
              id="card-description"
              className="w-full bg-background border border-input rounded px-2 py-1.5 text-xs focus:outline-none focus:border-primary"
              value={cardConfig?.description ?? ""}
              onChange={(e) =>
                updateCardConfig((config) => ({
                  ...config,
                  description: e.target.value,
                }))
              }
            />
          </div>
          <div>
            <label
              htmlFor="card-takeaway"
              className="block text-[10px] text-muted-foreground mb-1 tracking-wider font-bold uppercase"
            >
              Takeaway
            </label>
            <input
              type="text"
              id="card-takeaway"
              className="w-full bg-background border border-input rounded px-2 py-1.5 text-xs focus:outline-none focus:border-primary"
              value={cardConfig?.takeaway ?? ""}
              onChange={(e) =>
                updateCardConfig((config) => ({
                  ...config,
                  takeaway: e.target.value.trim() || undefined,
                }))
              }
            />
          </div>
        </div>
      </div>
    );
  }

  // Chart config UI
  return (
    <div className="border-b border-border bg-popover">
      <div className="p-4 py-8 grid grid-cols-2 xxl:grid-cols-4 gap-4">
        <div>
          <label
            htmlFor="visualization"
            className="block text-[10px] text-muted-foreground mb-1 tracking-wider font-bold uppercase"
          >
            Visualization
          </label>
          <select
            id="visualization"
            className="w-full bg-background border border-input rounded px-2 py-1.5 text-xs focus:outline-none focus:border-primary"
            value={effectiveChartConfig.type}
            onChange={(e) =>
              updateChartConfig((config) => ({
                ...config,
                type: e.target.value as Config["type"],
              }))
            }
          >
            <option value="line">Line Chart</option>
            <option value="bar">Bar Chart</option>
            <option value="area">Area Chart</option>
            <option value="pie">Pie Chart</option>
          </select>
        </div>
        <div>
          <label
            htmlFor="color"
            className="block text-[10px] text-muted-foreground mb-1 tracking-wider font-bold uppercase"
          >
            Color
          </label>
          <div className="flex gap-2 items-center h-[26px]">
            <button
              type="button"
              aria-label="Use default color"
              className={cn(
                "w-4 h-4 rounded-full bg-background border border-input cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                !selectedColor && "ring-2 ring-ring ring-offset-2",
              )}
              onClick={() => handleColorChange(undefined)}
            />
            {chartColorOptions.map((color, index) => {
              const isSelected = selectedColor === color;
              return (
                <button
                  key={color}
                  type="button"
                  aria-label={`Use chart color ${index + 1}`}
                  title={`Chart color ${index + 1}`}
                  className="w-4 h-4 rounded-full border border-border cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-ring"
                  style={{
                    backgroundColor: color,
                    boxShadow: isSelected
                      ? `0 0 0 2px var(--background), 0 0 0 4px ${color}`
                      : undefined,
                  }}
                  onClick={() => handleColorChange(color)}
                />
              );
            })}
          </div>
        </div>
        <div>
          <label
            htmlFor="x-axis"
            className="block text-[10px] text-muted-foreground mb-1 tracking-wider font-bold uppercase"
          >
            X-Axis
          </label>
          <select
            className="w-full bg-background border border-input rounded px-2 py-1.5 text-xs focus:outline-none focus:border-primary"
            value={effectiveChartConfig.xKey}
            disabled={!columns.length}
            onChange={(e) =>
              updateChartConfig((config) => ({
                ...config,
                xKey: e.target.value,
              }))
            }
          >
            {columns.map((col) => (
              <option key={col.name} value={col.name}>
                {col.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="y-axis"
            className="block text-[10px] text-muted-foreground mb-1 tracking-wider font-bold uppercase"
          >
            Y-Axis
          </label>
          <select
            className="w-full bg-background border border-input rounded px-2 py-1.5 text-xs focus:outline-none focus:border-primary"
            value={effectiveChartConfig.yKeys[0] ?? ""}
            disabled={!columns.length}
            onChange={(e) =>
              updateChartConfig((config) => ({
                ...config,
                yKeys: e.target.value ? [e.target.value] : [],
              }))
            }
          >
            <option value="">Select column</option>
            {columns.map((col) => (
              <option key={col.name} value={col.name}>
                {col.name}
              </option>
            ))}
          </select>
        </div>
        <Separator className="col-span-2 xxl:col-span-4" />
        <div className="col-span-2 xxl:col-span-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <div className="block text-[10px] text-muted-foreground mb-1 tracking-wider font-bold uppercase">
              Legend
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() =>
                  updateChartConfig((config) => ({
                    ...config,
                    legend: true,
                  }))
                }
                className={cn(
                  "px-2 py-1 text-xs border rounded",
                  effectiveChartConfig.legend
                    ? "bg-card-foreground/10 border-card-foreground/20"
                    : "bg-transparent border-input hover:bg-card-foreground/5",
                )}
              >
                Show
              </button>
              <button
                type="button"
                onClick={() =>
                  updateChartConfig((config) => ({
                    ...config,
                    legend: false,
                  }))
                }
                className={cn(
                  "px-2 py-1 text-xs border rounded",
                  !effectiveChartConfig.legend
                    ? "bg-card-foreground/10 border-card-foreground/20"
                    : "bg-transparent border-input hover:bg-card-foreground/5",
                )}
              >
                Hide
              </button>
            </div>
          </div>
          <div>
            <div className="block text-[10px] text-muted-foreground mb-1 tracking-wider font-bold uppercase">
              Grid
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() =>
                  updateChartConfig((config) => ({
                    ...config,
                    showGrid: true,
                  }))
                }
                className={cn(
                  "px-2 py-1 text-xs border rounded",
                  effectiveChartConfig.showGrid !== false
                    ? "bg-card-foreground/10 border-card-foreground/20"
                    : "bg-transparent border-input hover:bg-card-foreground/5",
                )}
              >
                Show
              </button>
              <button
                type="button"
                onClick={() =>
                  updateChartConfig((config) => ({
                    ...config,
                    showGrid: false,
                  }))
                }
                className={cn(
                  "px-2 py-1 text-xs border rounded",
                  effectiveChartConfig.showGrid === false
                    ? "bg-card-foreground/10 border-card-foreground/20"
                    : "bg-transparent border-input hover:bg-card-foreground/5",
                )}
              >
                Hide
              </button>
            </div>
          </div>
          <div>
            <div className="block text-[10px] text-muted-foreground mb-1 tracking-wider font-bold uppercase">
              Dots
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() =>
                  updateChartConfig((config) => ({
                    ...config,
                    showDots: true,
                  }))
                }
                className={cn(
                  "px-2 py-1 text-xs border rounded",
                  effectiveChartConfig.showDots !== false
                    ? "bg-card-foreground/10 border-card-foreground/20"
                    : "bg-transparent border-input hover:bg-card-foreground/5",
                )}
              >
                Show
              </button>
              <button
                type="button"
                onClick={() =>
                  updateChartConfig((config) => ({
                    ...config,
                    showDots: false,
                  }))
                }
                className={cn(
                  "px-2 py-1 text-xs border rounded",
                  effectiveChartConfig.showDots === false
                    ? "bg-card-foreground/10 border-card-foreground/20"
                    : "bg-transparent border-input hover:bg-card-foreground/5",
                )}
              >
                Hide
              </button>
            </div>
          </div>
          <div>
            <div className="block text-[10px] text-muted-foreground mb-1 tracking-wider font-bold uppercase">
              Tooltip
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() =>
                  updateChartConfig((config) => ({
                    ...config,
                    showTooltip: true,
                  }))
                }
                className={cn(
                  "px-2 py-1 text-xs border rounded",
                  effectiveChartConfig.showTooltip !== false
                    ? "bg-card-foreground/10 border-card-foreground/20"
                    : "bg-transparent border-input hover:bg-card-foreground/5",
                )}
              >
                Show
              </button>
              <button
                type="button"
                onClick={() =>
                  updateChartConfig((config) => ({
                    ...config,
                    showTooltip: false,
                  }))
                }
                className={cn(
                  "px-2 py-1 text-xs border rounded",
                  effectiveChartConfig.showTooltip === false
                    ? "bg-card-foreground/10 border-card-foreground/20"
                    : "bg-transparent border-input hover:bg-card-foreground/5",
                )}
              >
                Hide
              </button>
            </div>
          </div>
        </div>
        {showAdvancedConfig && (
          <>
            <Separator className="col-span-2 xxl:col-span-4" />
            <div className="col-span-2 xxl:col-span-4 grid grid-cols-2 xxl:grid-cols-4 gap-4">
              <div>
                <label
                  htmlFor="title"
                  className="block text-[10px] text-muted-foreground mb-1 tracking-wider font-bold uppercase"
                >
                  Title
                </label>
                <input
                  type="text"
                  id="title"
                  className="w-full bg-background border border-input rounded px-2 py-1.5 text-xs focus:outline-none focus:border-primary"
                  value={effectiveChartConfig.title}
                  onChange={(e) =>
                    updateChartConfig((config) => ({
                      ...config,
                      title: e.target.value,
                    }))
                  }
                />
              </div>
              <div>
                <label
                  htmlFor="description"
                  className="block text-[10px] text-muted-foreground mb-1 tracking-wider font-bold uppercase"
                >
                  Description
                </label>
                <input
                  type="text"
                  id="description"
                  className="w-full bg-background border border-input rounded px-2 py-1.5 text-xs focus:outline-none focus:border-primary"
                  value={effectiveChartConfig.description || ""}
                  onChange={(e) =>
                    updateChartConfig((config) => ({
                      ...config,
                      description: e.target.value,
                    }))
                  }
                />
              </div>
              <div>
                <label
                  htmlFor="takeaway"
                  className="block text-[10px] text-muted-foreground mb-1 tracking-wider font-bold uppercase"
                >
                  Takeaway
                </label>
                <input
                  type="text"
                  id="takeaway"
                  className="w-full bg-background border border-input rounded px-2 py-1.5 text-xs focus:outline-none focus:border-primary"
                  value={effectiveChartConfig.takeaway || ""}
                  onChange={(e) =>
                    updateChartConfig((config) => ({
                      ...config,
                      takeaway: e.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <Separator className="col-span-2 xxl:col-span-4" />
            <div className="col-span-2 xxl:col-span-4 grid grid-cols-2 xxl:grid-cols-4 gap-4">
              <div>
                <label
                  htmlFor="lineSize"
                  className="block text-[10px] text-muted-foreground mb-1 tracking-wider font-bold uppercase"
                >
                  Line Size
                </label>
                <input
                  type="number"
                  id="lineSize"
                  min="1"
                  max="10"
                  className="w-full bg-background border border-input rounded px-2 py-1.5 text-xs focus:outline-none focus:border-primary"
                  value={effectiveChartConfig.lineSize ?? 2}
                  onChange={(e) =>
                    updateChartConfig((config) => ({
                      ...config,
                      lineSize: Number(e.target.value) || 2,
                    }))
                  }
                />
              </div>
              <div>
                <div className="block text-[10px] text-muted-foreground mb-1 tracking-wider font-bold uppercase">
                  X Axis
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      updateChartConfig((config) => ({
                        ...config,
                        showXAxis: true,
                      }))
                    }
                    className={cn(
                      "px-2 py-1 text-xs border rounded",
                      effectiveChartConfig.showXAxis !== false
                        ? "bg-card-foreground/10 border-card-foreground/20"
                        : "bg-transparent border-input hover:bg-card-foreground/5",
                    )}
                  >
                    Show
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      updateChartConfig((config) => ({
                        ...config,
                        showXAxis: false,
                      }))
                    }
                    className={cn(
                      "px-2 py-1 text-xs border rounded",
                      effectiveChartConfig.showXAxis === false
                        ? "bg-card-foreground/10 border-card-foreground/20"
                        : "bg-transparent border-input hover:bg-card-foreground/5",
                    )}
                  >
                    Hide
                  </button>
                </div>
              </div>
              <div>
                <div className="block text-[10px] text-muted-foreground mb-1 tracking-wider font-bold uppercase">
                  Y Axis
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      updateChartConfig((config) => ({
                        ...config,
                        showYAxis: true,
                      }))
                    }
                    className={cn(
                      "px-2 py-1 text-xs border rounded",
                      effectiveChartConfig.showYAxis !== false
                        ? "bg-card-foreground/10 border-card-foreground/20"
                        : "bg-transparent border-input hover:bg-card-foreground/5",
                    )}
                  >
                    Show
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      updateChartConfig((config) => ({
                        ...config,
                        showYAxis: false,
                      }))
                    }
                    className={cn(
                      "px-2 py-1 text-xs border rounded",
                      effectiveChartConfig.showYAxis === false
                        ? "bg-card-foreground/10 border-card-foreground/20"
                        : "bg-transparent border-input hover:bg-card-foreground/5",
                    )}
                  >
                    Hide
                  </button>
                </div>
              </div>
              <div>
                <label
                  htmlFor="labelYAngle"
                  className="block text-[10px] text-muted-foreground mb-1 tracking-wider font-bold uppercase"
                >
                  Y Label Angle
                </label>
                <input
                  type="number"
                  id="labelYAngle"
                  min="-90"
                  max="90"
                  className="w-full bg-background border border-input rounded px-2 py-1.5 text-xs focus:outline-none focus:border-primary"
                  value={effectiveChartConfig.labelYAngle ?? -90}
                  onChange={(e) =>
                    updateChartConfig((config) => ({
                      ...config,
                      labelYAngle: Number(e.target.value) || -90,
                    }))
                  }
                />
              </div>
            </div>
            <Separator className="col-span-2 xxl:col-span-4" />
            <div className="col-span-2 xxl:col-span-4 grid grid-cols-2 xxl:grid-cols-4 gap-4">
              <div>
                <label
                  htmlFor="suffixLabelY"
                  className="block text-[10px] text-muted-foreground mb-1 tracking-wider font-bold uppercase"
                >
                  Y Suffix
                </label>
                <input
                  type="text"
                  id="suffixLabelY"
                  className="w-full bg-background border border-input rounded px-2 py-1.5 text-xs focus:outline-none focus:border-primary"
                  value={effectiveChartConfig.suffixLabelY || ""}
                  onChange={(e) =>
                    updateChartConfig((config) => ({
                      ...config,
                      suffixLabelY: e.target.value.trim() || undefined,
                    }))
                  }
                />
              </div>
              <div>
                <label
                  htmlFor="referenceLineLabel"
                  className="block text-[10px] text-muted-foreground mb-1 tracking-wider font-bold uppercase"
                >
                  Reference Line
                </label>
                <input
                  type="text"
                  id="referenceLineLabel"
                  className="w-full bg-background border border-input rounded px-2 py-1.5 text-xs focus:outline-none focus:border-primary"
                  value={effectiveChartConfig.referenceLineLabel || ""}
                  onChange={(e) =>
                    updateChartConfig((config) => ({
                      ...config,
                      referenceLineLabel:
                        e.target.value.trim() || undefined,
                    }))
                  }
                />
              </div>
              {/* Multi-line chart options */}
              {effectiveChartConfig.type === "line" && (
                <>
                  <div>
                    <label
                      htmlFor="multipleLines"
                      className="block text-[10px] text-muted-foreground mb-1 tracking-wider font-bold uppercase"
                    >
                      Multiple Lines
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          updateChartConfig((config) => ({
                            ...config,
                            multipleLines: true,
                            legend: true,
                          }))
                        }
                        className={cn(
                          "px-2 py-1 text-xs border rounded",
                          effectiveChartConfig.multipleLines
                            ? "bg-card-foreground/10 border-card-foreground/20"
                            : "bg-transparent border-input hover:bg-card-foreground/5",
                        )}
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          updateChartConfig((config) => ({
                            ...config,
                            multipleLines: false,
                            categoryColumn: undefined,
                            lineCategories: undefined,
                            measurementColumn: undefined,
                          }))
                        }
                        className={cn(
                          "px-2 py-1 text-xs border rounded",
                          !effectiveChartConfig.multipleLines
                            ? "bg-card-foreground/10 border-card-foreground/20"
                            : "bg-transparent border-input hover:bg-card-foreground/5",
                        )}
                      >
                        No
                      </button>
                    </div>
                  </div>
                  {effectiveChartConfig.multipleLines && (
                    <>
                      <div>
                        <label
                          htmlFor="categoryColumn"
                          className="block text-[10px] text-muted-foreground mb-1 tracking-wider font-bold uppercase"
                        >
                          Category Column
                        </label>
                        <select
                          id="categoryColumn"
                          className="w-full bg-background border border-input rounded px-2 py-1.5 text-xs focus:outline-none focus:border-primary"
                          value={effectiveChartConfig.categoryColumn || ""}
                          onChange={(e) =>
                            updateChartConfig((config) => ({
                              ...config,
                              categoryColumn: e.target.value || undefined,
                              lineCategories: undefined,
                            }))
                          }
                        >
                          <option value="">Select column</option>
                          {columns.map((col) => (
                            <option key={col.name} value={col.name}>
                              {col.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      {effectiveChartConfig.categoryColumn &&
                        availableCategories.length > 0 && (
                          <div className="col-span-2 xxl:col-span-4">
                            <div className="block text-[10px] text-muted-foreground mb-1 tracking-wider font-bold uppercase">
                              Line Categories
                            </div>
                            <div className="space-y-2">
                              <button
                                type="button"
                                onClick={toggleAllCategories}
                                className="px-2 py-1 text-xs border rounded bg-transparent hover:bg-card-foreground/5"
                              >
                                {(
                                  effectiveChartConfig.lineCategories ?? []
                                ).length === availableCategories.length
                                  ? "Deselect All"
                                  : "Select All"}
                              </button>
                              <div className="space-y-1 max-h-32 overflow-y-auto border rounded p-2">
                                {availableCategories.map((category) => {
                                  const isSelected = (
                                    effectiveChartConfig.lineCategories ?? []
                                  ).includes(category);
                                  return (
                                    <label
                                      key={category}
                                      className="flex items-center gap-2 cursor-pointer text-xs"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => toggleCategory(category)}
                                        className="rounded border-input"
                                      />
                                      <span>{category}</span>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        )}
                      <div>
                        <label
                          htmlFor="measurementColumn"
                          className="block text-[10px] text-muted-foreground mb-1 tracking-wider font-bold uppercase"
                        >
                          Measurement Column
                        </label>
                        <select
                          id="measurementColumn"
                          className="w-full bg-background border border-input rounded px-2 py-1.5 text-xs focus:outline-none focus:border-primary"
                          value={effectiveChartConfig.measurementColumn || ""}
                          onChange={(e) => {
                            const measurementCol = e.target.value || undefined;
                            updateChartConfig((config) => {
                              const newYKeys = measurementCol
                                ? [
                                    ...new Set([
                                      ...config.yKeys,
                                      measurementCol,
                                    ]),
                                  ]
                                : config.yKeys;
                              return {
                                ...config,
                                measurementColumn: measurementCol,
                                yKeys: newYKeys,
                              };
                            });
                          }}
                        >
                          <option value="">Select column</option>
                          {columns.map((col) => (
                            <option key={col.name} value={col.name}>
                              {col.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </>
                  )}
                  {/* Multiple Y-axis columns */}
                  <div className="col-span-2 xxl:col-span-4">
                    <div className="block text-[10px] text-muted-foreground mb-1 tracking-wider font-bold uppercase">
                      Y-Axis Columns (Multiple)
                    </div>
                    <div className="space-y-1 max-h-32 overflow-y-auto border rounded p-2">
                      {columns.map((col) => {
                        const isSelected =
                          effectiveChartConfig.yKeys.includes(col.name);
                        return (
                          <label
                            key={col.name}
                            className="flex items-center gap-2 cursor-pointer text-xs"
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {
                                updateChartConfig((config) => {
                                  const newYKeys = isSelected
                                    ? config.yKeys.filter((k) => k !== col.name)
                                    : [...config.yKeys, col.name];
                                  return {
                                    ...config,
                                    yKeys: newYKeys,
                                  };
                                });
                              }}
                              className="rounded border-input"
                            />
                            <span>{col.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                  {/* Count mode */}
                  <div>
                    <label
                      htmlFor="countMode"
                      className="block text-[10px] text-muted-foreground mb-1 tracking-wider font-bold uppercase"
                    >
                      Count Mode
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          updateChartConfig((config) => ({
                            ...config,
                            countMode: true,
                          }))
                        }
                        className={cn(
                          "px-2 py-1 text-xs border rounded",
                          effectiveChartConfig.countMode
                            ? "bg-card-foreground/10 border-card-foreground/20"
                            : "bg-transparent border-input hover:bg-card-foreground/5",
                        )}
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          updateChartConfig((config) => ({
                            ...config,
                            countMode: false,
                          }))
                        }
                        className={cn(
                          "px-2 py-1 text-xs border rounded",
                          !effectiveChartConfig.countMode
                            ? "bg-card-foreground/10 border-card-foreground/20"
                            : "bg-transparent border-input hover:bg-card-foreground/5",
                        )}
                      >
                        No
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

