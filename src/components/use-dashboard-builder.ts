import type { UIMessage } from "@ai-sdk/react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createEmptyJoinDraftClause,
  createEmptyJoinDraftGroup,
  extractDetectedJoinTables,
  flattenJoinDraftGroups,
  type JoinDraftGroup,
  seedJoinDraftGroups,
} from "@/components/dashboard-builder-panel.joins";
import type {
  DashboardBuilderVisualType,
  JoinColumnState,
  VisualSnapshot,
} from "@/components/dashboard-builder-panel.shared";
import {
  buildJoinSourceInfo,
  normalizeVisualArtifact,
  resolveStoredChartDbIdentifier,
} from "@/components/dashboard-builder-panel.shared";
import { getDashboardItemConfig } from "@/components/dashboard-builder-panel.visuals";
import type { SqlAnalysisData } from "@/components/sql-analysis-display.types";
import type { ArtifactData } from "@/hooks/types";
import { useArtifacts } from "@/hooks/use-artifacts";
import {
  buildDashboardSourceDescriptor,
  getDashboardSourceDescriptorCatalogContext,
  getDashboardSourceDescriptorDbIdentifier,
  getDashboardSourceDescriptorRuntimeBackend,
} from "@/lib/dashboard/source-descriptor";
import { readJoinDefsFromStorage } from "@/lib/joins/browser-storage";
import { runQuery } from "@/lib/sql/run-query";
import type { SqlBackend } from "@/lib/sql/sql-runtime";
import {
  addChartToDashboard,
  createDashboard,
} from "@/lib/workspace/dashboard-repo";
import { useRouter } from "@/vite/next-navigation";

type UseDashboardBuilderOptions = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messages: UIMessage[];
  selectedDbIdentifier?: string;
  selectedSqlBackend?: SqlBackend;
};

function defaultDraftJoinGroup(
  detectedTables: Array<{ tableName: string }>,
): JoinDraftGroup {
  return createEmptyJoinDraftGroup({
    leftTable: detectedTables[0]?.tableName ?? "",
    rightTable: detectedTables[1]?.tableName ?? "",
  });
}

export function useDashboardBuilder({
  open,
  onOpenChange,
  messages,
  selectedDbIdentifier,
  selectedSqlBackend,
}: UseDashboardBuilderOptions) {
  const router = useRouter();
  const [dashboardTitle, setDashboardTitle] = useState("New dashboard");
  const [selectedChartIds, setSelectedChartIds] = useState<string[]>([]);
  const [visualTypeBySnapshotId, setVisualTypeBySnapshotId] = useState<
    Record<string, DashboardBuilderVisualType>
  >({});
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

    setVisualTypeBySnapshotId((prev) => {
      const nextEntries = visualSnapshots.map(
        (snapshot) =>
          [snapshot.id, prev[snapshot.id] ?? snapshot.type] as const,
      );
      const next = Object.fromEntries(nextEntries);
      const prevKeys = Object.keys(prev);
      const isSame =
        prevKeys.length === nextEntries.length &&
        nextEntries.every(([id, type]) => prev[id] === type);
      return isSame ? prev : next;
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
      setVisualTypeBySnapshotId({});
      hasInitializedSelectionRef.current = false;
    }
  }, [open]);

  const snapshotsWithSelectedTypes = useMemo(
    () =>
      visualSnapshots.map((snapshot) => ({
        ...snapshot,
        type: visualTypeBySnapshotId[snapshot.id] ?? snapshot.type,
      })),
    [visualSnapshots, visualTypeBySnapshotId],
  );

  const selectedCharts = useMemo(
    () =>
      snapshotsWithSelectedTypes.filter((snapshot) =>
        selectedChartIds.includes(snapshot.id),
      ),
    [snapshotsWithSelectedTypes, selectedChartIds],
  );

  const removedCharts = useMemo(
    () =>
      snapshotsWithSelectedTypes.filter(
        (snapshot) => !selectedChartIds.includes(snapshot.id),
      ),
    [snapshotsWithSelectedTypes, selectedChartIds],
  );

  const detectedTables = useMemo(
    () =>
      extractDetectedJoinTables(
        selectedCharts.map((snapshot) => snapshot.payload.query),
      ),
    [selectedCharts],
  );

  const detectedTableOptions = useMemo(
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

  const handleVisualTypeChange = (
    id: string,
    type: DashboardBuilderVisualType,
  ) => {
    setVisualTypeBySnapshotId((prev) => {
      if (prev[id] === type) return prev;
      return {
        ...prev,
        [id]: type,
      };
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
        const { payload } = snapshot;
        const { config, title, description } = getDashboardItemConfig(snapshot);

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

  return {
    dashboardTitle,
    setDashboardTitle,
    selectedChartIds,
    setSelectedChartIds,
    visualTypeBySnapshotId,
    joinGroups,
    columnStateByTable,
    isSaving,
    error,
    visualSnapshots,
    selectedCharts,
    removedCharts,
    detectedTables,
    detectedTableOptions,
    joinSourceSummary,
    shouldShowJoinBuilder,
    isJoinBuilderEditable,
    handleRemoveChart,
    handleRestoreChart,
    handleVisualTypeChange,
    handleAddJoinGroup,
    handleRemoveJoinGroup,
    handleJoinGroupChange,
    handleJoinClauseChange,
    handleAddJoinClause,
    handleRemoveJoinClause,
    handleCreateDashboard,
    loadColumnsForTable,
  };
}
