import { Check, ChevronDown, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useFilters } from "@/app/dashboards/[dashboardId]/filter-context";
import { loadDashboardDimensionValues } from "@/lib/dashboard/browser-filter-engine";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Op } from "@/lib/types/filters";
import { cn } from "@/lib/utils";

const operatorLabels: Record<Op, string> = {
  eq: "equals",
  neq: "does not equal",
  in: "is one of",
  not_in: "is not one of",
  gt: "greater than",
  gte: "greater than or equal",
  lt: "less than",
  lte: "less than or equal",
  between: "between",
  contains: "contains",
  starts_with: "starts with",
  is_null: "is null",
  is_not_null: "is not null",
};

interface DimensionValue {
  value: string | number | boolean;
  label: string;
}

interface SlicerProps {
  dashboardId: string;
  field: string;
  title?: string | null;
  limit?: number;
  onRemove?: () => void;
}

export function Slicer({
  dashboardId,
  field,
  title,
  limit = 50,
  onRemove,
}: SlicerProps) {
  const {
    filters,
    dashboardFilters,
    activeScope,
    addFilter,
    updateFilter,
    removeFilter,
    availableDimensions,
  } = useFilters();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [values, setValues] = useState<DimensionValue[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Detect if this is a numeric dimension
  const dimension = availableDimensions.find((d) => d.field === field);
  const isNumeric = dimension?.type === "number";

  // Numeric slicer state
  const [numericOperator, setNumericOperator] = useState<Op>("between");
  const [numericValue1, setNumericValue1] = useState<string>("");
  const [numericValue2, setNumericValue2] = useState<string>("");

  // Find existing filter for this field
  const existingFilterIndex = filters.findIndex((f) => f.field === field);
  const existingFilter =
    existingFilterIndex >= 0 ? filters[existingFilterIndex] : null;

  // For non-numeric: track selected values for multi-select
  const selectedValues =
    !isNumeric && existingFilter?.op === "in" && existingFilter.values
      ? existingFilter.values.map((v) => String(v))
      : [];

  // For numeric: initialize state from existing filter
  useEffect(() => {
    if (isNumeric && existingFilter) {
      setNumericOperator(existingFilter.op);
      if (
        existingFilter.op === "between" &&
        existingFilter.values &&
        existingFilter.values.length >= 2
      ) {
        setNumericValue1(String(existingFilter.values[0] ?? ""));
        setNumericValue2(String(existingFilter.values[1] ?? ""));
      } else if (existingFilter.values && existingFilter.values.length > 0) {
        setNumericValue1(String(existingFilter.values[0] ?? ""));
        setNumericValue2("");
      } else {
        setNumericValue1("");
        setNumericValue2("");
      }
    } else if (isNumeric && !existingFilter) {
      // Reset to defaults when no filter exists
      setNumericOperator("between");
      setNumericValue1("");
      setNumericValue2("");
    }
  }, [isNumeric, existingFilter]);

  // Fetch dimension values
  const fetchValues = useCallback(
    async (searchTerm: string) => {
      setLoading(true);
      try {
        const effectiveFilters =
          activeScope.kind === "chart"
            ? [...dashboardFilters, ...filters]
            : filters;

        const nextValues = await loadDashboardDimensionValues({
          dashboardId,
          field,
          filters: effectiveFilters,
          limit,
          search: searchTerm || undefined,
        });
        setValues(nextValues);
      } catch (error) {
        console.error(
          `[Slicer] Failed to load dimension values for ${field}:`,
          error,
        );
        setValues([]);
      } finally {
        setLoading(false);
      }
    },
    [activeScope.kind, dashboardFilters, dashboardId, field, filters, limit],
  );

  // Debounced search
  useEffect(() => {
    if (!open) return;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      void fetchValues(search);
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [search, open, fetchValues]);

  // Load values when popover opens
  useEffect(() => {
    if (!open) return;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    void fetchValues("");
  }, [open, fetchValues]);

  // Get available operators for numeric dimensions
  const getNumericOperators = (): Op[] => {
    return [
      "eq",
      "neq",
      "gt",
      "gte",
      "lt",
      "lte",
      "between",
      "is_null",
      "is_not_null",
    ];
  };

  // Handle numeric filter changes
  const handleNumericFilterChange = () => {
    if (numericOperator === "is_null" || numericOperator === "is_not_null") {
      // Null checks don't need values
      const filter = {
        field,
        op: numericOperator,
        values: [],
      };
      if (existingFilterIndex >= 0) {
        updateFilter(existingFilterIndex, filter);
      } else {
        addFilter(filter);
      }
      return;
    }

    if (numericOperator === "between") {
      const val1 = numericValue1.trim();
      const val2 = numericValue2.trim();

      if (!val1 || !val2) {
        // Remove filter if inputs are empty
        if (existingFilterIndex >= 0) {
          removeFilter(existingFilterIndex);
        }
        return;
      }

      const num1 = parseFloat(val1);
      const num2 = parseFloat(val2);

      if (Number.isNaN(num1) || Number.isNaN(num2)) {
        return; // Invalid numbers, don't update filter
      }

      // Ensure min <= max
      const min = Math.min(num1, num2);
      const max = Math.max(num1, num2);

      const filter = {
        field,
        op: "between" as const,
        values: [min, max],
      };
      if (existingFilterIndex >= 0) {
        updateFilter(existingFilterIndex, filter);
      } else {
        addFilter(filter);
      }
    } else {
      // Single value operators
      const val1 = numericValue1.trim();

      if (!val1) {
        // Remove filter if input is empty
        if (existingFilterIndex >= 0) {
          removeFilter(existingFilterIndex);
        }
        return;
      }

      const num1 = parseFloat(val1);
      if (Number.isNaN(num1)) {
        return; // Invalid number, don't update filter
      }

      const filter = {
        field,
        op: numericOperator,
        values: [num1],
      };
      if (existingFilterIndex >= 0) {
        updateFilter(existingFilterIndex, filter);
      } else {
        addFilter(filter);
      }
    }
  };

  // Handle operator change for numeric slicers
  const handleNumericOperatorChange = (op: Op) => {
    setNumericOperator(op);
    // Clear values when switching operators
    setNumericValue1("");
    setNumericValue2("");

    // If switching to null checks, apply immediately
    if (op === "is_null" || op === "is_not_null") {
      const filter = {
        field,
        op,
        values: [],
      };
      if (existingFilterIndex >= 0) {
        updateFilter(existingFilterIndex, filter);
      } else {
        addFilter(filter);
      }
    } else if (existingFilterIndex >= 0) {
      // Remove existing filter when switching to a new operator
      removeFilter(existingFilterIndex);
    }
  };

  const handleToggleValue = (value: string) => {
    const newSelected = selectedValues.includes(value)
      ? selectedValues.filter((v) => v !== value)
      : [...selectedValues, value];

    if (newSelected.length === 0) {
      // Remove filter if no values selected
      if (existingFilterIndex >= 0) {
        removeFilter(existingFilterIndex);
      }
    } else {
      // Update or add filter
      const filter = {
        field,
        op: "in" as const,
        values: newSelected,
      };
      if (existingFilterIndex >= 0) {
        updateFilter(existingFilterIndex, filter);
      } else {
        // Add new filter if it doesn't exist
        addFilter(filter);
      }
    }
  };

  const displayTitle = title || field.split(".")[1] || field;

  // Format display text for numeric slicers
  const getNumericDisplayText = (): string => {
    if (!existingFilter) {
      return displayTitle;
    }

    const op = existingFilter.op;
    if (op === "is_null") {
      return `${displayTitle}: is null`;
    }
    if (op === "is_not_null") {
      return `${displayTitle}: is not null`;
    }
    if (!existingFilter.values || existingFilter.values.length === 0) {
      return displayTitle;
    }

    if (op === "between" && existingFilter.values.length >= 2) {
      return `${displayTitle}: ${existingFilter.values[0]} - ${existingFilter.values[1]}`;
    }
    if (existingFilter.values.length > 0) {
      const opLabel = operatorLabels[op] || op;
      return `${displayTitle}: ${opLabel} ${existingFilter.values[0]}`;
    }
    return displayTitle;
  };

  return (
    <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="h-8 min-w-[200px] justify-between text-sm font-normal"
          >
            <span className="truncate">
              {isNumeric
                ? getNumericDisplayText()
                : selectedValues.length > 0
                  ? `${displayTitle}: ${selectedValues.length} selected`
                  : displayTitle}
            </span>
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-4" align="start">
          {isNumeric ? (
            <div className="space-y-3">
              <div className="space-y-2">
                <label htmlFor="operator" className="text-sm font-medium">
                  Operator
                </label>
                <Select
                  value={numericOperator}
                  onValueChange={(value) =>
                    handleNumericOperatorChange(value as Op)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {getNumericOperators().map((op) => (
                      <SelectItem key={op} value={op}>
                        {operatorLabels[op]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {numericOperator !== "is_null" &&
                numericOperator !== "is_not_null" &&
                (numericOperator === "between" ? (
                  <div className="space-y-2">
                    <label htmlFor="range" className="text-sm font-medium">
                      Range
                    </label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        placeholder="Min"
                        value={numericValue1}
                        onChange={(e) => {
                          setNumericValue1(e.target.value);
                        }}
                        onBlur={handleNumericFilterChange}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            handleNumericFilterChange();
                          }
                        }}
                        className="flex-1"
                      />
                      <span className="text-sm text-muted-foreground">to</span>
                      <Input
                        type="number"
                        placeholder="Max"
                        value={numericValue2}
                        onChange={(e) => {
                          setNumericValue2(e.target.value);
                        }}
                        onBlur={handleNumericFilterChange}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            handleNumericFilterChange();
                          }
                        }}
                        className="flex-1"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label htmlFor="value" className="text-sm font-medium">
                      Value
                    </label>
                    <Input
                      type="number"
                      placeholder="Enter value"
                      value={numericValue1}
                      onChange={(e) => {
                        setNumericValue1(e.target.value);
                      }}
                      onBlur={handleNumericFilterChange}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleNumericFilterChange();
                        }
                      }}
                    />
                  </div>
                ))}
            </div>
          ) : (
            <Command shouldFilter={false}>
              <CommandInput
                placeholder={`Search ${displayTitle.toLowerCase()}...`}
                value={search}
                onValueChange={setSearch}
              />
              <CommandList>
                {loading && values.length === 0 ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">
                    Loading...
                  </div>
                ) : values.length === 0 ? (
                  <CommandEmpty>No values found</CommandEmpty>
                ) : (
                  <CommandGroup>
                    {values.map((item) => {
                      const isSelected = selectedValues.includes(
                        String(item.value),
                      );
                      return (
                        <CommandItem
                          key={String(item.value)}
                          value={String(item.value)}
                          onSelect={() => handleToggleValue(String(item.value))}
                          className="cursor-pointer"
                        >
                          <div
                            className={cn(
                              "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                              isSelected
                                ? "bg-primary text-primary-foreground"
                                : "opacity-50",
                            )}
                          >
                            {isSelected && <Check className="h-3 w-3" />}
                          </div>
                          <span>{item.label}</span>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                )}
              </CommandList>
            </Command>
          )}
        </PopoverContent>
      </Popover>

      {!isNumeric && selectedValues.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          {selectedValues.slice(0, 3).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => handleToggleValue(value)}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs hover:bg-primary/20 transition-colors cursor-pointer"
              title="Click to remove"
            >
              {value}
            </button>
          ))}
          {selectedValues.length > 3 && (
            <span className="text-xs text-muted-foreground">
              +{selectedValues.length - 3} more
            </span>
          )}
        </div>
      )}

      {onRemove && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={onRemove}
          title="Remove slicer"
        >
          <X className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}
