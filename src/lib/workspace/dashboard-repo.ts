import { nanoid } from "nanoid";
import type { SqlBackend } from "@/lib/sql/sql-runtime";
import type { CardConfig } from "@/lib/types";
import {
  deleteByKey,
  getAllFromStore,
  getByKey,
  putOne,
  STORE_CHART_SLICERS,
  STORE_CHARTS,
  STORE_DASHBOARD_MEASURES,
  STORE_DASHBOARD_SLICERS,
  STORE_DASHBOARDS,
  type WorkspaceChart,
  type WorkspaceChartSlicer,
  type WorkspaceDashboard,
  type WorkspaceDashboardMeasure,
  type WorkspaceDashboardSlicer,
} from "@/lib/workspace/workspace-db";

export type DbDashboard = WorkspaceDashboard;
export type DbDashboardChart = WorkspaceChart;
export type DbDashboardMeasure = WorkspaceDashboardMeasure;
export type DbDashboardSlicer = WorkspaceDashboardSlicer;
export type DbChartSlicer = WorkspaceChartSlicer;

async function upsertDashboard(dashboard: WorkspaceDashboard): Promise<void> {
  await putOne(STORE_DASHBOARDS, dashboard);
}

async function upsertChart(chart: WorkspaceChart): Promise<void> {
  await putOne(STORE_CHARTS, chart);
}

async function upsertDashboardMeasure(
  measure: WorkspaceDashboardMeasure,
): Promise<void> {
  await putOne(STORE_DASHBOARD_MEASURES, measure);
}

async function upsertDashboardSlicer(
  slicer: WorkspaceDashboardSlicer,
): Promise<void> {
  await putOne(STORE_DASHBOARD_SLICERS, slicer);
}

async function upsertChartSlicer(slicer: WorkspaceChartSlicer): Promise<void> {
  await putOne(STORE_CHART_SLICERS, slicer);
}

function sortByPosition<T extends { position: number }>(rows: T[]): T[] {
  return [...rows].sort((left, right) => left.position - right.position);
}

function parseCardConfig(chartConfigJson: string): CardConfig | null {
  try {
    const parsed = JSON.parse(chartConfigJson) as CardConfig;
    if (!parsed || parsed.configType !== "card") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function touchDashboard(dashboardId: string, now: number): Promise<void> {
  const dashboard = await getByKey<WorkspaceDashboard>(
    STORE_DASHBOARDS,
    dashboardId,
  );
  if (!dashboard) {
    return;
  }

  await upsertDashboard({
    ...dashboard,
    updatedAt: now,
  });
}

export async function listDashboards(): Promise<
  { id: string; title: string; updatedAt: number }[]
> {
  console.info("[dashboard-repo] listDashboards start");
  const dashboards =
    await getAllFromStore<WorkspaceDashboard>(STORE_DASHBOARDS);
  const result = dashboards
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .map((dashboard) => ({
      id: dashboard.id,
      title: dashboard.title,
      updatedAt: dashboard.updatedAt,
    }));
  console.info("[dashboard-repo] listDashboards done", {
    count: result.length,
  });
  return result;
}

export async function createDashboard(
  title: string,
  now = Date.now(),
): Promise<{ id: string }> {
  const id = nanoid();
  await upsertDashboard({
    id,
    title,
    createdAt: now,
    updatedAt: now,
  });
  return { id };
}

export async function updateDashboardTitle(
  dashboardId: string,
  title: string,
  now = Date.now(),
): Promise<{ updated: boolean }> {
  const existing = await getByKey<WorkspaceDashboard>(
    STORE_DASHBOARDS,
    dashboardId,
  );
  if (!existing) {
    return { updated: false };
  }

  await upsertDashboard({
    ...existing,
    title,
    updatedAt: now,
  });

  return { updated: true };
}

export async function getDashboardWithCharts(dashboardId: string): Promise<{
  dashboard: WorkspaceDashboard;
  charts: WorkspaceChart[];
} | null> {
  const dashboard = await getByKey<WorkspaceDashboard>(
    STORE_DASHBOARDS,
    dashboardId,
  );
  if (!dashboard) {
    return null;
  }

  const charts = await listChartsByDashboard(dashboardId);
  return { dashboard, charts };
}

export async function listChartsByDashboard(
  dashboardId: string,
): Promise<WorkspaceChart[]> {
  const charts = await getAllFromStore<WorkspaceChart>(STORE_CHARTS);
  return sortByPosition(
    charts.filter((chart) => chart.dashboardId === dashboardId),
  );
}

export async function getChartById(
  chartId: string,
): Promise<WorkspaceChart | null> {
  return (await getByKey<WorkspaceChart>(STORE_CHARTS, chartId)) ?? null;
}

export async function listMeasuresByDashboard(
  dashboardId: string,
): Promise<WorkspaceDashboardMeasure[]> {
  const measures = await getAllFromStore<WorkspaceDashboardMeasure>(
    STORE_DASHBOARD_MEASURES,
  );
  return measures
    .filter((measure) => measure.dashboardId === dashboardId)
    .sort((left, right) => left.label.localeCompare(right.label));
}

export async function getMeasureById(
  measureId: string,
): Promise<WorkspaceDashboardMeasure | null> {
  return (
    (await getByKey<WorkspaceDashboardMeasure>(
      STORE_DASHBOARD_MEASURES,
      measureId,
    )) ?? null
  );
}

export async function createDashboardMeasure(input: {
  dashboardId: string;
  key: string;
  label: string;
  sql: string;
  dbIdentifier?: string | null;
  sqlBackend?: SqlBackend | null;
  now?: number;
}): Promise<{ id: string }> {
  const dashboard = await getByKey<WorkspaceDashboard>(
    STORE_DASHBOARDS,
    input.dashboardId,
  );
  if (!dashboard) {
    throw new Error("Dashboard not found");
  }

  const existingMeasures = await listMeasuresByDashboard(input.dashboardId);
  if (existingMeasures.some((measure) => measure.key === input.key)) {
    throw new Error("Measure key already exists on this dashboard");
  }

  const now = input.now ?? Date.now();
  const id = nanoid();
  await upsertDashboardMeasure({
    id,
    dashboardId: input.dashboardId,
    key: input.key,
    label: input.label,
    sql: input.sql,
    dbIdentifier: input.dbIdentifier ?? null,
    sqlBackend: input.sqlBackend ?? null,
    createdAt: now,
    updatedAt: now,
  });

  await touchDashboard(input.dashboardId, now);

  return { id };
}

export async function updateDashboardMeasure(
  measureId: string,
  input: {
    label?: string;
    sql?: string;
    dbIdentifier?: string | null;
    sqlBackend?: SqlBackend | null;
    now?: number;
  },
): Promise<{ updated: boolean }> {
  const measure = await getByKey<WorkspaceDashboardMeasure>(
    STORE_DASHBOARD_MEASURES,
    measureId,
  );
  if (!measure) {
    return { updated: false };
  }

  const now = input.now ?? Date.now();
  const nextMeasure: WorkspaceDashboardMeasure = {
    ...measure,
    label: input.label ?? measure.label,
    sql: input.sql ?? measure.sql,
    dbIdentifier:
      input.dbIdentifier === undefined
        ? measure.dbIdentifier
        : input.dbIdentifier,
    sqlBackend:
      input.sqlBackend === undefined ? measure.sqlBackend : input.sqlBackend,
    updatedAt: now,
  };

  await upsertDashboardMeasure(nextMeasure);

  const charts = await listChartsByDashboard(measure.dashboardId);
  const measureBackedCharts = charts.filter((chart) => {
    const config = parseCardConfig(chart.chartConfigJson);
    return config?.measureId === measureId;
  });

  await Promise.all(
    measureBackedCharts.map((chart) =>
      upsertChart({
        ...chart,
        sql: nextMeasure.sql,
        dbIdentifier: nextMeasure.dbIdentifier,
        sqlBackend: nextMeasure.sqlBackend ?? null,
        updatedAt: now,
      }),
    ),
  );

  await touchDashboard(measure.dashboardId, now);

  return { updated: true };
}

export async function addChartToDashboard(input: {
  dashboardId: string;
  title?: string | null;
  description?: string | null;
  sql: string;
  dbIdentifier?: string | null;
  sqlBackend?: SqlBackend | null;
  chartConfigJson: string;
  semanticQueryJson?: string | null;
  exploreName?: string | null;
  now?: number;
}): Promise<{ id: string }> {
  const dashboard = await getByKey<WorkspaceDashboard>(
    STORE_DASHBOARDS,
    input.dashboardId,
  );
  if (!dashboard) {
    throw new Error("Dashboard not found");
  }

  const now = input.now ?? Date.now();
  const id = nanoid();
  const charts = await listChartsByDashboard(input.dashboardId);
  const maxPosition = charts.reduce(
    (max, chart) => Math.max(max, chart.position),
    -1,
  );

  await upsertChart({
    id,
    dashboardId: input.dashboardId,
    title: input.title ?? null,
    description: input.description ?? null,
    sql: input.sql,
    dbIdentifier: input.dbIdentifier ?? null,
    sqlBackend: input.sqlBackend ?? null,
    chartConfigJson: input.chartConfigJson,
    semanticQueryJson: input.semanticQueryJson ?? null,
    exploreName: input.exploreName ?? null,
    position: maxPosition + 1,
    createdAt: now,
    updatedAt: now,
  });

  await upsertDashboard({
    ...dashboard,
    updatedAt: now,
  });

  return { id };
}

export async function updateChartConfig(
  chartId: string,
  chartConfigJson: string,
  now = Date.now(),
): Promise<{ updated: boolean }> {
  const chart = await getByKey<WorkspaceChart>(STORE_CHARTS, chartId);
  if (!chart) {
    return { updated: false };
  }

  await upsertChart({
    ...chart,
    chartConfigJson,
    updatedAt: now,
  });

  await touchDashboard(chart.dashboardId, now);

  return { updated: true };
}

export async function updateChartSql(
  chartId: string,
  sql: string,
  now = Date.now(),
): Promise<{ updated: boolean }> {
  const chart = await getByKey<WorkspaceChart>(STORE_CHARTS, chartId);
  if (!chart) {
    return { updated: false };
  }

  await upsertChart({
    ...chart,
    sql,
    updatedAt: now,
  });

  await touchDashboard(chart.dashboardId, now);

  return { updated: true };
}

export async function reorderDashboardCharts(
  dashboardId: string,
  orderedChartIds: string[],
  now = Date.now(),
): Promise<void> {
  const charts = await listChartsByDashboard(dashboardId);
  const existingIds = charts.map((chart) => chart.id);
  if (
    existingIds.length !== orderedChartIds.length ||
    new Set(orderedChartIds).size !== orderedChartIds.length ||
    orderedChartIds.some((id) => !existingIds.includes(id))
  ) {
    throw new Error("Ordered chart ids do not match dashboard charts");
  }

  for (let index = 0; index < orderedChartIds.length; index += 1) {
    const chartId = orderedChartIds[index];
    const chart = charts.find((item) => item.id === chartId);
    if (!chart) {
      throw new Error("Invalid chart ordering");
    }
    await upsertChart({
      ...chart,
      position: index,
      updatedAt: now,
    });
  }

  await touchDashboard(dashboardId, now);
}

export async function removeChartFromDashboard(
  chartId: string,
  now = Date.now(),
): Promise<{ removed: boolean }> {
  const chart = await getByKey<WorkspaceChart>(STORE_CHARTS, chartId);
  if (!chart) {
    return { removed: false };
  }

  await deleteByKey(STORE_CHARTS, chartId);

  const chartSlicers =
    await getAllFromStore<WorkspaceChartSlicer>(STORE_CHART_SLICERS);
  for (const slicer of chartSlicers) {
    if (slicer.chartId === chartId) {
      await deleteByKey(STORE_CHART_SLICERS, slicer.id);
    }
  }

  await touchDashboard(chart.dashboardId, now);

  return { removed: true };
}

export async function deleteDashboard(
  dashboardId: string,
): Promise<{ deleted: boolean }> {
  const dashboard = await getByKey<WorkspaceDashboard>(
    STORE_DASHBOARDS,
    dashboardId,
  );
  if (!dashboard) {
    return { deleted: false };
  }

  const charts = await getAllFromStore<WorkspaceChart>(STORE_CHARTS);
  const chartIds = charts
    .filter((chart) => chart.dashboardId === dashboardId)
    .map((chart) => chart.id);
  for (const chartId of chartIds) {
    await deleteByKey(STORE_CHARTS, chartId);
  }

  const measures = await getAllFromStore<WorkspaceDashboardMeasure>(
    STORE_DASHBOARD_MEASURES,
  );
  for (const measure of measures) {
    if (measure.dashboardId === dashboardId) {
      await deleteByKey(STORE_DASHBOARD_MEASURES, measure.id);
    }
  }

  const dashboardSlicers = await getAllFromStore<WorkspaceDashboardSlicer>(
    STORE_DASHBOARD_SLICERS,
  );
  for (const slicer of dashboardSlicers) {
    if (slicer.dashboardId === dashboardId) {
      await deleteByKey(STORE_DASHBOARD_SLICERS, slicer.id);
    }
  }

  const chartSlicers =
    await getAllFromStore<WorkspaceChartSlicer>(STORE_CHART_SLICERS);
  for (const slicer of chartSlicers) {
    if (chartIds.includes(slicer.chartId)) {
      await deleteByKey(STORE_CHART_SLICERS, slicer.id);
    }
  }

  await deleteByKey(STORE_DASHBOARDS, dashboardId);
  return { deleted: true };
}

export async function listSlicersByDashboard(
  dashboardId: string,
): Promise<WorkspaceDashboardSlicer[]> {
  const slicers = await getAllFromStore<WorkspaceDashboardSlicer>(
    STORE_DASHBOARD_SLICERS,
  );
  return sortByPosition(
    slicers.filter((slicer) => slicer.dashboardId === dashboardId),
  );
}

export async function addSlicerToDashboard(input: {
  dashboardId: string;
  field: string;
  title?: string | null;
  limit?: number;
  now?: number;
}): Promise<{ id: string }> {
  const dashboard = await getByKey<WorkspaceDashboard>(
    STORE_DASHBOARDS,
    input.dashboardId,
  );
  if (!dashboard) {
    throw new Error("Dashboard not found");
  }

  const now = input.now ?? Date.now();
  const id = nanoid();
  const slicers = await listSlicersByDashboard(input.dashboardId);
  const maxPosition = slicers.reduce(
    (max, slicer) => Math.max(max, slicer.position),
    -1,
  );

  await upsertDashboardSlicer({
    id,
    dashboardId: input.dashboardId,
    field: input.field,
    title: input.title ?? null,
    limit: input.limit ?? 50,
    position: maxPosition + 1,
    createdAt: now,
    updatedAt: now,
  });

  await upsertDashboard({
    ...dashboard,
    updatedAt: now,
  });

  return { id };
}

export async function updateSlicer(input: {
  slicerId: string;
  title?: string | null;
  limit?: number;
  now?: number;
}): Promise<{ updated: boolean }> {
  const slicer = await getByKey<WorkspaceDashboardSlicer>(
    STORE_DASHBOARD_SLICERS,
    input.slicerId,
  );
  if (!slicer) {
    return { updated: false };
  }

  const now = input.now ?? Date.now();
  await upsertDashboardSlicer({
    ...slicer,
    title: input.title !== undefined ? input.title : slicer.title,
    limit: input.limit !== undefined ? input.limit : slicer.limit,
    updatedAt: now,
  });

  const dashboard = await getByKey<WorkspaceDashboard>(
    STORE_DASHBOARDS,
    slicer.dashboardId,
  );
  if (dashboard) {
    await upsertDashboard({
      ...dashboard,
      updatedAt: now,
    });
  }

  return { updated: true };
}

export async function reorderDashboardSlicers(
  dashboardId: string,
  orderedSlicerIds: string[],
  now = Date.now(),
): Promise<void> {
  const slicers = await listSlicersByDashboard(dashboardId);
  const existingIds = slicers.map((slicer) => slicer.id);
  if (
    existingIds.length !== orderedSlicerIds.length ||
    new Set(orderedSlicerIds).size !== orderedSlicerIds.length ||
    orderedSlicerIds.some((id) => !existingIds.includes(id))
  ) {
    throw new Error("Ordered slicer ids do not match dashboard slicers");
  }

  for (let index = 0; index < orderedSlicerIds.length; index += 1) {
    const slicerId = orderedSlicerIds[index];
    const slicer = slicers.find((item) => item.id === slicerId);
    if (!slicer) {
      throw new Error("Invalid slicer ordering");
    }

    await upsertDashboardSlicer({
      ...slicer,
      position: index,
      updatedAt: now,
    });
  }
}

export async function removeSlicerFromDashboard(
  slicerId: string,
  now = Date.now(),
): Promise<{ removed: boolean }> {
  const slicer = await getByKey<WorkspaceDashboardSlicer>(
    STORE_DASHBOARD_SLICERS,
    slicerId,
  );
  if (!slicer) {
    return { removed: false };
  }

  await deleteByKey(STORE_DASHBOARD_SLICERS, slicerId);

  const dashboard = await getByKey<WorkspaceDashboard>(
    STORE_DASHBOARDS,
    slicer.dashboardId,
  );
  if (dashboard) {
    await upsertDashboard({
      ...dashboard,
      updatedAt: now,
    });
  }

  return { removed: true };
}

export async function listSlicersByChart(
  chartId: string,
): Promise<WorkspaceChartSlicer[]> {
  const slicers =
    await getAllFromStore<WorkspaceChartSlicer>(STORE_CHART_SLICERS);
  return sortByPosition(slicers.filter((slicer) => slicer.chartId === chartId));
}

export async function addSlicerToChart(input: {
  chartId: string;
  field: string;
  title?: string | null;
  limit?: number;
  now?: number;
}): Promise<{ id: string }> {
  const chart = await getByKey<WorkspaceChart>(STORE_CHARTS, input.chartId);
  if (!chart) {
    throw new Error("Chart not found");
  }

  const now = input.now ?? Date.now();
  const id = nanoid();
  const slicers = await listSlicersByChart(input.chartId);
  const maxPosition = slicers.reduce(
    (max, slicer) => Math.max(max, slicer.position),
    -1,
  );

  await upsertChartSlicer({
    id,
    chartId: input.chartId,
    field: input.field,
    title: input.title ?? null,
    limit: input.limit ?? 50,
    position: maxPosition + 1,
    createdAt: now,
    updatedAt: now,
  });

  const dashboard = await getByKey<WorkspaceDashboard>(
    STORE_DASHBOARDS,
    chart.dashboardId,
  );
  if (dashboard) {
    await upsertDashboard({
      ...dashboard,
      updatedAt: now,
    });
  }

  return { id };
}

export async function updateChartSlicer(input: {
  slicerId: string;
  title?: string | null;
  limit?: number;
  now?: number;
}): Promise<{ updated: boolean }> {
  const slicer = await getByKey<WorkspaceChartSlicer>(
    STORE_CHART_SLICERS,
    input.slicerId,
  );
  if (!slicer) {
    return { updated: false };
  }

  const now = input.now ?? Date.now();
  await upsertChartSlicer({
    ...slicer,
    title: input.title !== undefined ? input.title : slicer.title,
    limit: input.limit !== undefined ? input.limit : slicer.limit,
    updatedAt: now,
  });

  const chart = await getByKey<WorkspaceChart>(STORE_CHARTS, slicer.chartId);
  if (chart) {
    const dashboard = await getByKey<WorkspaceDashboard>(
      STORE_DASHBOARDS,
      chart.dashboardId,
    );
    if (dashboard) {
      await upsertDashboard({
        ...dashboard,
        updatedAt: now,
      });
    }
  }

  return { updated: true };
}

export async function reorderChartSlicers(
  chartId: string,
  orderedSlicerIds: string[],
  now = Date.now(),
): Promise<void> {
  const slicers = await listSlicersByChart(chartId);
  const existingIds = slicers.map((slicer) => slicer.id);
  if (
    existingIds.length !== orderedSlicerIds.length ||
    new Set(orderedSlicerIds).size !== orderedSlicerIds.length ||
    orderedSlicerIds.some((id) => !existingIds.includes(id))
  ) {
    throw new Error("Ordered slicer ids do not match chart slicers");
  }

  for (let index = 0; index < orderedSlicerIds.length; index += 1) {
    const slicerId = orderedSlicerIds[index];
    const slicer = slicers.find((item) => item.id === slicerId);
    if (!slicer) {
      throw new Error("Invalid slicer ordering");
    }

    await upsertChartSlicer({
      ...slicer,
      position: index,
      updatedAt: now,
    });
  }
}

export async function removeSlicerFromChart(
  slicerId: string,
  now = Date.now(),
): Promise<{ removed: boolean }> {
  const slicer = await getByKey<WorkspaceChartSlicer>(
    STORE_CHART_SLICERS,
    slicerId,
  );
  if (!slicer) {
    return { removed: false };
  }

  await deleteByKey(STORE_CHART_SLICERS, slicerId);

  const chart = await getByKey<WorkspaceChart>(STORE_CHARTS, slicer.chartId);
  if (chart) {
    const dashboard = await getByKey<WorkspaceDashboard>(
      STORE_DASHBOARDS,
      chart.dashboardId,
    );
    if (dashboard) {
      await upsertDashboard({
        ...dashboard,
        updatedAt: now,
      });
    }
  }

  return { removed: true };
}
