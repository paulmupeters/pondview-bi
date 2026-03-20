import { promises as fs } from "node:fs";
import { nanoid } from "nanoid";
import {
  readJsonFile,
  resolveSidecarPath,
  writeJsonFileAtomic,
} from "@/lib/sidecar/json-store";

export type DbDashboard = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
};

export type DbDashboardChart = {
  id: string;
  dashboardId: string;
  title: string | null;
  description: string | null;
  sql: string;
  dbIdentifier: string | null;
  chartConfigJson: string;
  semanticQueryJson: string | null;
  exploreName: string | null;
  position: number;
  createdAt: number;
  updatedAt: number;
};

export type DbDashboardSlicer = {
  id: string;
  dashboardId: string;
  field: string;
  title: string | null;
  limit: number;
  position: number;
  createdAt: number;
  updatedAt: number;
};

export type DbChartSlicer = {
  id: string;
  chartId: string;
  field: string;
  title: string | null;
  limit: number;
  position: number;
  createdAt: number;
  updatedAt: number;
};

type DashboardsIndexFile = {
  version: 1;
  dashboards: DbDashboard[];
};

type DashboardFile = {
  version: 1;
  dashboard: DbDashboard;
  charts: DbDashboardChart[];
  dashboardSlicers: DbDashboardSlicer[];
  chartSlicers: DbChartSlicer[];
};

const DASHBOARDS_INDEX_PATH = resolveSidecarPath(
  "config",
  "dashboards",
  "index.json",
);

function dashboardFilePath(dashboardId: string): string {
  return resolveSidecarPath(
    "config",
    "dashboards",
    `${encodeURIComponent(dashboardId)}.json`,
  );
}

async function loadDashboardsIndex(): Promise<DashboardsIndexFile> {
  return readJsonFile(DASHBOARDS_INDEX_PATH, { version: 1, dashboards: [] });
}

async function saveDashboardsIndex(index: DashboardsIndexFile): Promise<void> {
  await writeJsonFileAtomic(DASHBOARDS_INDEX_PATH, index);
}

async function loadDashboardFile(
  dashboardId: string,
): Promise<DashboardFile | null> {
  const fallback = null as DashboardFile | null;
  return readJsonFile(dashboardFilePath(dashboardId), fallback);
}

async function saveDashboardFile(file: DashboardFile): Promise<void> {
  await writeJsonFileAtomic(dashboardFilePath(file.dashboard.id), file);
}

async function upsertDashboardIndex(dashboard: DbDashboard): Promise<void> {
  const index = await loadDashboardsIndex();
  const existingIndex = index.dashboards.findIndex(
    (d) => d.id === dashboard.id,
  );
  if (existingIndex >= 0) {
    index.dashboards[existingIndex] = dashboard;
  } else {
    index.dashboards.push(dashboard);
  }
  await saveDashboardsIndex(index);
}

async function findChartLocation(chartId: string): Promise<{
  file: DashboardFile;
  chartIndex: number;
} | null> {
  const index = await loadDashboardsIndex();
  for (const dashboard of index.dashboards) {
    const file = await loadDashboardFile(dashboard.id);
    if (!file) continue;
    const chartIndex = file.charts.findIndex((chart) => chart.id === chartId);
    if (chartIndex >= 0) {
      return { file, chartIndex };
    }
  }
  return null;
}

function touchDashboard(file: DashboardFile, now: number): void {
  file.dashboard.updatedAt = now;
}

function sortByPosition<T extends { position: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.position - b.position);
}

export async function listDashboards() {
  const index = await loadDashboardsIndex();
  return [...index.dashboards]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((d) => ({
      id: d.id,
      title: d.title,
      updatedAt: d.updatedAt,
    }));
}

export async function createDashboard(title: string, now = Date.now()) {
  const id = nanoid();
  const dashboard: DbDashboard = {
    id,
    title,
    createdAt: now,
    updatedAt: now,
  };
  const file: DashboardFile = {
    version: 1,
    dashboard,
    charts: [],
    dashboardSlicers: [],
    chartSlicers: [],
  };
  await saveDashboardFile(file);
  await upsertDashboardIndex(dashboard);
  return { id };
}

export async function updateDashboardTitle(
  dashboardId: string,
  title: string,
  now = Date.now(),
) {
  const file = await loadDashboardFile(dashboardId);
  if (!file) return { updated: false };
  file.dashboard.title = title;
  file.dashboard.updatedAt = now;
  await saveDashboardFile(file);
  await upsertDashboardIndex(file.dashboard);
  return { updated: true };
}

export async function getDashboardWithCharts(dashboardId: string) {
  const file = await loadDashboardFile(dashboardId);
  if (!file) return null;
  return {
    dashboard: file.dashboard,
    charts: sortByPosition(file.charts),
  };
}

export async function listChartsByDashboard(dashboardId: string) {
  const file = await loadDashboardFile(dashboardId);
  if (!file) return [];
  return sortByPosition(file.charts);
}

export async function getChartById(chartId: string) {
  const location = await findChartLocation(chartId);
  if (!location) return null;
  return location.file.charts[location.chartIndex] ?? null;
}

export async function addChartToDashboard(input: {
  dashboardId: string;
  title?: string | null;
  description?: string | null;
  sql: string;
  dbIdentifier?: string | null;
  chartConfigJson: string;
  semanticQueryJson?: string | null;
  exploreName?: string | null;
  now?: number;
}) {
  const file = await loadDashboardFile(input.dashboardId);
  if (!file) {
    throw new Error("Dashboard not found");
  }
  const now = input.now ?? Date.now();
  const id = nanoid();
  const maxPosition = file.charts.reduce(
    (max, chart) => Math.max(max, chart.position),
    -1,
  );
  const nextChart: DbDashboardChart = {
    id,
    dashboardId: input.dashboardId,
    title: input.title ?? null,
    description: input.description ?? null,
    sql: input.sql,
    dbIdentifier: input.dbIdentifier ?? null,
    chartConfigJson: input.chartConfigJson,
    semanticQueryJson: input.semanticQueryJson ?? null,
    exploreName: input.exploreName ?? null,
    position: maxPosition + 1,
    createdAt: now,
    updatedAt: now,
  };
  file.charts.push(nextChart);
  touchDashboard(file, now);
  await saveDashboardFile(file);
  await upsertDashboardIndex(file.dashboard);
  return { id };
}

export async function updateChartConfig(
  chartId: string,
  chartConfigJson: string,
  now = Date.now(),
) {
  const location = await findChartLocation(chartId);
  if (!location) return { updated: false };
  const chart = location.file.charts[location.chartIndex];
  if (!chart) return { updated: false };
  chart.chartConfigJson = chartConfigJson;
  chart.updatedAt = now;
  touchDashboard(location.file, now);
  await saveDashboardFile(location.file);
  await upsertDashboardIndex(location.file.dashboard);
  return { updated: true };
}

export async function updateChartSql(
  chartId: string,
  sql: string,
  now = Date.now(),
) {
  const location = await findChartLocation(chartId);
  if (!location) return { updated: false };
  const chart = location.file.charts[location.chartIndex];
  if (!chart) return { updated: false };
  chart.sql = sql;
  chart.updatedAt = now;
  touchDashboard(location.file, now);
  await saveDashboardFile(location.file);
  await upsertDashboardIndex(location.file.dashboard);
  return { updated: true };
}

export async function reorderDashboardCharts(
  dashboardId: string,
  orderedChartIds: string[],
  now = Date.now(),
) {
  const file = await loadDashboardFile(dashboardId);
  if (!file) {
    throw new Error("Dashboard not found");
  }
  const existingIds = file.charts.map((chart) => chart.id);
  if (
    existingIds.length !== orderedChartIds.length ||
    new Set(orderedChartIds).size !== orderedChartIds.length ||
    orderedChartIds.some((id) => !existingIds.includes(id))
  ) {
    throw new Error("Ordered chart ids do not match dashboard charts");
  }
  const indexByChartId = new Map(
    orderedChartIds.map((chartId, index) => [chartId, index] as const),
  );
  for (const chart of file.charts) {
    const position = indexByChartId.get(chart.id);
    if (position === undefined) {
      throw new Error("Invalid chart ordering");
    }
    chart.position = position;
    chart.updatedAt = now;
  }
  touchDashboard(file, now);
  await saveDashboardFile(file);
  await upsertDashboardIndex(file.dashboard);
}

export async function removeChartFromDashboard(
  chartId: string,
  now = Date.now(),
) {
  const location = await findChartLocation(chartId);
  if (!location) return { removed: false };
  const [removed] = location.file.charts.splice(location.chartIndex, 1);
  if (!removed) return { removed: false };
  location.file.chartSlicers = location.file.chartSlicers.filter(
    (slicer) => slicer.chartId !== chartId,
  );
  touchDashboard(location.file, now);
  await saveDashboardFile(location.file);
  await upsertDashboardIndex(location.file.dashboard);
  return { removed: true };
}

export async function deleteDashboard(dashboardId: string) {
  const file = await loadDashboardFile(dashboardId);
  if (!file) return { deleted: false };

  const index = await loadDashboardsIndex();
  index.dashboards = index.dashboards.filter((d) => d.id !== dashboardId);
  await saveDashboardsIndex(index);

  try {
    await fs.unlink(dashboardFilePath(dashboardId));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      throw error;
    }
  }
  return { deleted: true };
}

export async function listSlicersByDashboard(dashboardId: string) {
  const file = await loadDashboardFile(dashboardId);
  if (!file) return [];
  return sortByPosition(file.dashboardSlicers);
}

export async function addSlicerToDashboard(input: {
  dashboardId: string;
  field: string;
  title?: string | null;
  limit?: number;
  now?: number;
}) {
  const file = await loadDashboardFile(input.dashboardId);
  if (!file) {
    throw new Error("Dashboard not found");
  }
  const now = input.now ?? Date.now();
  const id = nanoid();
  const maxPosition = file.dashboardSlicers.reduce(
    (max, slicer) => Math.max(max, slicer.position),
    -1,
  );
  file.dashboardSlicers.push({
    id,
    dashboardId: input.dashboardId,
    field: input.field,
    title: input.title ?? null,
    limit: input.limit ?? 50,
    position: maxPosition + 1,
    createdAt: now,
    updatedAt: now,
  });
  touchDashboard(file, now);
  await saveDashboardFile(file);
  await upsertDashboardIndex(file.dashboard);
  return { id };
}

export async function updateSlicer(input: {
  slicerId: string;
  title?: string | null;
  limit?: number;
  now?: number;
}) {
  const index = await loadDashboardsIndex();
  for (const dashboard of index.dashboards) {
    const file = await loadDashboardFile(dashboard.id);
    if (!file) continue;
    const slicer = file.dashboardSlicers.find((s) => s.id === input.slicerId);
    if (!slicer) continue;
    const now = input.now ?? Date.now();
    if (input.title !== undefined) slicer.title = input.title;
    if (input.limit !== undefined) slicer.limit = input.limit;
    slicer.updatedAt = now;
    touchDashboard(file, now);
    await saveDashboardFile(file);
    await upsertDashboardIndex(file.dashboard);
    return { updated: true };
  }
  return { updated: false };
}

export async function reorderDashboardSlicers(
  dashboardId: string,
  orderedSlicerIds: string[],
  now = Date.now(),
) {
  const file = await loadDashboardFile(dashboardId);
  if (!file) {
    throw new Error("Dashboard not found");
  }
  const existingIds = file.dashboardSlicers.map((slicer) => slicer.id);
  if (
    existingIds.length !== orderedSlicerIds.length ||
    new Set(orderedSlicerIds).size !== orderedSlicerIds.length ||
    orderedSlicerIds.some((id) => !existingIds.includes(id))
  ) {
    throw new Error("Ordered slicer ids do not match dashboard slicers");
  }
  const indexBySlicerId = new Map(
    orderedSlicerIds.map((slicerId, index) => [slicerId, index] as const),
  );
  for (const slicer of file.dashboardSlicers) {
    const position = indexBySlicerId.get(slicer.id);
    if (position === undefined) {
      throw new Error("Invalid slicer ordering");
    }
    slicer.position = position;
    slicer.updatedAt = now;
  }
  touchDashboard(file, now);
  await saveDashboardFile(file);
  await upsertDashboardIndex(file.dashboard);
}

export async function removeSlicerFromDashboard(
  slicerId: string,
  now = Date.now(),
) {
  const index = await loadDashboardsIndex();
  for (const dashboard of index.dashboards) {
    const file = await loadDashboardFile(dashboard.id);
    if (!file) continue;
    const slicerIndex = file.dashboardSlicers.findIndex(
      (s) => s.id === slicerId,
    );
    if (slicerIndex < 0) continue;
    file.dashboardSlicers.splice(slicerIndex, 1);
    touchDashboard(file, now);
    await saveDashboardFile(file);
    await upsertDashboardIndex(file.dashboard);
    return { removed: true };
  }
  return { removed: false };
}

export async function listSlicersByChart(chartId: string) {
  const location = await findChartLocation(chartId);
  if (!location) return [];
  return sortByPosition(
    location.file.chartSlicers.filter((slicer) => slicer.chartId === chartId),
  );
}

export async function addSlicerToChart(input: {
  chartId: string;
  field: string;
  title?: string | null;
  limit?: number;
  now?: number;
}) {
  const location = await findChartLocation(input.chartId);
  if (!location) {
    throw new Error("Chart not found");
  }
  const now = input.now ?? Date.now();
  const id = nanoid();
  const maxPosition = location.file.chartSlicers
    .filter((slicer) => slicer.chartId === input.chartId)
    .reduce((max, slicer) => Math.max(max, slicer.position), -1);
  location.file.chartSlicers.push({
    id,
    chartId: input.chartId,
    field: input.field,
    title: input.title ?? null,
    limit: input.limit ?? 50,
    position: maxPosition + 1,
    createdAt: now,
    updatedAt: now,
  });
  touchDashboard(location.file, now);
  await saveDashboardFile(location.file);
  await upsertDashboardIndex(location.file.dashboard);
  return { id };
}

export async function updateChartSlicer(input: {
  slicerId: string;
  title?: string | null;
  limit?: number;
  now?: number;
}) {
  const index = await loadDashboardsIndex();
  for (const dashboard of index.dashboards) {
    const file = await loadDashboardFile(dashboard.id);
    if (!file) continue;
    const slicer = file.chartSlicers.find((s) => s.id === input.slicerId);
    if (!slicer) continue;
    const now = input.now ?? Date.now();
    if (input.title !== undefined) slicer.title = input.title;
    if (input.limit !== undefined) slicer.limit = input.limit;
    slicer.updatedAt = now;
    touchDashboard(file, now);
    await saveDashboardFile(file);
    await upsertDashboardIndex(file.dashboard);
    return { updated: true };
  }
  return { updated: false };
}

export async function reorderChartSlicers(
  chartId: string,
  orderedSlicerIds: string[],
  now = Date.now(),
) {
  const location = await findChartLocation(chartId);
  if (!location) {
    throw new Error("Chart not found");
  }
  const chartSlicers = location.file.chartSlicers.filter(
    (slicer) => slicer.chartId === chartId,
  );
  const existingIds = chartSlicers.map((slicer) => slicer.id);
  if (
    existingIds.length !== orderedSlicerIds.length ||
    new Set(orderedSlicerIds).size !== orderedSlicerIds.length ||
    orderedSlicerIds.some((id) => !existingIds.includes(id))
  ) {
    throw new Error("Ordered slicer ids do not match chart slicers");
  }
  const indexBySlicerId = new Map(
    orderedSlicerIds.map((slicerId, index) => [slicerId, index] as const),
  );
  for (const slicer of location.file.chartSlicers) {
    if (slicer.chartId !== chartId) continue;
    const position = indexBySlicerId.get(slicer.id);
    if (position === undefined) {
      throw new Error("Invalid slicer ordering");
    }
    slicer.position = position;
    slicer.updatedAt = now;
  }
  touchDashboard(location.file, now);
  await saveDashboardFile(location.file);
  await upsertDashboardIndex(location.file.dashboard);
}

export async function removeSlicerFromChart(
  slicerId: string,
  now = Date.now(),
) {
  const index = await loadDashboardsIndex();
  for (const dashboard of index.dashboards) {
    const file = await loadDashboardFile(dashboard.id);
    if (!file) continue;
    const slicerIndex = file.chartSlicers.findIndex((s) => s.id === slicerId);
    if (slicerIndex < 0) continue;
    file.chartSlicers.splice(slicerIndex, 1);
    touchDashboard(file, now);
    await saveDashboardFile(file);
    await upsertDashboardIndex(file.dashboard);
    return { removed: true };
  }
  return { removed: false };
}
