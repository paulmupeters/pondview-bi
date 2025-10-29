import { and, asc, desc, eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "@/lib/db/client";
import { dashboardCharts, dashboards } from "@/lib/db/schema";

export type DbDashboard = typeof dashboards.$inferSelect;
export type DbDashboardChart = typeof dashboardCharts.$inferSelect;

export async function listDashboards() {
  const db = getDb();
  return db
    .select({ id: dashboards.id, title: dashboards.title, updatedAt: dashboards.updatedAt })
    .from(dashboards)
    .orderBy(desc(dashboards.updatedAt));
}

export async function createDashboard(title: string, now = Date.now()) {
  const db = getDb();
  const id = nanoid();
  await db
    .insert(dashboards)
    .values({ id, title, createdAt: now, updatedAt: now });
  return { id };
}

export async function getDashboardWithCharts(dashboardId: string) {
  const db = getDb();
  const [d] = await db
    .select()
    .from(dashboards)
    .where(eq(dashboards.id, dashboardId));
  if (!d) return null;
  const charts = await db
    .select()
    .from(dashboardCharts)
    .where(eq(dashboardCharts.dashboardId, dashboardId))
    .orderBy(asc(dashboardCharts.position));
  return { dashboard: d, charts };
}

export async function listChartsByDashboard(dashboardId: string) {
  const db = getDb();
  return db
    .select()
    .from(dashboardCharts)
    .where(eq(dashboardCharts.dashboardId, dashboardId))
    .orderBy(asc(dashboardCharts.position));
}

export async function getChartById(chartId: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(dashboardCharts)
    .where(eq(dashboardCharts.id, chartId));
  return row ?? null;
}

export async function addChartToDashboard(input: {
  dashboardId: string;
  title?: string | null;
  description?: string | null;
  sql: string;
  dbIdentifier?: string | null;
  chartConfigJson: string;
  now?: number;
}) {
  const db = getDb();
  const now = input.now ?? Date.now();
  const id = nanoid();
  const [{ value: maxPosition } = { value: -1 }] = await db
    .select({ value: sql<number>`coalesce(max(${dashboardCharts.position}), -1)` })
    .from(dashboardCharts)
    .where(eq(dashboardCharts.dashboardId, input.dashboardId));
  const position = (maxPosition ?? -1) + 1;
  await db.insert(dashboardCharts).values({
    id,
    dashboardId: input.dashboardId,
    title: input.title ?? null,
    description: input.description ?? null,
    sql: input.sql,
    dbIdentifier: input.dbIdentifier ?? null,
    chartConfigJson: input.chartConfigJson,
    position,
    createdAt: now,
    updatedAt: now,
  });
  await db
    .update(dashboards)
    .set({ updatedAt: now })
    .where(eq(dashboards.id, input.dashboardId));
  return { id };
}


export async function updateChartConfig(
  chartId: string,
  chartConfigJson: string,
  now = Date.now(),
) {
  const db = getDb();
  // Fetch chart first to get parent dashboard id
  const chart = await getChartById(chartId);
  if (!chart) return { updated: false };
  await db
    .update(dashboardCharts)
    .set({ chartConfigJson, updatedAt: now })
    .where(eq(dashboardCharts.id, chartId));
  // bump dashboard updatedAt
  await db
    .update(dashboards)
    .set({ updatedAt: now })
    .where(eq(dashboards.id, chart.dashboardId));
  return { updated: true };
}

export async function reorderDashboardCharts(
  dashboardId: string,
  orderedChartIds: string[],
  now = Date.now(),
) {
  const db = getDb();
  await db.transaction(async (trx) => {
    const existing = await trx
      .select({ id: dashboardCharts.id })
      .from(dashboardCharts)
      .where(eq(dashboardCharts.dashboardId, dashboardId));
    const existingIds = new Set(existing.map((row) => row.id));
    const filteredIds = orderedChartIds.filter((id) => existingIds.has(id));
    const uniqueFilteredSize = new Set(filteredIds).size;
    if (filteredIds.length !== existing.length || uniqueFilteredSize !== filteredIds.length) {
      throw new Error("Ordered chart ids do not match dashboard charts");
    }
    for (const [index, chartId] of filteredIds.entries()) {
      await trx
        .update(dashboardCharts)
        .set({ position: index, updatedAt: now })
        .where(
          and(
            eq(dashboardCharts.id, chartId),
            eq(dashboardCharts.dashboardId, dashboardId),
          ),
        );
    }
    await trx
      .update(dashboards)
      .set({ updatedAt: now })
      .where(eq(dashboards.id, dashboardId));
  });
}


