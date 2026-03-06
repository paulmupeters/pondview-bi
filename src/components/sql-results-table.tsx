import {
  type ColumnDef,
  type ColumnSizingState,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  type PaginationState,
  useReactTable,
} from "@tanstack/react-table";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DEFAULT_PAGE_SIZE = 10;
const DEFAULT_COLUMN_SIZE = 180;
const MIN_COLUMN_SIZE = 120;
const MAX_COLUMN_SIZE = 640;

export function SqlResultsTable({
  dataOverride,
  className,
  pageSize = DEFAULT_PAGE_SIZE,
}: {
  dataOverride?: {
    stage?: "loading" | "processing" | "analyzing" | "visualizing" | "complete";
    columns: { name: string; type?: string }[];
    rows: Record<string, unknown>[];
    summary?: {
      totalRows: number;
      executionTimeMs?: number;
      insights: string[];
      queryType?: string;
    };
  };
  className?: string;
  pageSize?: number;
}) {
  const payload = dataOverride; // parent supplies data; avoid extra subscription

  // Create column definitions for TanStack Table
  // Use empty arrays as defaults to ensure hooks are always called
  const columns = payload?.columns ?? [];
  const rows = payload?.rows ?? [];
  const summary = payload?.summary;

  const tableColumns: ColumnDef<Record<string, unknown>>[] = useMemo(
    () =>
      columns.map((column) => ({
        accessorKey: column.name,
        header: column.name,
        cell: ({ getValue }) => {
          const value = getValue();
          const stringValue = String(value ?? "");
          return (
            <div className="truncate" title={stringValue}>
              {stringValue}
            </div>
          );
        },
      })),
    [columns],
  );

  const resolvedPageSize = Math.max(1, pageSize);
  const shouldPaginate = rows.length > resolvedPageSize;

  // Controlled pagination state - resets when rows change
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: shouldPaginate ? resolvedPageSize : Math.max(rows.length, 1),
  });
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const previousColumnNamesSignature = useRef<string>("");

  // Update pageSize when rows change
  useEffect(() => {
    const newPageSize =
      rows.length > resolvedPageSize ? resolvedPageSize : Math.max(rows.length, 1);
    setPagination({
      pageIndex: 0, // Reset to first page when data changes
      pageSize: newPageSize,
    });
  }, [rows.length, resolvedPageSize]);

  // Reset custom widths when result columns change.
  useEffect(() => {
    const nextColumnNamesSignature = columns
      .map((column) => column.name)
      .join("||");

    if (nextColumnNamesSignature === previousColumnNamesSignature.current) {
      return;
    }

    previousColumnNamesSignature.current = nextColumnNamesSignature;
    setColumnSizing({});
  }, [columns]);

  const table = useReactTable({
    data: rows,
    columns: tableColumns,
    defaultColumn: {
      size: DEFAULT_COLUMN_SIZE,
      minSize: MIN_COLUMN_SIZE,
      maxSize: MAX_COLUMN_SIZE,
    },
    enableColumnResizing: true,
    columnResizeMode: "onEnd",
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: {
      pagination,
      columnSizing,
    },
    onPaginationChange: setPagination,
    onColumnSizingChange: setColumnSizing,
  });

  if (!payload || payload.stage !== "complete") {
    return null;
  }

  if (!rows.length) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        No results found
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full min-w-0 gap-4 p-4">
      {/* Summary */}
      {summary && (
        <div className="shrink-0 space-y-2">
          <div className="flex gap-4 text-sm text-muted-foreground">
            <span>{summary.totalRows} rows</span>
            {summary.executionTimeMs && (
              <span>{summary.executionTimeMs}ms</span>
            )}
            {summary.queryType && <span>{summary.queryType}</span>}
          </div>
        </div>
      )}

      {/* Table */}
      <div
        className={cn(
          "flex-1 overflow-auto rounded-md border w-full",
          className,
        )}
      >
        <table
          className="caption-bottom text-sm table-fixed"
          style={{ width: table.getTotalSize(), minWidth: "100%" }}
        >
          <thead className="bg-muted/50 sticky top-0 z-10">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b">
                {headerGroup.headers.map((header) => {
                  return (
                    <th
                      key={header.id}
                      className="h-10 px-2 text-left align-middle font-medium text-foreground relative"
                      style={{ width: header.getSize() }}
                    >
                      <div className="truncate pr-3">
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                      </div>
                      {header.column.getCanResize() && (
                        <button
                          type="button"
                          onDoubleClick={() => header.column.resetSize()}
                          onMouseDown={header.getResizeHandler()}
                          onTouchStart={header.getResizeHandler()}
                          className={cn(
                            "absolute right-0 top-0 h-full w-1 cursor-col-resize select-none touch-none",
                            header.column.getIsResizing()
                              ? "bg-primary/60"
                              : "bg-transparent hover:bg-border",
                          )}
                          aria-label={`Resize column ${header.id}`}
                          title="Drag to resize column"
                        />
                      )}
                      {header.column.getIsResizing() && (
                        <div
                          className="absolute right-0 top-0 z-20 h-full w-px bg-primary pointer-events-none"
                          style={{
                            transform: `translateX(${table.getState().columnSizingInfo.deltaOffset ?? 0}px)`,
                          }}
                        />
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  className="border-b hover:bg-muted/50 data-[state=selected]:bg-muted"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td
                      key={cell.id}
                      className="p-2 align-middle"
                      style={{ width: cell.column.getSize() }}
                    >
                      <div className="w-full overflow-hidden whitespace-nowrap">
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </div>
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td
                    colSpan={tableColumns.length}
                    className="h-24 text-center p-2"
                  >
                    No results.
                  </td>
                </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {shouldPaginate && (
        <div className="shrink-0 flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Showing {table.getState().pagination.pageIndex * resolvedPageSize + 1} to{" "}
            {Math.min(
              (table.getState().pagination.pageIndex + 1) * resolvedPageSize,
              rows.length,
            )}{" "}
            of {rows.length} results
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <div className="text-sm text-muted-foreground">
              Page {table.getState().pagination.pageIndex + 1} of{" "}
              {table.getPageCount()}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Insights */}
      {summary?.insights && summary.insights.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-medium">Insights</h4>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {summary.insights.map((insight) => (
              <li key={insight} className="flex items-start gap-2">
                <span className="w-1 h-1 rounded-full bg-primary mt-2 shrink-0" />
                {insight}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
