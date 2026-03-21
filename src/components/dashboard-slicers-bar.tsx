import { Plus } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFilters } from "@/app/dashboards/[dashboardId]/filter-context";
import { Slicer } from "@/components/slicer";
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
import { getRelevantTablesForChart } from "@/lib/dashboard/browser-filter-engine";
import { readJoinDefsFromStorage } from "@/lib/joins/browser-storage";
import {
  addSlicerToChart,
  addSlicerToDashboard,
  type DbChartSlicer,
  type DbDashboardSlicer,
  listSlicersByChart,
  listSlicersByDashboard,
  removeSlicerFromChart,
  removeSlicerFromDashboard,
} from "@/lib/workspace/dashboard-repo";

type DashboardSlicer = {
  id: string;
  field: string;
  title: string | null;
  limit: number;
  position: number;
};

interface DashboardSlicersBarProps {
  dashboardId: string;
  selectedChartId?: string | null;
  charts?: Array<{ id: string; sql: string }>;
  onClearChartSelection?: () => void;
}

function normalizeSlicer(
  row: DbDashboardSlicer | DbChartSlicer,
): DashboardSlicer {
  return {
    id: row.id,
    field: row.field,
    title: row.title,
    limit: row.limit,
    position: row.position,
  };
}

export function DashboardSlicersBar({
  dashboardId,
  selectedChartId = null,
  charts = [],
  onClearChartSelection: _onClearChartSelection,
}: DashboardSlicersBarProps) {
  const { availableDimensions, filters, removeFilter, setActiveScope } =
    useFilters();
  const [slicers, setSlicers] = useState<DashboardSlicer[]>([]);
  const [loading, setLoading] = useState(true);
  const [addSlicerOpen, setAddSlicerOpen] = useState(false);
  const [addSlicerSearch, setAddSlicerSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const [reservedHeight, setReservedHeight] = useState(0);

  useEffect(() => {
    if (selectedChartId) {
      setActiveScope({ kind: "chart", chartId: selectedChartId });
    } else {
      setActiveScope({ kind: "dashboard" });
    }
    setAddSlicerOpen(false);
    setAddSlicerSearch("");
  }, [selectedChartId, setActiveScope]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const loaded = selectedChartId
          ? await listSlicersByChart(selectedChartId)
          : await listSlicersByDashboard(dashboardId);

        if (!cancelled) {
          setSlicers(loaded.map(normalizeSlicer));
        }
      } catch (error) {
        if (!cancelled) {
          console.error("[DashboardSlicersBar] Failed to load slicers:", error);
          setSlicers([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [dashboardId, selectedChartId]);

  const usedFields = useMemo(
    () => new Set(slicers.map((s) => s.field)),
    [slicers],
  );

  const relevantDimensions = useMemo(() => {
    if (!selectedChartId) return availableDimensions;

    const selectedChart = charts.find((c) => c.id === selectedChartId);
    if (!selectedChart) return availableDimensions;

    const joinDefs = readJoinDefsFromStorage();
    const relevantTables = getRelevantTablesForChart(
      selectedChart.sql,
      joinDefs,
    );

    return availableDimensions.filter((dimension) =>
      relevantTables.has(dimension.exploreName),
    );
  }, [availableDimensions, selectedChartId, charts]);

  const availableForSlicers = relevantDimensions.filter(
    (dimension) => !usedFields.has(dimension.field),
  );

  useLayoutEffect(() => {
    if (loading) return;

    const node = containerRef.current;
    if (!node) return;

    const updateHeight = () => {
      setReservedHeight(node.offsetHeight);
    };

    updateHeight();

    const observer = new ResizeObserver(() => {
      updateHeight();
    });
    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [loading]);

  const handleAddSlicer = async (field: string) => {
    try {
      if (selectedChartId) {
        await addSlicerToChart({
          chartId: selectedChartId,
          field,
        });
        const next = await listSlicersByChart(selectedChartId);
        setSlicers(next.map(normalizeSlicer));
      } else {
        await addSlicerToDashboard({
          dashboardId,
          field,
        });
        const next = await listSlicersByDashboard(dashboardId);
        setSlicers(next.map(normalizeSlicer));
      }
    } catch (error) {
      console.error("[DashboardSlicersBar] Failed to add slicer:", error);
    } finally {
      setAddSlicerOpen(false);
      setAddSlicerSearch("");
    }
  };

  const handleRemoveSlicer = async (slicerId: string) => {
    const slicer = slicers.find((item) => item.id === slicerId);
    if (slicer) {
      const filterIndex = filters.findIndex(
        (filter) => filter.field === slicer.field,
      );
      if (filterIndex >= 0) {
        removeFilter(filterIndex);
      }
    }

    try {
      if (selectedChartId) {
        await removeSlicerFromChart(slicerId);
        const next = await listSlicersByChart(selectedChartId);
        setSlicers(next.map(normalizeSlicer));
      } else {
        await removeSlicerFromDashboard(slicerId);
        const next = await listSlicersByDashboard(dashboardId);
        setSlicers(next.map(normalizeSlicer));
      }
    } catch (error) {
      console.error("[DashboardSlicersBar] Failed to remove slicer:", error);
    }
  };

  const shouldHideBar =
    !loading &&
    slicers.length === 0 &&
    availableForSlicers.length === 0 &&
    !selectedChartId;

  if (shouldHideBar) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      data-slicer-bar
      style={
        loading && reservedHeight > 0
          ? { minHeight: reservedHeight }
          : undefined
      }
      className="flex flex-wrap items-center gap-2 py-2"
    >
      {loading ? (
        <div className="flex min-h-8 items-center gap-2">
          <div className="text-sm text-muted-foreground">
            Loading slicers...
          </div>
        </div>
      ) : (
        <>
          {slicers.map((slicer) => (
            <Slicer
              key={slicer.id}
              dashboardId={dashboardId}
              field={slicer.field}
              title={slicer.title}
              limit={slicer.limit}
              onRemove={() => handleRemoveSlicer(slicer.id)}
            />
          ))}

          {availableForSlicers.length > 0 && (
            <Popover open={addSlicerOpen} onOpenChange={setAddSlicerOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={`h-8 ring-1 ${selectedChartId ? " ring-primary bg-primary/5" : "ring-transparent"}`}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add filter
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-75 p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder="Search dimensions..."
                    value={addSlicerSearch}
                    onValueChange={setAddSlicerSearch}
                  />
                  <CommandList>
                    {availableForSlicers.length === 0 ? (
                      <CommandEmpty>No dimensions available</CommandEmpty>
                    ) : (
                      <CommandGroup>
                        {availableForSlicers
                          .filter((dimension) => {
                            if (!addSlicerSearch) {
                              return true;
                            }
                            const searchLower = addSlicerSearch.toLowerCase();
                            return (
                              dimension.displayName
                                .toLowerCase()
                                .includes(searchLower) ||
                              dimension.field
                                .toLowerCase()
                                .includes(searchLower)
                            );
                          })
                          .map((dimension) => (
                            <CommandItem
                              key={dimension.field}
                              value={dimension.field}
                              onSelect={() => handleAddSlicer(dimension.field)}
                              className="cursor-pointer"
                            >
                              <div className="flex flex-col">
                                <span className="font-medium">
                                  {dimension.displayName}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {dimension.field}
                                </span>
                              </div>
                            </CommandItem>
                          ))}
                      </CommandGroup>
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          )}
        </>
      )}
    </div>
  );
}
