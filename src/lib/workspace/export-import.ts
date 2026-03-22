import {
  clearWorkspaceDb,
  getAllFromStore,
  putMany,
  STORE_CHATS,
  STORE_MESSAGES,
  STORE_PREFERENCES,
  type WorkspaceChat,
  type WorkspaceExport,
  type WorkspaceExportV1,
  type WorkspaceExportV2,
  type WorkspaceMessage,
  type WorkspacePreference,
} from "@/lib/workspace/workspace-db";

export async function exportWorkspace(): Promise<WorkspaceExportV2> {
  const [chats, messages, preferences] = await Promise.all([
    getAllFromStore<WorkspaceChat>(STORE_CHATS),
    getAllFromStore<WorkspaceMessage>(STORE_MESSAGES),
    getAllFromStore<WorkspacePreference>(STORE_PREFERENCES),
  ]);

  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    chats,
    messages,
    dashboards: [],
    charts: [],
    dashboardMeasures: [],
    dashboardSlicers: [],
    chartSlicers: [],
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
      dashboards: assertArray(payload.dashboards, "dashboards"),
      charts: assertArray(payload.charts, "charts"),
      dashboardSlicers: assertArray(
        payload.dashboardSlicers,
        "dashboardSlicers",
      ),
      chartSlicers: assertArray(payload.chartSlicers, "chartSlicers"),
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
    dashboards: assertArray(payload.dashboards, "dashboards"),
    charts: assertArray(payload.charts, "charts"),
    dashboardMeasures: assertArray(
      payload.dashboardMeasures,
      "dashboardMeasures",
    ),
    dashboardSlicers: assertArray(payload.dashboardSlicers, "dashboardSlicers"),
    chartSlicers: assertArray(payload.chartSlicers, "chartSlicers"),
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
    putMany(STORE_PREFERENCES, normalizedPayload.preferences),
  ]);
}

export async function resetWorkspace(): Promise<void> {
  await clearWorkspaceDb();
}
