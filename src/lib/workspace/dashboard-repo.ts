import { dashboardStorageService } from "@/lib/dashboard/dashboard-storage-service";
import type { JoinDefinition } from "@/lib/joins/graph";
import type { SqlBackend } from "@/lib/sql/sql-runtime";
import type {
  WorkspaceChart,
  WorkspaceChartSlicer,
  WorkspaceDashboard,
  WorkspaceDashboardMeasure,
  WorkspaceDashboardSlicer,
} from "@/lib/workspace/workspace-db";

export type DbDashboard = WorkspaceDashboard;
export type DbDashboardChart = WorkspaceChart;
export type DbDashboardMeasure = WorkspaceDashboardMeasure;
export type DbDashboardSlicer = WorkspaceDashboardSlicer;
export type DbChartSlicer = WorkspaceChartSlicer;

export const listDashboards = () => dashboardStorageService.listDashboards();

export function createDashboard(
  title: string,
  input?: {
    dbIdentifier?: string | null;
    sqlBackend?: SqlBackend | null;
    now?: number;
  },
) {
  return dashboardStorageService.createDashboard(title, input);
}

export const updateDashboardTitle = (
  dashboardId: string,
  title: string,
  now = Date.now(),
) => dashboardStorageService.updateDashboardTitle(dashboardId, title, now);

export const updateDashboardSettings = (
  dashboardId: string,
  input: {
    columns?: number;
    autoFitRows?: boolean;
    now?: number;
  },
) => dashboardStorageService.updateDashboardSettings(dashboardId, input);

export const getDashboardWithCharts = (dashboardId: string) =>
  dashboardStorageService.getDashboardWithCharts(dashboardId);

export const listChartsByDashboard = (dashboardId: string) =>
  dashboardStorageService.listChartsByDashboard(dashboardId);

export const getChartById = (chartId: string) =>
  dashboardStorageService.getChartById(chartId);

export const listMeasuresByDashboard = (dashboardId: string) =>
  dashboardStorageService.listMeasuresByDashboard(dashboardId);

export const getMeasureById = (measureId: string) =>
  dashboardStorageService.getMeasureById(measureId);

export const createDashboardMeasure = (input: {
  dashboardId: string;
  key: string;
  label: string;
  sql: string;
  dbIdentifier?: string | null;
  sqlBackend?: SqlBackend | null;
  now?: number;
}) => dashboardStorageService.createDashboardMeasure(input);

export const updateDashboardMeasure = (
  measureId: string,
  input: {
    label?: string;
    sql?: string;
    dbIdentifier?: string | null;
    sqlBackend?: SqlBackend | null;
    now?: number;
  },
) => dashboardStorageService.updateDashboardMeasure(measureId, input);

export const addChartToDashboard = (input: {
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
}) => dashboardStorageService.addChartToDashboard(input);

export const updateChartConfig = (
  chartId: string,
  chartConfigJson: string,
  now = Date.now(),
) => dashboardStorageService.updateChartConfig(chartId, chartConfigJson, now);

export const updateChartSql = (
  chartId: string,
  sql: string,
  now = Date.now(),
) => dashboardStorageService.updateChartSql(chartId, sql, now);

export const reorderDashboardCharts = (
  dashboardId: string,
  orderedChartIds: string[],
  now = Date.now(),
) =>
  dashboardStorageService.reorderDashboardCharts(
    dashboardId,
    orderedChartIds,
    now,
  );

export const removeChartFromDashboard = (chartId: string, now = Date.now()) =>
  dashboardStorageService.removeChartFromDashboard(chartId, now);

export const deleteDashboard = (dashboardId: string) =>
  dashboardStorageService.deleteDashboard(dashboardId);

export const listSlicersByDashboard = (dashboardId: string) =>
  dashboardStorageService.listSlicersByDashboard(dashboardId);

export const addSlicerToDashboard = (input: {
  dashboardId: string;
  field: string;
  title?: string | null;
  limit?: number;
  now?: number;
}) => dashboardStorageService.addSlicerToDashboard(input);

export const updateSlicer = (input: {
  slicerId: string;
  title?: string | null;
  limit?: number;
  now?: number;
}) => dashboardStorageService.updateSlicer(input);

export const reorderDashboardSlicers = (
  dashboardId: string,
  orderedSlicerIds: string[],
  now = Date.now(),
) =>
  dashboardStorageService.reorderDashboardSlicers(
    dashboardId,
    orderedSlicerIds,
    now,
  );

export const removeSlicerFromDashboard = (slicerId: string, now = Date.now()) =>
  dashboardStorageService.removeSlicerFromDashboard(slicerId, now);

export const listSlicersByChart = (chartId: string) =>
  dashboardStorageService.listSlicersByChart(chartId);

export const addSlicerToChart = (input: {
  chartId: string;
  field: string;
  title?: string | null;
  limit?: number;
  now?: number;
}) => dashboardStorageService.addSlicerToChart(input);

export const updateChartSlicer = (input: {
  slicerId: string;
  title?: string | null;
  limit?: number;
  now?: number;
}) => dashboardStorageService.updateChartSlicer(input);

export const reorderChartSlicers = (
  chartId: string,
  orderedSlicerIds: string[],
  now = Date.now(),
) =>
  dashboardStorageService.reorderChartSlicers(chartId, orderedSlicerIds, now);

export const removeSlicerFromChart = (slicerId: string, now = Date.now()) =>
  dashboardStorageService.removeSlicerFromChart(slicerId, now);

export const listJoinDefsByDashboard = (dashboardId: string) =>
  dashboardStorageService.listJoinDefsByDashboard(dashboardId);

export type { JoinDefinition };
