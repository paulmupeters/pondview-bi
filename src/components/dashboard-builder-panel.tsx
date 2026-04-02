import type { UIMessage } from "@ai-sdk/react";
import {
  Check,
  ChevronDown,
  MinusCircleIcon,
  PlusCircleIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createEmptyJoinDraftClause,
  createEmptyJoinDraftGroup,
  type DetectedJoinTable,
  extractDetectedJoinTables,
  flattenJoinDraftGroups,
  type JoinDraftGroup,
  seedJoinDraftGroups,
} from "@/components/dashboard-builder-panel.joins";
import type { SqlAnalysisData } from "@/components/sql-analysis-display.types";
import { SqlChart } from "@/components/sql-chart";
import { SqlResultsTable } from "@/components/sql-results-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ArtifactData } from "@/hooks/types";
import { useArtifacts } from "@/hooks/use-artifacts";
import { readJoinDefsFromStorage } from "@/lib/joins/browser-storage";
import {
  buildDashboardSourceDescriptor,
  getDashboardSourceDescriptorCatalogContext,
  getDashboardSourceDescriptorDbIdentifier,
  getDashboardSourceDescriptorRuntimeBackend,
  type DashboardSourceDescriptor,
} from "@/lib/dashboard/source-descriptor";
import type { JoinKind } from "@/lib/joins/graph";
import { runQuery } from "@/lib/sql/run-query";
import {
  DEFAULT_WASM_DB_IDENTIFIER,
  isWasmLocalIdentifier,
  type SqlBackend,
} from "@/lib/sql/sql-runtime";
import type { CardConfig, Config, Result, TableConfig } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  addChartToDashboard,
  createDashboard,
} from "@/lib/workspace/dashboard-repo";
import { useRouter } from "@/vite/next-navigation";

type DashboardBuilderPanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messages: UIMessage[];
  selectedDbIdentifier?: string;
  selectedSqlBackend?: SqlBackend;
};

type VisualSnapshot = {
  id: string;
  createdAt: number;
  artifact: ArtifactData<SqlAnalysisData>;
  payload: SqlAnalysisData;
  rows: Result[];
  type: "chart" | "card" | "table";
};

type JoinColumnState = {
  status: "idle" | "loading" | "loaded" | "error";
  columns: string[];
  error?: string;
};

type JoinSourceInfo = {
  sourceDescriptor: DashboardSourceDescriptor | null;
  storedDbIdentifier: string | null;
  executionDbIdentifier?: string;
  catalogContext?: string | null;
  sqlBackend: SqlBackend | null;
};

export function resolveStoredChartDbIdentifier(options: {
  sqlBackend: SqlBackend | null;
  payloadDbIdentifier?: string;
  selectedDbIdentifier?: string;
}): string | null {
  const candidates = [options.payloadDbIdentifier, options.selectedDbIdentifier]
    .map((value) => value?.trim() ?? "")
    .filter((value): value is string => value.length > 0);

  if (options.sqlBackend === "duckdb-wasm") {
    return candidates[0] ?? DEFAULT_WASM_DB_IDENTIFIER;
  }

  if (options.sqlBackend === "bridge" || options.sqlBackend === "duckdb-http") {
    return (
      candidates
        .filter((value) => value === options.payloadDbIdentifier?.trim())
        .find((value) => !isWasmLocalIdentifier(value)) ?? null
    );
  }

  return candidates[0] ?? DEFAULT_WASM_DB_IDENTIFIER;
}

function buildFallbackChartConfig(payload: SqlAnalysisData): Config | null {
  const columns = payload.columns ?? [];
  const xKey = columns[0]?.name ?? "";
  const yKey = columns[1]?.name;

  if (!xKey) {
    return null;
  }

  const querySnippet = payload.query ?? "";
  const truncatedQuery =
    querySnippet.length > 50 ? `${querySnippet.slice(0, 50)}...` : querySnippet;

  return {
    visualType: "chart",
    title: truncatedQuery ? `Chart: ${truncatedQuery}` : "Generated chart",
    description: payload.summary?.insights?.[0] ?? "",
    type: "line",
    xKey,
    yKeys: yKey ? [yKey] : [],
    multipleLines: false,
    legend: false,
    countMode: false,
    showGrid: true,
    showXAxis: true,
    showYAxis: true,
    showDots: true,
    showTooltip: true,
    lineSize: 2,
    labelYAngle: -90,
  };
}

function normalizeVisualArtifact(
  artifact: ArtifactData<SqlAnalysisData>,
): VisualSnapshot | null {
  const payload = artifact.payload;

  if (!payload) return null;
  if ((payload.stage ?? "") !== "complete") return null;

  const visualType = payload.visualType;

  // Handle chart artifacts
  if (visualType === "chart") {
    const resolvedChartConfig =
      payload.chartConfig ?? buildFallbackChartConfig(payload);
    if (!resolvedChartConfig) return null;

    const rows = Array.isArray(payload.rows)
      ? (payload.rows as Result[]).map((row) => ({ ...row }))
      : [];

    return {
      id: artifact.id,
      createdAt: artifact.createdAt,
      artifact,
      payload: {
        ...payload,
        chartConfig: resolvedChartConfig,
        columns: (payload.columns ?? []).map(
          (column: { name: string; type?: string }) => ({ ...column }),
        ),
        rows,
      },
      rows,
      type: "chart",
    };
  }

  // Handle card artifacts
  if (visualType === "card") {
    const rows = Array.isArray(payload.rows)
      ? (payload.rows as Result[]).map((row) => ({ ...row }))
      : [];

    const defaultCardConfig = payload.cardConfig ?? {
      title: payload.columns?.[0]?.name ?? "Untitled Card",
      description: "",
      takeaway: "",
    };

    return {
      id: artifact.id,
      createdAt: artifact.createdAt,
      artifact,
      payload: {
        ...payload,
        columns: (payload.columns ?? []).map(
          (column: { name: string; type?: string }) => ({ ...column }),
        ),
        rows,
        cardConfig: { configType: "card", ...defaultCardConfig },
      },
      rows,
      type: "card",
    };
  }

  // Handle table artifacts - generate default tableConfig if missing
  if (visualType === "table") {
    const rows = Array.isArray(payload.rows)
      ? (payload.rows as Result[]).map((row) => ({ ...row }))
      : [];

    // Generate a minimal default tableConfig for tables
    const defaultTableConfig = payload.tableConfig ?? {
      configType: "table" as const,
      title: payload.query
        ? `Table: ${payload.query.substring(0, 50)}${payload.query.length > 50 ? "..." : ""}`
        : "Data Table",
      description: payload.summary?.insights?.[0] ?? "",
    };

    return {
      id: artifact.id,
      createdAt: artifact.createdAt,
      artifact,
      payload: {
        ...payload,
        columns: (payload.columns ?? []).map(
          (column: { name: string; type?: string }) => ({ ...column }),
        ),
        rows,
        tableConfig: defaultTableConfig,
      },
      rows,
      type: "table",
    };
  }

  return null;
}

function defaultDraftJoinGroup(
  detectedTables: DetectedJoinTable[],
): JoinDraftGroup {
  return createEmptyJoinDraftGroup({
    leftTable: detectedTables[0]?.tableName ?? "",
    rightTable: detectedTables[1]?.tableName ?? "",
  });
}

function buildJoinSourceInfo(
  snapshot: VisualSnapshot,
  selectedDbIdentifier?: string,
  selectedSqlBackend?: SqlBackend,
): JoinSourceInfo {
  const sourceDescriptor =
    snapshot.payload.sourceDescriptor ??
    (snapshot.payload.sqlBackend || selectedSqlBackend
      ? buildDashboardSourceDescriptor({
          runtimeBackend:
            snapshot.payload.sqlBackend ?? selectedSqlBackend ?? "duckdb-wasm",
          dbIdentifier:
            snapshot.payload.dbIdentifier ?? selectedDbIdentifier ?? null,
          catalogContext: snapshot.payload.catalogContext ?? null,
        })
      : null);
  const sqlBackend =
    getDashboardSourceDescriptorRuntimeBackend(sourceDescriptor) ??
    snapshot.payload.sqlBackend ??
    selectedSqlBackend ??
    null;

  return {
    sourceDescriptor,
    storedDbIdentifier: resolveStoredChartDbIdentifier({
      sqlBackend,
      payloadDbIdentifier:
        getDashboardSourceDescriptorDbIdentifier(sourceDescriptor) ??
        snapshot.payload.dbIdentifier,
      selectedDbIdentifier,
    }),
    executionDbIdentifier:
      sqlBackend === "duckdb-wasm"
        ? (
            getDashboardSourceDescriptorDbIdentifier(sourceDescriptor) ??
            snapshot.payload.dbIdentifier
          )?.trim() || selectedDbIdentifier?.trim()
        : (
            getDashboardSourceDescriptorDbIdentifier(sourceDescriptor) ??
            snapshot.payload.dbIdentifier
          )?.trim(),
    catalogContext:
      getDashboardSourceDescriptorCatalogContext(sourceDescriptor) ??
      snapshot.payload.catalogContext ??
      null,
    sqlBackend,
  };
}

type SearchableSelectOption = {
  value: string;
  label: string;
};

type SearchableSingleSelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder: string;
  searchPlaceholder: string;
  emptyLabel: string;
  disabled?: boolean;
  onOpen?: () => void;
};

function SearchableSingleSelect({
  value,
  onChange,
  options,
  placeholder,
  searchPlaceholder,
  emptyLabel,
  disabled = false,
  onOpen,
}: SearchableSingleSelectProps) {
  const [open, setOpen] = useState(false);

  const selectedOption = options.find((option) => option.value === value);

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) {
          onOpen?.();
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="w-full justify-between font-normal"
          disabled={disabled}
        >
          <span className="truncate">
            {selectedOption?.label || placeholder}
          </span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0" align="start">
        <Command shouldFilter={options.length > 0}>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyLabel}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={`${option.label} ${option.value}`}
                  onSelect={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === option.value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="truncate">{option.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function DashboardBuilderPanel({
  open,
  onOpenChange,
  messages,
  selectedDbIdentifier,
  selectedSqlBackend,
}: DashboardBuilderPanelProps) {
  const router = useRouter();
  const [dashboardTitle, setDashboardTitle] = useState("New dashboard");
  const [selectedChartIds, setSelectedChartIds] = useState<string[]>([]);
  const [joinGroups, setJoinGroups] = useState<JoinDraftGroup[]>([]);
  const [columnStateByTable, setColumnStateByTable] = useState<
    Record<string, JoinColumnState>
  >({});
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasInitializedSelectionRef = useRef(false);

  const includeExecuteSql = useMemo(() => ["execute-sql"], []);

  const { artifacts } = useArtifacts(messages, {
    include: includeExecuteSql,
  });

  const visualSnapshots = useMemo<VisualSnapshot[]>(() => {
    return artifacts
      .map((artifact) => {
        const typedArtifact = artifact as ArtifactData<SqlAnalysisData>;
        return normalizeVisualArtifact(typedArtifact);
      })
      .filter((snapshot): snapshot is VisualSnapshot => snapshot !== null)
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [artifacts]);

  useEffect(() => {
    if (!open) return;

    const availableIds = visualSnapshots.map((snapshot) => snapshot.id);

    setSelectedChartIds((prev) => {
      if (!hasInitializedSelectionRef.current) {
        hasInitializedSelectionRef.current = true;

        const isAlreadyAligned =
          prev.length === availableIds.length &&
          availableIds.every((id, index) => id === prev[index]);

        if (isAlreadyAligned) {
          return prev;
        }

        return availableIds;
      }

      const filtered = prev.filter((id) => availableIds.includes(id));

      if (filtered.length !== prev.length) {
        return filtered;
      }

      return prev;
    });
  }, [visualSnapshots, open]);

  useEffect(() => {
    if (!open) {
      setDashboardTitle("New dashboard");
      setJoinGroups([]);
      setColumnStateByTable({});
      setIsSaving(false);
      setError(null);
      setSelectedChartIds([]);
      hasInitializedSelectionRef.current = false;
    }
  }, [open]);

  const selectedCharts = useMemo(
    () =>
      visualSnapshots.filter((snapshot) =>
        selectedChartIds.includes(snapshot.id),
      ),
    [visualSnapshots, selectedChartIds],
  );

  const removedCharts = useMemo(
    () =>
      visualSnapshots.filter(
        (snapshot) => !selectedChartIds.includes(snapshot.id),
      ),
    [visualSnapshots, selectedChartIds],
  );

  const detectedTables = useMemo(
    () =>
      extractDetectedJoinTables(
        selectedCharts.map((snapshot) => snapshot.payload.query),
      ),
    [selectedCharts],
  );

  const detectedTableOptions = useMemo<SearchableSelectOption[]>(
    () =>
      detectedTables.map((table) => ({
        value: table.tableName,
        label: table.label,
      })),
    [detectedTables],
  );

  const detectedTableMap = useMemo(
    () =>
      new Map(detectedTables.map((table) => [table.tableName, table] as const)),
    [detectedTables],
  );

  const selectedChartSources = useMemo(
    () =>
      selectedCharts.map((snapshot) =>
        buildJoinSourceInfo(snapshot, selectedDbIdentifier, selectedSqlBackend),
      ),
    [selectedCharts, selectedDbIdentifier, selectedSqlBackend],
  );

  const joinSourceSummary = useMemo(() => {
    const sqlBackendValues = Array.from(
      new Set(selectedChartSources.map((source) => source.sqlBackend ?? "")),
    );
    const dbIdentifierValues = Array.from(
      new Set(
        selectedChartSources.map((source) => source.storedDbIdentifier ?? ""),
      ),
    );
    const catalogContextValues = Array.from(
      new Set(
        selectedChartSources.map((source) => source.catalogContext ?? ""),
      ),
    );

    return {
      hasMixedSqlBackends: sqlBackendValues.length > 1,
      hasMixedDbIdentifiers: dbIdentifierValues.length > 1,
      hasMixedCatalogContexts: catalogContextValues.length > 1,
      sharedSqlBackend:
        sqlBackendValues.length === 1 ? sqlBackendValues[0] || null : null,
      sharedExecutionDbIdentifier:
        selectedChartSources.find(
          (source) => (source.executionDbIdentifier ?? "").length > 0,
        )?.executionDbIdentifier ?? selectedDbIdentifier,
      sharedExecutionCatalogContext:
        catalogContextValues.length === 1
          ? catalogContextValues[0] || null
          : null,
    };
  }, [selectedChartSources, selectedDbIdentifier]);

  const shouldShowJoinBuilder = detectedTables.length > 1;
  const isJoinBuilderEditable =
    shouldShowJoinBuilder &&
    !joinSourceSummary.hasMixedDbIdentifiers &&
    !joinSourceSummary.hasMixedSqlBackends &&
    !joinSourceSummary.hasMixedCatalogContexts;

  const flattenedJoinDefs = useMemo(
    () => flattenJoinDraftGroups(joinGroups),
    [joinGroups],
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    setColumnStateByTable({});

    if (!shouldShowJoinBuilder) {
      setJoinGroups([]);
      return;
    }

    if (!isJoinBuilderEditable) {
      setJoinGroups([]);
      return;
    }

    setJoinGroups(
      seedJoinDraftGroups(detectedTables, readJoinDefsFromStorage()),
    );
  }, [detectedTables, isJoinBuilderEditable, open, shouldShowJoinBuilder]);

  const loadColumnsForTable = async (tableName: string) => {
    if (!tableName) {
      return;
    }

    const detectedTable = detectedTableMap.get(tableName);
    if (!detectedTable?.rawReference) {
      return;
    }

    let shouldFetch = false;
    setColumnStateByTable((prev) => {
      const existing = prev[tableName];
      if (
        existing &&
        (existing.status === "loading" || existing.status === "loaded")
      ) {
        return prev;
      }
      shouldFetch = true;
      return {
        ...prev,
        [tableName]: {
          status: "loading",
          columns: [],
        },
      };
    });

    if (!shouldFetch) {
      return;
    }

    try {
      const result = await runQuery({
        sql: `DESCRIBE ${detectedTable.rawReference}`,
        backendPreference: joinSourceSummary.sharedSqlBackend ?? "auto",
        dbIdentifier: joinSourceSummary.sharedExecutionDbIdentifier,
        catalogContext: joinSourceSummary.sharedExecutionCatalogContext,
      });
      const columns = result.rows
        .map((row) =>
          String(row.column_name ?? row.column ?? row.name ?? "").trim(),
        )
        .filter((column): column is string => column.length > 0);

      setColumnStateByTable((prev) => ({
        ...prev,
        [tableName]: {
          status: "loaded",
          columns,
        },
      }));
    } catch (loadError) {
      setColumnStateByTable((prev) => ({
        ...prev,
        [tableName]: {
          status: "error",
          columns: [],
          error:
            loadError instanceof Error
              ? loadError.message
              : "Failed to load columns.",
        },
      }));
    }
  };

  const handleRemoveChart = (id: string) => {
    setSelectedChartIds((prev) => prev.filter((chartId) => chartId !== id));
  };

  const handleRestoreChart = (id: string) => {
    setSelectedChartIds((prev) => {
      if (prev.includes(id)) return prev;
      return [...prev, id];
    });
  };

  const handleAddJoinGroup = () => {
    setJoinGroups((prev) => [...prev, defaultDraftJoinGroup(detectedTables)]);
  };

  const handleRemoveJoinGroup = (groupId: string) => {
    setJoinGroups((prev) => prev.filter((group) => group.id !== groupId));
  };

  const handleJoinGroupChange = (
    groupId: string,
    input: Partial<Pick<JoinDraftGroup, "leftTable" | "rightTable" | "type">>,
  ) => {
    setJoinGroups((prev) =>
      prev.map((group) => {
        if (group.id !== groupId) {
          return group;
        }

        const nextGroup: JoinDraftGroup = {
          ...group,
          ...input,
        };

        if (
          input.leftTable !== undefined &&
          input.leftTable !== group.leftTable
        ) {
          nextGroup.clauses = nextGroup.clauses.map((clause) => ({
            ...clause,
            leftColumn: "",
          }));
        }

        if (
          input.rightTable !== undefined &&
          input.rightTable !== group.rightTable
        ) {
          nextGroup.clauses = nextGroup.clauses.map((clause) => ({
            ...clause,
            rightColumn: "",
          }));
        }

        return nextGroup;
      }),
    );
  };

  const handleJoinClauseChange = (
    groupId: string,
    clauseId: string,
    input: Partial<{ leftColumn: string; rightColumn: string }>,
  ) => {
    setJoinGroups((prev) =>
      prev.map((group) => {
        if (group.id !== groupId) {
          return group;
        }

        return {
          ...group,
          clauses: group.clauses.map((clause) =>
            clause.id === clauseId ? { ...clause, ...input } : clause,
          ),
        };
      }),
    );
  };

  const handleAddJoinClause = (groupId: string) => {
    setJoinGroups((prev) =>
      prev.map((group) =>
        group.id === groupId
          ? {
              ...group,
              clauses: [...group.clauses, createEmptyJoinDraftClause()],
            }
          : group,
      ),
    );
  };

  const handleRemoveJoinClause = (groupId: string, clauseId: string) => {
    setJoinGroups((prev) =>
      prev.map((group) => {
        if (group.id !== groupId) {
          return group;
        }

        const nextClauses = group.clauses.filter(
          (clause) => clause.id !== clauseId,
        );
        return {
          ...group,
          clauses:
            nextClauses.length > 0
              ? nextClauses
              : [createEmptyJoinDraftClause()],
        };
      }),
    );
  };

  const handleCreateDashboard = async () => {
    if (!selectedCharts.length || isSaving) return;

    const trimmedTitle = dashboardTitle.trim() || "New dashboard";
    setIsSaving(true);
    setError(null);

    try {
      const firstSelectedChart = selectedCharts[0];
      const firstSourceDescriptor =
        firstSelectedChart?.payload.sourceDescriptor ??
        (firstSelectedChart?.payload.sqlBackend || selectedSqlBackend
          ? buildDashboardSourceDescriptor({
              runtimeBackend:
                firstSelectedChart?.payload.sqlBackend ??
                selectedSqlBackend ??
                "duckdb-wasm",
              dbIdentifier:
                firstSelectedChart?.payload.dbIdentifier ??
                selectedDbIdentifier ??
                null,
              catalogContext:
                firstSelectedChart?.payload.catalogContext ?? null,
            })
          : null);
      const firstChartBackend =
        getDashboardSourceDescriptorRuntimeBackend(firstSourceDescriptor) ??
        firstSelectedChart?.payload.sqlBackend ??
        selectedSqlBackend ??
        null;
      const { id: dashboardId } = await createDashboard(trimmedTitle, {
        sourceDescriptor: firstSourceDescriptor,
        dbIdentifier: resolveStoredChartDbIdentifier({
          sqlBackend: firstChartBackend,
          payloadDbIdentifier:
            getDashboardSourceDescriptorDbIdentifier(firstSourceDescriptor) ??
            firstSelectedChart?.payload.dbIdentifier,
          selectedDbIdentifier,
        }),
        joinDefs: shouldShowJoinBuilder ? flattenedJoinDefs : undefined,
        sqlBackend: firstChartBackend,
      });

      for (const snapshot of selectedCharts) {
        const { payload, type } = snapshot;

        // Determine the config based on visual type
        let config: CardConfig | TableConfig | Config | undefined;
        let title: string | undefined;

        if (type === "card") {
          config = payload.cardConfig;
          title = config?.title ?? "Untitled card";
        } else if (type === "table") {
          config = payload.tableConfig;
          title = config?.title ?? "Untitled table";
        } else {
          config = payload.chartConfig;
          title = config?.title ?? "Untitled chart";
        }

        const description = config?.description ?? null;
        const sourceDescriptor =
          payload.sourceDescriptor ??
          (payload.sqlBackend || selectedSqlBackend
            ? buildDashboardSourceDescriptor({
                runtimeBackend:
                  payload.sqlBackend ?? selectedSqlBackend ?? "duckdb-wasm",
                dbIdentifier:
                  payload.dbIdentifier ?? selectedDbIdentifier ?? null,
                catalogContext: payload.catalogContext ?? null,
              })
            : null);
        const sqlBackend =
          getDashboardSourceDescriptorRuntimeBackend(sourceDescriptor) ??
          payload.sqlBackend ??
          selectedSqlBackend ??
          null;

        await addChartToDashboard({
          dashboardId,
          title,
          description,
          sql: payload.query ?? "",
          sourceDescriptor,
          dbIdentifier: resolveStoredChartDbIdentifier({
            sqlBackend,
            payloadDbIdentifier:
              getDashboardSourceDescriptorDbIdentifier(sourceDescriptor) ??
              payload.dbIdentifier,
            selectedDbIdentifier,
          }),
          catalogContext:
            getDashboardSourceDescriptorCatalogContext(sourceDescriptor) ??
            payload.catalogContext ??
            null,
          sqlBackend,
          chartConfigJson: JSON.stringify(config ?? {}),
        });
      }

      onOpenChange(false);
      router.push(`/dashboards/view?id=${encodeURIComponent(dashboardId)}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected error";
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col w-full overflow-hidden">
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pr-2">
        <div className="space-y-4 min-w-0">
          <div>
            <h2 className="text-lg font-semibold">Generate dashboard</h2>
            <p className="text-sm text-muted-foreground">
              Select the visuals you'd like to include and give the dashboard a
              title.
            </p>
          </div>

          <div className="space-y-3">
            <label className="text-sm font-medium" htmlFor="dashboard-title">
              Dashboard title
            </label>
            <Input
              id="dashboard-title"
              value={dashboardTitle}
              onChange={(event) => setDashboardTitle(event.target.value)}
              placeholder="e.g. Weekly revenue overview"
            />
          </div>

          {shouldShowJoinBuilder && (
            <Card className="bg-secondary/60">
              <CardHeader>
                <CardTitle className="text-sm">Table joins</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Add joins now so dashboard filters can move cleanly across
                  tables after creation.
                </p>

                {!isJoinBuilderEditable ? (
                  <div className="rounded-md border border-dashed px-4 py-3 text-sm text-muted-foreground">
                    Join setup is available in this builder only when all
                    selected visuals use the same data source and SQL runtime.
                    You can still create the dashboard now.
                  </div>
                ) : (
                  <>
                    {joinGroups.length === 0 ? (
                      <div className="rounded-md border border-dashed px-4 py-6 text-sm text-muted-foreground">
                        No joins configured yet. Add one if these tables should
                        filter each other.
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {joinGroups.map((group, groupIndex) => {
                          const leftColumnState = group.leftTable
                            ? (columnStateByTable[group.leftTable] ?? {
                                status: "idle",
                                columns: [],
                              })
                            : null;
                          const rightColumnState = group.rightTable
                            ? (columnStateByTable[group.rightTable] ?? {
                                status: "idle",
                                columns: [],
                              })
                            : null;
                          const leftColumnOptions = (
                            leftColumnState?.columns ?? []
                          ).map((column) => ({
                            value: column,
                            label: column,
                          }));
                          const rightColumnOptions = (
                            rightColumnState?.columns ?? []
                          ).map((column) => ({
                            value: column,
                            label: column,
                          }));

                          return (
                            <div
                              key={group.id}
                              className="space-y-4 rounded-lg border bg-muted/20 p-4"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                  <p className="text-sm font-medium">
                                    Join {groupIndex + 1}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    Define the table pair and one or more ON
                                    clauses.
                                  </p>
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() =>
                                    handleRemoveJoinGroup(group.id)
                                  }
                                >
                                  <MinusCircleIcon className="mr-1 h-4 w-4" />
                                  Remove join
                                </Button>
                              </div>

                              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_minmax(0,1fr)]">
                                <div className="space-y-2">
                                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                    Left table
                                  </p>
                                  <SearchableSingleSelect
                                    value={group.leftTable}
                                    onChange={(value) =>
                                      handleJoinGroupChange(group.id, {
                                        leftTable: value,
                                      })
                                    }
                                    options={detectedTableOptions}
                                    placeholder="Select table"
                                    searchPlaceholder="Find table"
                                    emptyLabel="No tables found"
                                  />
                                </div>

                                <div className="space-y-2">
                                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                    Join type
                                  </p>
                                  <Select
                                    value={group.type}
                                    onValueChange={(value) =>
                                      handleJoinGroupChange(group.id, {
                                        type: value as JoinKind,
                                      })
                                    }
                                  >
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="inner">
                                        Inner
                                      </SelectItem>
                                      <SelectItem value="left">Left</SelectItem>
                                      <SelectItem value="right">
                                        Right
                                      </SelectItem>
                                      <SelectItem value="full">Full</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>

                                <div className="space-y-2">
                                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                    Right table
                                  </p>
                                  <SearchableSingleSelect
                                    value={group.rightTable}
                                    onChange={(value) =>
                                      handleJoinGroupChange(group.id, {
                                        rightTable: value,
                                      })
                                    }
                                    options={detectedTableOptions}
                                    placeholder="Select table"
                                    searchPlaceholder="Find table"
                                    emptyLabel="No tables found"
                                  />
                                </div>
                              </div>

                              <div className="space-y-3">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-sm font-medium">
                                    ON clauses
                                  </p>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      handleAddJoinClause(group.id)
                                    }
                                  >
                                    <PlusCircleIcon className="mr-1 h-4 w-4" />
                                    Add ON clause
                                  </Button>
                                </div>

                                {group.clauses.map((clause, clauseIndex) => (
                                  <div
                                    key={clause.id}
                                    className="grid gap-3 rounded-md border bg-background p-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto]"
                                  >
                                    <div className="space-y-2">
                                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                        Left column
                                      </p>
                                      <SearchableSingleSelect
                                        value={clause.leftColumn}
                                        onChange={(value) =>
                                          handleJoinClauseChange(
                                            group.id,
                                            clause.id,
                                            {
                                              leftColumn: value,
                                            },
                                          )
                                        }
                                        options={leftColumnOptions}
                                        placeholder={
                                          group.leftTable
                                            ? "Select column"
                                            : "Pick a table first"
                                        }
                                        searchPlaceholder="Find column"
                                        emptyLabel={
                                          !group.leftTable
                                            ? "Select a table first"
                                            : leftColumnState?.status ===
                                                "loading"
                                              ? "Loading columns..."
                                              : leftColumnState?.status ===
                                                  "error"
                                                ? (leftColumnState.error ??
                                                  "Failed to load columns.")
                                                : "No columns found"
                                        }
                                        disabled={!group.leftTable}
                                        onOpen={() => {
                                          void loadColumnsForTable(
                                            group.leftTable,
                                          );
                                        }}
                                      />
                                    </div>

                                    <div className="flex items-end justify-center pb-2 text-sm font-medium text-muted-foreground">
                                      =
                                    </div>

                                    <div className="space-y-2">
                                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                        Right column
                                      </p>
                                      <SearchableSingleSelect
                                        value={clause.rightColumn}
                                        onChange={(value) =>
                                          handleJoinClauseChange(
                                            group.id,
                                            clause.id,
                                            {
                                              rightColumn: value,
                                            },
                                          )
                                        }
                                        options={rightColumnOptions}
                                        placeholder={
                                          group.rightTable
                                            ? "Select column"
                                            : "Pick a table first"
                                        }
                                        searchPlaceholder="Find column"
                                        emptyLabel={
                                          !group.rightTable
                                            ? "Select a table first"
                                            : rightColumnState?.status ===
                                                "loading"
                                              ? "Loading columns..."
                                              : rightColumnState?.status ===
                                                  "error"
                                                ? (rightColumnState.error ??
                                                  "Failed to load columns.")
                                                : "No columns found"
                                        }
                                        disabled={!group.rightTable}
                                        onOpen={() => {
                                          void loadColumnsForTable(
                                            group.rightTable,
                                          );
                                        }}
                                      />
                                    </div>

                                    <div className="flex items-end justify-end">
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="text-destructive hover:text-destructive"
                                        onClick={() =>
                                          handleRemoveJoinClause(
                                            group.id,
                                            clause.id,
                                          )
                                        }
                                      >
                                        <MinusCircleIcon className="mr-1 h-4 w-4" />
                                        {clauseIndex === 0 &&
                                        group.clauses.length === 1
                                          ? "Clear"
                                          : "Remove"}
                                      </Button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleAddJoinGroup}
                      >
                        <PlusCircleIcon className="mr-1 h-4 w-4" />
                        Add join
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          <div className="flex min-w-0 flex-col gap-3">
            <div>
              <p className="text-sm font-medium">Selected visuals</p>
              <p className="text-xs text-muted-foreground">
                {selectedCharts.length} of {visualSnapshots.length} available
                visuals
              </p>
            </div>

            <div className="min-w-0 rounded-md border">
              <div className="min-w-0 space-y-4 p-3">
                {selectedCharts.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-12 text-center">
                    {visualSnapshots.length === 0
                      ? "No visuals available yet. Generate a chart or card in the conversation to get started."
                      : "No visuals selected. Restore a visual below to add it."}
                  </div>
                ) : (
                  selectedCharts.map((snapshot) => (
                    <div
                      key={snapshot.id}
                      className="min-w-0 overflow-hidden rounded-md bg-card shadow-sm"
                    >
                      <div className="flex min-w-0 items-center justify-between gap-3 px-3 py-2">
                        <div className="flex min-w-0 flex-col">
                          <span className="text-sm font-medium">
                            {snapshot.type === "card"
                              ? snapshot.payload.cardConfig?.title ||
                                "Untitled card"
                              : snapshot.type === "table"
                                ? snapshot.payload.tableConfig?.title ||
                                  "Untitled table"
                                : snapshot.payload.chartConfig?.title ||
                                  "Untitled visual"}
                          </span>
                          {snapshot.payload.query && (
                            <span className="text-xs text-muted-foreground truncate max-w-[280px]">
                              {snapshot.payload.query}
                            </span>
                          )}
                        </div>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          className="text-destructive-foreground hover:text-destructive"
                          onClick={() => handleRemoveChart(snapshot.id)}
                        >
                          <MinusCircleIcon className="h-4 w-4" />
                          <span className="sr-only">
                            Remove {snapshot.type}
                          </span>
                        </Button>
                      </div>
                      {snapshot.type === "card" ? (
                        <div className="flex min-w-0 justify-center p-4">
                          <Card className="w-full max-w-sm border-0 shadow-none">
                            <CardHeader>
                              <CardTitle className="text-base font-medium text-muted-foreground">
                                {snapshot.payload.cardConfig?.title ||
                                  (snapshot.payload.columns?.[0]?.name ??
                                    "Value")}
                              </CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div className="text-4xl font-bold text-foreground">
                                {(() => {
                                  const value =
                                    snapshot.rows[0]?.[
                                      snapshot.payload.columns?.[0]?.name ?? ""
                                    ];
                                  if (typeof value === "number") {
                                    return value.toLocaleString();
                                  }
                                  if (typeof value === "boolean") {
                                    return value.toString();
                                  }
                                  if (value instanceof Date) {
                                    return value.toLocaleString();
                                  }
                                  return String(value);
                                })()}
                              </div>
                              {snapshot.payload.cardConfig?.description && (
                                <div className="text-sm text-muted-foreground mt-2">
                                  {snapshot.payload.cardConfig.description}
                                </div>
                              )}
                              {snapshot.payload.cardConfig?.takeaway && (
                                <div className="text-xs text-muted-foreground mt-2 italic">
                                  {snapshot.payload.cardConfig.takeaway}
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        </div>
                      ) : snapshot.type === "table" ? (
                        <div className="min-w-0 p-4">
                          <div className="rounded-md border bg-background">
                            <SqlResultsTable
                              dataOverride={{
                                stage: "complete",
                                columns: snapshot.payload.columns || [],
                                rows: snapshot.rows,
                                summary: snapshot.payload.summary,
                              }}
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="min-w-0 p-4">
                          <div className="rounded-md border bg-background p-3">
                            <SqlChart
                              customChartConfig={snapshot.payload.chartConfig}
                              dataOverride={{
                                ...snapshot.payload,
                                rows: snapshot.rows,
                                stage: "complete",
                              }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {removedCharts.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Removed visuals</p>
                <div className="flex flex-wrap gap-2">
                  {removedCharts.map((snapshot) => (
                    <Button
                      key={snapshot.id}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex items-center gap-1"
                      onClick={() => handleRestoreChart(snapshot.id)}
                    >
                      <PlusCircleIcon className="h-4 w-4" />
                      {snapshot.type === "card"
                        ? snapshot.payload.cardConfig?.title || "Untitled card"
                        : snapshot.type === "table"
                          ? snapshot.payload.tableConfig?.title ||
                            "Untitled table"
                          : snapshot.payload.chartConfig?.title ||
                            "Untitled visual"}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-destructive px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={isSaving}
        >
          Cancel
        </Button>
        <Button
          type="button"
          onClick={handleCreateDashboard}
          disabled={isSaving || selectedCharts.length === 0}
        >
          {isSaving ? "Creating…" : "Create dashboard"}
        </Button>
      </div>
    </div>
  );
}
