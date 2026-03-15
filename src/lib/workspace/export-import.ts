import {
  clearWorkspaceDb,
  getAllFromStore,
  putMany,
  STORE_CHART_SLICERS,
  STORE_CHARTS,
  STORE_CHATS,
  STORE_DASHBOARD_MEASURES,
  STORE_DASHBOARD_SLICERS,
  STORE_DASHBOARDS,
  STORE_MESSAGES,
  STORE_PREFERENCES,
  type WorkspaceChart,
  type WorkspaceChartSlicer,
  type WorkspaceChat,
  type WorkspaceDashboard,
  type WorkspaceDashboardMeasure,
  type WorkspaceDashboardSlicer,
  type WorkspaceExport,
  type WorkspaceExportV1,
  type WorkspaceExportV2,
  type WorkspaceMessage,
  type WorkspacePreference,
} from "@/lib/workspace/workspace-db";

export async function exportWorkspace(): Promise<WorkspaceExportV2> {
  const [
    chats,
    messages,
    dashboards,
    charts,
    dashboardMeasures,
    dashboardSlicers,
    chartSlicers,
    preferences,
  ] = await Promise.all([
    getAllFromStore<WorkspaceChat>(STORE_CHATS),
    getAllFromStore<WorkspaceMessage>(STORE_MESSAGES),
    getAllFromStore<WorkspaceDashboard>(STORE_DASHBOARDS),
    getAllFromStore<WorkspaceChart>(STORE_CHARTS),
    getAllFromStore<WorkspaceDashboardMeasure>(STORE_DASHBOARD_MEASURES),
    getAllFromStore<WorkspaceDashboardSlicer>(STORE_DASHBOARD_SLICERS),
    getAllFromStore<WorkspaceChartSlicer>(STORE_CHART_SLICERS),
    getAllFromStore<WorkspacePreference>(STORE_PREFERENCES),
  ]);

  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    chats,
    messages,
    dashboards,
    charts,
    dashboardMeasures,
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

export function validateWorkspaceImport(payload: unknown): WorkspaceExportV2 {
  if (!isRecord(payload)) {
    throw new Error("Import payload must be an object");
  }

  if (payload.version !== 1 && payload.version !== 2) {
    throw new Error("Unsupported workspace export version");
  }

  if (payload.version === 1) {
    const normalizedV1: WorkspaceExportV1 = {
      version: 1,
      exportedAt: String(payload.exportedAt ?? ""),
      chats: assertArray<WorkspaceChat>(payload.chats, "chats"),
      messages: assertArray<WorkspaceMessage>(payload.messages, "messages"),
      dashboards: assertArray<WorkspaceDashboard>(
        payload.dashboards,
        "dashboards",
      ),
      charts: assertArray<WorkspaceChart>(payload.charts, "charts"),
      dashboardSlicers: assertArray<WorkspaceDashboardSlicer>(
        payload.dashboardSlicers,
        "dashboardSlicers",
      ),
      chartSlicers: assertArray<WorkspaceChartSlicer>(
        payload.chartSlicers,
        "chartSlicers",
      ),
      preferences: assertArray<WorkspacePreference>(
        payload.preferences,
        "preferences",
      ),
    };

    return {
      ...normalizedV1,
      version: 2,
      dashboardMeasures: [],
    };
  }

  return {
    version: 2,
    exportedAt: String(payload.exportedAt ?? ""),
    chats: assertArray<WorkspaceChat>(payload.chats, "chats"),
    messages: assertArray<WorkspaceMessage>(payload.messages, "messages"),
    dashboards: assertArray<WorkspaceDashboard>(
      payload.dashboards,
      "dashboards",
    ),
    charts: assertArray<WorkspaceChart>(payload.charts, "charts"),
    dashboardMeasures: assertArray<WorkspaceDashboardMeasure>(
      payload.dashboardMeasures,
      "dashboardMeasures",
    ),
    dashboardSlicers: assertArray<WorkspaceDashboardSlicer>(
      payload.dashboardSlicers,
      "dashboardSlicers",
    ),
    chartSlicers: assertArray<WorkspaceChartSlicer>(
      payload.chartSlicers,
      "chartSlicers",
    ),
    preferences: assertArray<WorkspacePreference>(
      payload.preferences,
      "preferences",
    ),
  };
}

export async function importWorkspace(payload: WorkspaceExport): Promise<void> {
  const normalizedPayload =
    payload.version === 1
      ? validateWorkspaceImport(payload)
      : (payload as WorkspaceExportV2);

  await clearWorkspaceDb();

  await Promise.all([
    putMany(STORE_CHATS, normalizedPayload.chats),
    putMany(STORE_MESSAGES, normalizedPayload.messages),
    putMany(STORE_DASHBOARDS, normalizedPayload.dashboards),
    putMany(STORE_CHARTS, normalizedPayload.charts),
    putMany(STORE_DASHBOARD_MEASURES, normalizedPayload.dashboardMeasures),
    putMany(STORE_DASHBOARD_SLICERS, normalizedPayload.dashboardSlicers),
    putMany(STORE_CHART_SLICERS, normalizedPayload.chartSlicers),
    putMany(STORE_PREFERENCES, normalizedPayload.preferences),
  ]);
}

export async function resetWorkspace(): Promise<void> {
  await clearWorkspaceDb();
}
