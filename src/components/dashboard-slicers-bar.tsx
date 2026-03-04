import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
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

interface DashboardSlicer {
  id: string;
  dashboardId?: string;
  chartId?: string;
  field: string;
  title: string | null;
  limit: number;
  position: number;
}

interface DashboardSlicersBarProps {
  dashboardId: string;
  selectedChartId?: string | null;
  onClearChartSelection?: () => void;
}

export function DashboardSlicersBar({
  dashboardId,
  selectedChartId = null,
  onClearChartSelection,
}: DashboardSlicersBarProps) {
  const { availableDimensions, filters, removeFilter, setActiveScope } =
    useFilters();
  const [slicers, setSlicers] = useState<DashboardSlicer[]>([]);
  const [loading, setLoading] = useState(true);
  const [addSlicerOpen, setAddSlicerOpen] = useState(false);
  const [addSlicerSearch, setAddSlicerSearch] = useState("");

  const slicersEndpoint = selectedChartId
    ? `chart:${selectedChartId}`
    : `dashboard:${dashboardId}`;

  useEffect(() => {
    if (selectedChartId) {
      setActiveScope({ kind: "chart", chartId: selectedChartId });
    } else {
      setActiveScope({ kind: "dashboard" });
    }
  }, [selectedChartId, setActiveScope]);

  // Server-backed slicer persistence is deferred in browser mode.
  useEffect(() => {
    void slicersEndpoint;
    setLoading(true);
    setSlicers([]);
    setLoading(false);
  }, [slicersEndpoint]);

  // Filter available dimensions to exclude those already used as slicers
  const usedFields = new Set(slicers.map((s) => s.field));
  const availableForSlicers = availableDimensions.filter(
    (d) => !usedFields.has(d.field),
  );

  const handleAddSlicer = async (field: string) => {
    const maxPosition = slicers.reduce((max, item) => Math.max(max, item.position), -1);
    setSlicers((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${field}`,
        dashboardId: selectedChartId ? undefined : dashboardId,
        chartId: selectedChartId ?? undefined,
        field,
        title: null,
        limit: 50,
        position: maxPosition + 1,
      },
    ]);
    setAddSlicerOpen(false);
    setAddSlicerSearch("");
  };

  const handleRemoveSlicer = async (slicerId: string) => {
    // Find the slicer to get its field
    const slicer = slicers.find((s) => s.id === slicerId);
    if (slicer) {
      const filterIndex = filters.findIndex((f) => f.field === slicer.field);
      if (filterIndex >= 0) {
        removeFilter(filterIndex);
      }
    }
    setSlicers((prev) => prev.filter((item) => item.id !== slicerId));
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-2">
        <div className="text-sm text-muted-foreground">Loading slicers...</div>
      </div>
    );
  }

  if (
    slicers.length === 0 &&
    availableForSlicers.length === 0 &&
    !selectedChartId
  ) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 flex-wrap py-2">
      {selectedChartId ? (
        <div className="inline-flex items-center gap-2 rounded-md border bg-muted/40 px-2 py-1 text-xs">
          <span className="font-medium">Filtering selected visual</span>
          {onClearChartSelection ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={onClearChartSelection}
            >
              Back to all visuals
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="text-xs text-muted-foreground px-1">
          Filtering all visuals
        </div>
      )}

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
            <Button variant="outline" size="sm" className="h-8">
              <Plus className="mr-2 h-4 w-4" />
              Add selection
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[300px] p-0" align="start">
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
                      .filter((dim) => {
                        if (!addSlicerSearch) return true;
                        const searchLower = addSlicerSearch.toLowerCase();
                        return (
                          dim.displayName.toLowerCase().includes(searchLower) ||
                          dim.field.toLowerCase().includes(searchLower)
                        );
                      })
                      .map((dim) => (
                        <CommandItem
                          key={dim.field}
                          value={dim.field}
                          onSelect={() => handleAddSlicer(dim.field)}
                          className="cursor-pointer"
                        >
                          <div className="flex flex-col">
                            <span className="font-medium">
                              {dim.displayName}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {dim.field}
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
    </div>
  );
}
