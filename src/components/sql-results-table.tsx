import {
  ArrowTopRightOnSquareIcon,
  FunnelIcon,
} from "@heroicons/react/24/outline";
import {
  type ColumnDef,
  type ColumnFiltersState,
  type ColumnSizingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  type PaginationState,
  type Updater,
  useReactTable,
} from "@tanstack/react-table";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  SqlPreviewPanel,
  type SqlPreviewRunResult,
} from "@/components/sql-preview-panel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { SqlBackendPreference } from "@/lib/sql/sql-runtime";
import { cn } from "@/lib/utils";

const DEFAULT_PAGE_SIZE = 10;
const DEFAULT_COLUMN_SIZE = 180;
const MIN_COLUMN_SIZE = 120;
const MAX_COLUMN_SIZE = 640;
const EXPANDED_PAGE_SIZE = 100;

function normalizeFilterValue(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

type SqlResultsTableDataOverride = {
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

export function SqlResultsTable({
  dataOverride,
  className,
  pageSize = DEFAULT_PAGE_SIZE,
  expandable = false,
  expandTitle = "Query Results",
  enableColumnFilters = true,
  expandedDialogEnableColumnFilters = true,
  query,
  dbIdentifier,
  backendPreference,
  onSqlSave,
}: {
  dataOverride?: SqlResultsTableDataOverride;
  className?: string;
  pageSize?: number;
  expandable?: boolean;
  expandTitle?: string;
  enableColumnFilters?: boolean;
  expandedDialogEnableColumnFilters?: boolean;
  query?: string;
  dbIdentifier?: string;
  backendPreference?: SqlBackendPreference;
  onSqlSave?: (newSql: string) => Promise<void>;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [runDataOverride, setRunDataOverride] = useState<
    SqlResultsTableDataOverride | undefined
  >(undefined);
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
        filterFn: (row, columnId, filterValue) => {
          const filterText = normalizeFilterValue(filterValue);

          if (!filterText) {
            return true;
          }

          const cellValue = normalizeFilterValue(row.getValue(columnId));
          return cellValue.includes(filterText);
        },
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
  const shouldPaginateByDefault = rows.length > resolvedPageSize;

  // Controlled pagination state - resets when rows change
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: shouldPaginateByDefault
      ? resolvedPageSize
      : Math.max(rows.length, 1),
  });
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [openFilterColumnIds, setOpenFilterColumnIds] = useState<string[]>([]);
  const previousColumnNamesSignature = useRef<string>("");

  // Update pageSize when rows change
  useEffect(() => {
    const newPageSize =
      rows.length > resolvedPageSize
        ? resolvedPageSize
        : Math.max(rows.length, 1);
    setPagination({
      pageIndex: 0, // Reset to first page when data changes
      pageSize: newPageSize,
    });
  }, [rows.length, resolvedPageSize]);

  useEffect(() => {
    if (!enableColumnFilters && columnFilters.length > 0) {
      setColumnFilters([]);
    }
  }, [columnFilters, enableColumnFilters]);

  useEffect(() => {
    const nextColumnNamesSignature = columns
      .map((column) => column.name)
      .join("||");

    if (nextColumnNamesSignature === previousColumnNamesSignature.current) {
      return;
    }

    previousColumnNamesSignature.current = nextColumnNamesSignature;
    setColumnSizing({});
    setColumnFilters([]);
    setOpenFilterColumnIds([]);
  }, [columns]);

  const handleColumnFiltersChange = (updater: Updater<ColumnFiltersState>) => {
    setColumnFilters(updater);
    setPagination((current) => ({
      ...current,
      pageIndex: 0,
    }));
  };

  const table = useReactTable({
    data: rows,
    columns: tableColumns,
    defaultColumn: {
      size: DEFAULT_COLUMN_SIZE,
      minSize: MIN_COLUMN_SIZE,
      maxSize: MAX_COLUMN_SIZE,
    },
    enableColumnResizing: true,
    enableColumnFilters,
    columnResizeMode: "onEnd",
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: enableColumnFilters
      ? getFilteredRowModel()
      : undefined,
    getPaginationRowModel: getPaginationRowModel(),
    state: {
      pagination,
      columnSizing,
      columnFilters,
    },
    onPaginationChange: setPagination,
    onColumnSizingChange: setColumnSizing,
    onColumnFiltersChange: handleColumnFiltersChange,
  });
  const filteredRowCount = table.getFilteredRowModel().rows.length;
  const pageRowCount = table.getRowModel().rows.length;
  const pageStart =
    filteredRowCount === 0
      ? 0
      : table.getState().pagination.pageIndex *
          table.getState().pagination.pageSize +
        1;
  const pageEnd =
    filteredRowCount === 0
      ? 0
      : Math.min(pageStart + pageRowCount - 1, filteredRowCount);
  const shouldPaginate =
    filteredRowCount > table.getState().pagination.pageSize;
  const shouldRenderFilterRow =
    enableColumnFilters && openFilterColumnIds.length > 0;

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
      {/* Summary + Expand button */}
      <div className="shrink-0 flex items-center justify-between">
        {summary ? (
          <div className="space-y-2">
            <div className="flex gap-4 text-sm text-muted-foreground">
              <span>{summary.totalRows} rows</span>
              {summary.executionTimeMs && (
                <span>{summary.executionTimeMs}ms</span>
              )}
              {summary.queryType && <span>{summary.queryType}</span>}
            </div>
          </div>
        ) : (
          <div />
        )}
        {expandable && (
          <button
            type="button"
            onClick={() => setIsExpanded(true)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-input bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Expand table"
            title="Expand table"
          >
            <ArrowTopRightOnSquareIcon className="h-4 w-4" />
          </button>
        )}
      </div>

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
                      <div className="flex items-center gap-1 pr-3">
                        <div className="min-w-0 flex-1 truncate">
                          {header.isPlaceholder
                            ? null
                            : flexRender(
                                header.column.columnDef.header,
                                header.getContext(),
                              )}
                        </div>
                        {enableColumnFilters && !header.isPlaceholder && (
                          <button
                            type="button"
                            onClick={() => {
                              setOpenFilterColumnIds((current) =>
                                current.includes(header.column.id)
                                  ? current.filter(
                                      (id) => id !== header.column.id,
                                    )
                                  : [...current, header.column.id],
                              );
                            }}
                            className={cn(
                              "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                              (openFilterColumnIds.includes(header.column.id) ||
                                header.column.getIsFiltered()) &&
                                "bg-muted text-foreground",
                            )}
                            aria-label={`Toggle filter for ${String(header.column.columnDef.header ?? header.id)}`}
                            title={`Filter ${String(header.column.columnDef.header ?? header.id)}`}
                          >
                            <FunnelIcon className="h-3.5 w-3.5" />
                          </button>
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
            {shouldRenderFilterRow && table.getFlatHeaders().length > 0 && (
              <tr className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
                {table.getFlatHeaders().map((header) => (
                  <th
                    key={`${header.id}-filter`}
                    className="p-2 align-middle"
                    style={{ width: header.getSize() }}
                  >
                    {header.isPlaceholder ||
                    !openFilterColumnIds.includes(header.column.id) ? null : (
                      <Input
                        value={(header.column.getFilterValue() as string) ?? ""}
                        onChange={(event) =>
                          header.column.setFilterValue(event.target.value)
                        }
                        aria-label={`Filter ${String(header.column.columnDef.header ?? header.id)}`}
                        className="h-8 border-border/80 bg-background text-xs shadow-none"
                      />
                    )}
                  </th>
                ))}
              </tr>
            )}
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
            Showing {pageStart} to {pageEnd} of {filteredRowCount} results
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

      {/* Expanded dialog */}
      {expandable && (
        <Dialog
          open={isExpanded}
          onOpenChange={(open) => {
            setIsExpanded(open);
            if (!open) setRunDataOverride(undefined);
          }}
        >
          <DialogContent className="max-h-[90vh] max-w-6xl overflow-hidden">
            <DialogHeader>
              <DialogTitle>{expandTitle}</DialogTitle>
              <DialogDescription>
                Showing {(runDataOverride?.rows ?? rows).length} row
                {(runDataOverride?.rows ?? rows).length !== 1 ? "s" : ""} across{" "}
                {(runDataOverride?.columns ?? columns).length} column
                {(runDataOverride?.columns ?? columns).length !== 1 ? "s" : ""}.
              </DialogDescription>
            </DialogHeader>
            {query && (
              <SqlPreviewPanel
                query={query}
                dbIdentifier={dbIdentifier}
                backendPreference={backendPreference}
                onSave={
                  onSqlSave
                    ? async (newSql) => {
                        await onSqlSave(newSql);
                        setRunDataOverride(undefined);
                      }
                    : undefined
                }
                onRunStart={() => {
                  setRunDataOverride({
                    stage: "complete",
                    columns: [],
                    rows: [],
                  });
                }}
                onRun={(result: SqlPreviewRunResult) => {
                  setRunDataOverride({
                    stage: "complete",
                    columns: result.columns,
                    rows: result.rows,
                  });
                }}
                onCancel={() => {
                  setRunDataOverride(undefined);
                }}
              />
            )}
            <div className="max-h-[70vh] overflow-auto">
              <SqlResultsTable
                dataOverride={runDataOverride ?? dataOverride}
                pageSize={EXPANDED_PAGE_SIZE}
                expandable={false}
                enableColumnFilters={expandedDialogEnableColumnFilters}
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
