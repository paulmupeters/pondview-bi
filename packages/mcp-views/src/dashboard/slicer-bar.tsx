import { cn } from "@/lib/utils";
import type { DashboardSlicer } from "./dashboard-payload";
import { formatValue, type SlicerValue, valueKey } from "./filters";

// A row of multi-select slicers. Native <details> keeps it dependency-free and
// keyboard accessible inside the sandboxed iframe.
export function SlicerBar({
  slicers,
  selectionFor,
  disabled,
  onChange,
}: {
  slicers: DashboardSlicer[];
  selectionFor: (field: string) => SlicerValue[];
  disabled: boolean;
  onChange: (field: string, values: SlicerValue[]) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {slicers.map((slicer) => (
        <SlicerControl
          key={slicer.id}
          slicer={slicer}
          selected={selectionFor(slicer.field)}
          disabled={disabled}
          onChange={(values) => onChange(slicer.field, values)}
        />
      ))}
    </div>
  );
}

function SlicerControl({
  slicer,
  selected,
  disabled,
  onChange,
}: {
  slicer: DashboardSlicer;
  selected: SlicerValue[];
  disabled: boolean;
  onChange: (values: SlicerValue[]) => void;
}) {
  const label = slicer.title ?? slicer.field.split(".").pop() ?? slicer.field;
  const selectedKeys = new Set(selected.map(valueKey));
  const summary =
    selected.length === 0
      ? "All"
      : selected.length === 1
        ? formatValue(selected[0])
        : `${selected.length} selected`;

  const toggle = (value: SlicerValue) => {
    const key = valueKey(value);
    onChange(
      selectedKeys.has(key)
        ? selected.filter((candidate) => valueKey(candidate) !== key)
        : [...selected, value],
    );
  };

  return (
    <details className="group relative">
      <summary
        className={cn(
          "flex cursor-pointer list-none items-center gap-1 rounded-md border px-2 py-1 text-xs",
          selected.length > 0 && "border-primary",
          disabled && "pointer-events-none opacity-50",
        )}
      >
        <span className="text-muted-foreground">{label}:</span>
        <span className="max-w-[10rem] truncate font-medium">{summary}</span>
        <span aria-hidden className="text-muted-foreground">
          ▾
        </span>
      </summary>
      <div className="absolute left-0 z-10 mt-1 max-h-64 min-w-[12rem] overflow-auto rounded-md border bg-background p-1 shadow-md">
        {slicer.options.length === 0 ? (
          <p className="px-2 py-1 text-xs text-muted-foreground">No values</p>
        ) : (
          slicer.options.map((option) => (
            <label
              key={valueKey(option)}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-muted/30"
            >
              <input
                type="checkbox"
                checked={selectedKeys.has(valueKey(option))}
                disabled={disabled}
                onChange={() => toggle(option)}
              />
              <span className="truncate">{formatValue(option)}</span>
            </label>
          ))
        )}
        {selected.length > 0 ? (
          <button
            type="button"
            className="mt-1 w-full rounded px-2 py-1 text-left text-xs text-muted-foreground hover:text-foreground"
            disabled={disabled}
            onClick={() => onChange([])}
          >
            Clear
          </button>
        ) : null}
      </div>
    </details>
  );
}
