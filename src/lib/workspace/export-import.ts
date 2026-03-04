import {
  clearWorkspaceDb,
  getAllFromStore,
  putMany,
  STORE_CHARTS,
  STORE_CHART_SLICERS,
  STORE_CHATS,
  STORE_DASHBOARDS,
  STORE_DASHBOARD_SLICERS,
  STORE_MESSAGES,
  STORE_PREFERENCES,
  type WorkspaceChart,
  type WorkspaceChartSlicer,
  type WorkspaceChat,
  type WorkspaceDashboard,
  type WorkspaceDashboardSlicer,
  type WorkspaceExportV1,
  type WorkspaceMessage,
  type WorkspacePreference,
} from "@/lib/workspace/workspace-db";

export async function exportWorkspace(): Promise<WorkspaceExportV1> {
  const [
    chats,
    messages,
    dashboards,
    charts,
    dashboardSlicers,
    chartSlicers,
    preferences,
  ] = await Promise.all([
    getAllFromStore<WorkspaceChat>(STORE_CHATS),
    getAllFromStore<WorkspaceMessage>(STORE_MESSAGES),
    getAllFromStore<WorkspaceDashboard>(STORE_DASHBOARDS),
    getAllFromStore<WorkspaceChart>(STORE_CHARTS),
    getAllFromStore<WorkspaceDashboardSlicer>(STORE_DASHBOARD_SLICERS),
    getAllFromStore<WorkspaceChartSlicer>(STORE_CHART_SLICERS),
    getAllFromStore<WorkspacePreference>(STORE_PREFERENCES),
  ]);

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    chats,
    messages,
    dashboards,
    charts,
    dashboardSlicers,
    chartSlicers,
    preferences,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function assertArray<T>(value: unknown, name: string): T[] {
  if (!Array.isArray(value)) {
    throw new Error(`${name} must be an array`);
  }
  return value as T[];
}

export function validateWorkspaceImport(payload: unknown): WorkspaceExportV1 {
  if (!isRecord(payload)) {
    throw new Error("Import payload must be an object");
  }

  if (payload.version !== 1) {
    throw new Error("Unsupported workspace export version");
  }

  return {
    version: 1,
    exportedAt: String(payload.exportedAt ?? ""),
    chats: assertArray<WorkspaceChat>(payload.chats, "chats"),
    messages: assertArray<WorkspaceMessage>(payload.messages, "messages"),
    dashboards: assertArray<WorkspaceDashboard>(payload.dashboards, "dashboards"),
    charts: assertArray<WorkspaceChart>(payload.charts, "charts"),
    dashboardSlicers: assertArray<WorkspaceDashboardSlicer>(
      payload.dashboardSlicers,
      "dashboardSlicers",
    ),
    chartSlicers: assertArray<WorkspaceChartSlicer>(payload.chartSlicers, "chartSlicers"),
    preferences: assertArray<WorkspacePreference>(payload.preferences, "preferences"),
  };
}

export async function importWorkspace(payload: WorkspaceExportV1): Promise<void> {
  await clearWorkspaceDb();

  await Promise.all([
    putMany(STORE_CHATS, payload.chats),
    putMany(STORE_MESSAGES, payload.messages),
    putMany(STORE_DASHBOARDS, payload.dashboards),
    putMany(STORE_CHARTS, payload.charts),
    putMany(STORE_DASHBOARD_SLICERS, payload.dashboardSlicers),
    putMany(STORE_CHART_SLICERS, payload.chartSlicers),
    putMany(STORE_PREFERENCES, payload.preferences),
  ]);
}

export async function resetWorkspace(): Promise<void> {
  await clearWorkspaceDb();
}
