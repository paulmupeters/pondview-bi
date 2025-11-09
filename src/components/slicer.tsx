"use client";

import { Check, ChevronDown, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useFilters } from "@/app/dashboards/[dashboardId]/filter-context";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

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
  const { filters, addFilter, updateFilter, removeFilter } = useFilters();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [values, setValues] = useState<DimensionValue[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Find existing filter for this field
  const existingFilterIndex = filters.findIndex((f) => f.field === field);
  const existingFilter =
    existingFilterIndex >= 0 ? filters[existingFilterIndex] : null;
  const selectedValues =
    existingFilter?.op === "in" && existingFilter.values
      ? existingFilter.values.map((v) => String(v))
      : [];

  // Fetch dimension values
  const fetchValues = useCallback(
    async (searchTerm: string) => {
      setLoading(true);
      try {
        // Exclude the current field's filter to avoid self-filter lockout
        const otherFilters = filters.filter((f) => f.field !== field);
        const filtersParam =
          otherFilters.length > 0
            ? `&filters=${encodeURIComponent(JSON.stringify(otherFilters))}`
            : "";
        const searchParam = searchTerm
          ? `&search=${encodeURIComponent(searchTerm)}`
          : "";
        const res = await fetch(
          `/api/dashboard/${dashboardId}/dimension-values?field=${encodeURIComponent(field)}&limit=${limit}${searchParam}${filtersParam}`,
        );
        if (!res.ok) {
          throw new Error(`Failed to fetch values: ${res.statusText}`);
        }
        const data = (await res.json()) as {
          values: DimensionValue[];
        };
        setValues(data.values);
      } catch (error) {
        console.error("[Slicer] Failed to fetch values:", error);
        setValues([]);
      } finally {
        setLoading(false);
      }
    },
    [dashboardId, field, limit, filters],
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

  const handleClear = () => {
    if (existingFilterIndex >= 0) {
      removeFilter(existingFilterIndex);
    }
  };

  const displayTitle = title || field.split(".")[1] || field;

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
              {selectedValues.length > 0
                ? `${displayTitle}: ${selectedValues.length} selected`
                : displayTitle}
            </span>
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0" align="start">
          <Command>
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
        </PopoverContent>
      </Popover>

      {selectedValues.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          {selectedValues.slice(0, 3).map((value) => (
            <span
              key={value}
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs"
            >
              {value}
            </span>
          ))}
          {selectedValues.length > 3 && (
            <span className="text-xs text-muted-foreground">
              +{selectedValues.length - 3} more
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={handleClear}
            title="Clear selection"
          >
            <X className="h-3 w-3" />
          </Button>
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
