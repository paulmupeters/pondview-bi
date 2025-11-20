"use client";

import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SqlResultsTable({
  dataOverride,
  className,
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
}) {
  const payload = dataOverride; // parent supplies data; avoid extra subscription

  // Create column definitions for TanStack Table
  // Use empty arrays as defaults to ensure hooks are always called
  const columns = payload?.columns ?? [];
  const rows = payload?.rows ?? [];
  const summary = payload?.summary;

  const tableColumns: ColumnDef<Record<string, unknown>>[] = columns.map(
    (column) => ({
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
    }),
  );

  const PAGE_SIZE = 10;
  const shouldPaginate = rows.length > PAGE_SIZE;

  const table = useReactTable({
    data: rows,
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize: shouldPaginate ? PAGE_SIZE : rows.length || 1,
      },
    },
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
    <div className="flex flex-col h-full w-full min-w-0 gap-4">
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
      <div className={cn("flex-1 overflow-auto rounded-md border w-full", className)}>
        <table className="w-full table-fixed caption-bottom text-sm">
          <thead className="bg-muted/50 sticky top-0">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b">
                {headerGroup.headers.map((header) => {
                  return (
                    <th
                      key={header.id}
                      className="h-10 max-w-0 px-2 text-left align-middle font-medium text-foreground"
                    >
                      <div className="truncate">
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                      </div>
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
                    <td key={cell.id} className="max-w-0 p-2 align-middle">
                      <div className="truncate whitespace-nowrap">
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
            Showing {table.getState().pagination.pageIndex * PAGE_SIZE + 1} to{" "}
            {Math.min(
              (table.getState().pagination.pageIndex + 1) * PAGE_SIZE,
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
                <span className="w-1 h-1 rounded-full bg-primary mt-2 flex-shrink-0" />
                {insight}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
