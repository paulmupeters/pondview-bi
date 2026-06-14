import { ensureAnalysisNotebookMigration } from "@/lib/workspace/analysis-notebook-repo";
import {
  clearWorkspaceDb,
  getAllFromStore,
  putMany,
  STORE_ANALYSIS_CELL_ENTRIES,
  STORE_ANALYSIS_CELLS,
  STORE_ANALYSIS_NOTEBOOKS,
  STORE_CHATS,
  STORE_MESSAGES,
  STORE_PREFERENCES,
  type WorkspaceAnalysisCell,
  type WorkspaceAnalysisCellEntry,
  type WorkspaceAnalysisNotebook,
  type WorkspaceChat,
  type WorkspaceExport,
  type WorkspaceExportV1,
  type WorkspaceExportV3,
  type WorkspaceMessage,
  type WorkspacePreference,
} from "@/lib/workspace/workspace-db";

export async function exportWorkspace(): Promise<WorkspaceExportV3> {
  await ensureAnalysisNotebookMigration();

  const [
    chats,
    messages,
    notebooks,
    analysisCells,
    analysisCellEntries,
    preferences,
  ] = await Promise.all([
    getAllFromStore<WorkspaceChat>(STORE_CHATS),
    getAllFromStore<WorkspaceMessage>(STORE_MESSAGES),
    getAllFromStore<WorkspaceAnalysisNotebook>(STORE_ANALYSIS_NOTEBOOKS),
    getAllFromStore<WorkspaceAnalysisCell>(STORE_ANALYSIS_CELLS),
    getAllFromStore<WorkspaceAnalysisCellEntry>(STORE_ANALYSIS_CELL_ENTRIES),
    getAllFromStore<WorkspacePreference>(STORE_PREFERENCES),
  ]);

  return {
    version: 3,
    exportedAt: new Date().toISOString(),
    chats,
    messages,
    notebooks,
    analysisCells,
    analysisCellEntries,
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

export function validateWorkspaceImport(payload: unknown): WorkspaceExportV3 {
  if (!isRecord(payload)) {
    throw new Error("Import payload must be an object");
  }

  if (payload.version !== 1 && payload.version !== 2 && payload.version !== 3) {
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
      version: 3,
      notebooks: [],
      analysisCells: [],
      analysisCellEntries: [],
      dashboardMeasures: [],
    };
  }

  if (payload.version === 2) {
    return {
      version: 3,
      exportedAt: String(payload.exportedAt ?? ""),
      chats: assertArray<WorkspaceChat>(payload.chats, "chats"),
      messages: assertArray<WorkspaceMessage>(payload.messages, "messages"),
      notebooks: [],
      analysisCells: [],
      analysisCellEntries: [],
      dashboards: assertArray(payload.dashboards, "dashboards"),
      charts: assertArray(payload.charts, "charts"),
      dashboardMeasures: assertArray(
        payload.dashboardMeasures,
        "dashboardMeasures",
      ),
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
  }

  return {
    version: 3,
    exportedAt: String(payload.exportedAt ?? ""),
    chats: assertArray<WorkspaceChat>(payload.chats, "chats"),
    messages: assertArray<WorkspaceMessage>(payload.messages, "messages"),
    notebooks: assertArray<WorkspaceAnalysisNotebook>(
      payload.notebooks,
      "notebooks",
    ),
    analysisCells: assertArray<WorkspaceAnalysisCell>(
      payload.analysisCells,
      "analysisCells",
    ),
    analysisCellEntries: assertArray<WorkspaceAnalysisCellEntry>(
      payload.analysisCellEntries,
      "analysisCellEntries",
    ),
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
    payload.version === 1 || payload.version === 2
      ? validateWorkspaceImport(payload)
      : (payload as WorkspaceExportV3);

  await clearWorkspaceDb();

  await Promise.all([
    putMany(STORE_CHATS, normalizedPayload.chats),
    putMany(STORE_MESSAGES, normalizedPayload.messages),
    putMany(STORE_ANALYSIS_NOTEBOOKS, normalizedPayload.notebooks),
    putMany(STORE_ANALYSIS_CELLS, normalizedPayload.analysisCells),
    putMany(STORE_ANALYSIS_CELL_ENTRIES, normalizedPayload.analysisCellEntries),
    putMany(STORE_PREFERENCES, normalizedPayload.preferences),
  ]);

  await ensureAnalysisNotebookMigration();
}

export async function resetWorkspace(): Promise<void> {
  await clearWorkspaceDb();
}
