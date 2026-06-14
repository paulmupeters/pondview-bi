import type { SqlAnalysisData } from "@/components/sql-analysis-display.types";
import type { ChatHistoryEntry } from "@/lib/chat-history";
import { getOpenProject } from "@/lib/project-store";
import { deletePublishedNotebookProjectArtifact } from "@/lib/project-store/project-artifact-sync";
import { getPreference, setPreference } from "@/lib/workspace/preferences-repo";
import {
  deleteByKey,
  getAllFromStore,
  getByKey,
  putMany,
  putOne,
  STORE_ANALYSIS_CELL_ENTRIES,
  STORE_ANALYSIS_CELLS,
  STORE_ANALYSIS_NOTEBOOKS,
  STORE_CHATS,
  STORE_MESSAGES,
  type WorkspaceAnalysisCell,
  type WorkspaceAnalysisCellEntry,
  type WorkspaceAnalysisCellKind,
  type WorkspaceAnalysisCellStatus,
  type WorkspaceAnalysisNotebook,
  type WorkspaceChat,
  type WorkspaceMessage,
} from "@/lib/workspace/workspace-db";

const ANALYSIS_NOTEBOOK_MIGRATION_KEY =
  "workspace:analysis-notebooks:migrated:v1";

type ListRecentAnalysisNotebooksOptions = {
  limit?: number;
  projectId?: string | null;
  projectPaths?: readonly string[];
};
const EXECUTE_SQL_ARTIFACT_TYPE = "data-execute-sql";

type MessagePart = {
  type?: string;
  text?: string;
  data?: unknown;
  output?: unknown;
  result?: unknown;
  error?: unknown;
  errorText?: unknown;
};

type StoredArtifactData = {
  status?: string;
  payload?: SqlAnalysisData;
  createdAt?: number;
  updatedAt?: number;
};

type MutableMigratedCell = {
  row: WorkspaceAnalysisCell;
  nextEntryOrder: number;
};

export type AnalysisNotebookSnapshot = {
  notebook: WorkspaceAnalysisNotebook | null;
  cells: WorkspaceAnalysisCell[];
  cellEntriesByCellId: Map<string, WorkspaceAnalysisCellEntry[]>;
};

function safeJsonParse<T>(value: string | null | undefined): T | undefined {
  if (!value) {
    return undefined;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

function compareByCreatedAt<T extends { createdAt: number }>(
  left: T,
  right: T,
): number {
  return left.createdAt - right.createdAt;
}

function normalizePartsJson(partsJson: string | null, content: string): string {
  if (partsJson?.trim()) {
    return partsJson;
  }

  return JSON.stringify([{ type: "text", text: content }]);
}

function partsFromJson(
  partsJson: string | null | undefined,
  fallbackContent = "",
): MessagePart[] {
  const parsed = safeJsonParse<unknown>(partsJson);

  if (Array.isArray(parsed)) {
    return parsed as MessagePart[];
  }

  if (
    parsed &&
    typeof parsed === "object" &&
    "parts" in parsed &&
    Array.isArray((parsed as { parts?: unknown }).parts)
  ) {
    return (parsed as { parts: MessagePart[] }).parts;
  }

  if (fallbackContent.trim()) {
    return [{ type: "text", text: fallbackContent }];
  }

  return [];
}

function extractTextFromParts(
  partsJson: string | null | undefined,
  fallbackContent = "",
): string {
  const text = partsFromJson(partsJson, fallbackContent)
    .filter(
      (part): part is MessagePart & { type: "text"; text: string } =>
        part.type === "text" && typeof part.text === "string",
    )
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join("\n\n");

  return text || fallbackContent;
}

function artifactFromPart(part: unknown): StoredArtifactData | null {
  if (!part || typeof part !== "object") {
    return null;
  }

  const candidate = part as MessagePart;
  if (candidate.type !== EXECUTE_SQL_ARTIFACT_TYPE) {
    return null;
  }

  if (!candidate.data || typeof candidate.data !== "object") {
    return null;
  }

  const data = candidate.data as StoredArtifactData;
  return {
    status: typeof data.status === "string" ? data.status : undefined,
    payload:
      data.payload && typeof data.payload === "object"
        ? (data.payload as SqlAnalysisData)
        : undefined,
    createdAt: typeof data.createdAt === "number" ? data.createdAt : undefined,
    updatedAt: typeof data.updatedAt === "number" ? data.updatedAt : undefined,
  };
}

function extractArtifactsFromParts(parts: MessagePart[]): StoredArtifactData[] {
  const artifacts: StoredArtifactData[] = [];

  for (const part of parts) {
    const directArtifact = artifactFromPart(part);
    if (directArtifact) {
      artifacts.push(directArtifact);
      continue;
    }

    if (!part.type?.startsWith("tool-")) {
      continue;
    }

    const toolResult =
      part.output && typeof part.output === "object"
        ? part.output
        : part.result && typeof part.result === "object"
          ? part.result
          : null;

    if (!toolResult || !("parts" in toolResult)) {
      continue;
    }

    const nestedParts = (toolResult as { parts?: unknown }).parts;
    if (!Array.isArray(nestedParts)) {
      continue;
    }

    for (const nestedPart of nestedParts) {
      const nestedArtifact = artifactFromPart(nestedPart);
      if (nestedArtifact) {
        artifacts.push(nestedArtifact);
      }
    }
  }

  return artifacts;
}

function getLatestSqlArtifact(
  partsJson: string | null | undefined,
): StoredArtifactData | null {
  const artifacts = extractArtifactsFromParts(partsFromJson(partsJson));
  return artifacts.length > 0
    ? (artifacts[artifacts.length - 1] ?? null)
    : null;
}

function hasToolError(partsJson: string | null | undefined): boolean {
  return partsFromJson(partsJson).some((part) => {
    if (!part.type?.startsWith("tool-")) {
      return false;
    }

    return (
      (typeof part.errorText === "string" &&
        part.errorText.trim().length > 0) ||
      (typeof part.error === "string" && part.error.trim().length > 0)
    );
  });
}

function mapArtifactStatus(
  status: string | undefined,
): WorkspaceAnalysisCellStatus {
  if (status === "complete") {
    return "complete";
  }

  if (status === "error") {
    return "error";
  }

  if (status === "loading" || status === "streaming") {
    return "running";
  }

  return "idle";
}

function createCellRow(input: {
  id: string;
  notebookId: string;
  position: number;
  promptText: string;
  kind?: WorkspaceAnalysisCellKind;
  aiEnabled?: boolean;
  sqlEnabled?: boolean;
  createdAt: number;
}): WorkspaceAnalysisCell {
  const kind = input.kind ?? "ai";
  return {
    id: input.id,
    notebookId: input.notebookId,
    position: input.position,
    kind,
    aiEnabled: input.aiEnabled ?? kind === "ai",
    sqlEnabled: input.sqlEnabled ?? (kind === "sql" || kind === "ai"),
    promptText: input.promptText,
    sqlDraft: null,
    selectedDbIdentifier: null,
    selectedCatalogContext: null,
    status: "idle",
    resultPayloadJson: null,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    lastRunAt: null,
  };
}

function resolveAnalysisCellKind(
  cell: WorkspaceAnalysisCell,
): WorkspaceAnalysisCellKind {
  if (cell.kind === "ai" || cell.kind === "sql" || cell.kind === "text") {
    return cell.kind;
  }

  if (
    (typeof cell.sqlDraft === "string" && cell.sqlDraft.trim().length > 0) ||
    (typeof cell.resultPayloadJson === "string" &&
      cell.resultPayloadJson.trim().length > 0)
  ) {
    return "sql";
  }

  return "ai";
}

function applyAssistantMessageToCell(
  cell: WorkspaceAnalysisCell,
  message: WorkspaceMessage,
): void {
  const partsJson = normalizePartsJson(message.parts, message.content);
  cell.updatedAt = Math.max(cell.updatedAt, message.createdAt);

  const latestArtifact = getLatestSqlArtifact(partsJson);
  if (latestArtifact?.payload) {
    const payload = latestArtifact.payload;
    const artifactTimestamp =
      latestArtifact.updatedAt ?? latestArtifact.createdAt ?? message.createdAt;

    if (typeof payload.query === "string" && payload.query.trim()) {
      cell.sqlDraft = payload.query;
    }

    if (
      typeof payload.dbIdentifier === "string" &&
      payload.dbIdentifier.trim()
    ) {
      cell.selectedDbIdentifier = payload.dbIdentifier;
    }

    if (
      payload.catalogContext === null ||
      typeof payload.catalogContext === "string"
    ) {
      cell.selectedCatalogContext = payload.catalogContext ?? null;
    }

    cell.resultPayloadJson = JSON.stringify(payload);
    cell.kind = "sql";
    cell.status =
      payload.stage === "complete"
        ? "complete"
        : mapArtifactStatus(latestArtifact.status);
    cell.lastRunAt = artifactTimestamp;
    cell.updatedAt = Math.max(cell.updatedAt, artifactTimestamp);
    return;
  }

  if (hasToolError(partsJson)) {
    cell.status = "error";
  }
}

function sortCells(rows: WorkspaceAnalysisCell[]): WorkspaceAnalysisCell[] {
  return [...rows].sort((left, right) => {
    if (left.position !== right.position) {
      return left.position - right.position;
    }

    return compareByCreatedAt(left, right);
  });
}

function sortEntries(
  rows: WorkspaceAnalysisCellEntry[],
): WorkspaceAnalysisCellEntry[] {
  return [...rows].sort((left, right) => {
    if (left.order !== right.order) {
      return left.order - right.order;
    }

    return compareByCreatedAt(left, right);
  });
}

function normalizeOptionalString(
  value: string | null | undefined,
): string | null {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized.length > 0 ? normalized : null;
}

function normalizeProjectPath(path: string | null | undefined): string | null {
  const normalized = normalizeOptionalString(path)?.replace(/\\/g, "/") ?? null;
  return normalized ? normalized.replace(/\/+$/, "") : null;
}

function resolveListRecentOptions(
  optionsOrLimit: ListRecentAnalysisNotebooksOptions | number,
): Required<ListRecentAnalysisNotebooksOptions> {
  if (typeof optionsOrLimit === "number") {
    return {
      limit: optionsOrLimit,
      projectId: null,
      projectPaths: [],
    };
  }

  return {
    limit: optionsOrLimit.limit ?? 12,
    projectId: optionsOrLimit.projectId ?? null,
    projectPaths: optionsOrLimit.projectPaths ?? [],
  };
}

export function migrateLegacyChatsToNotebooks(input: {
  chats: WorkspaceChat[];
  messages: WorkspaceMessage[];
}): {
  notebooks: WorkspaceAnalysisNotebook[];
  analysisCells: WorkspaceAnalysisCell[];
  analysisCellEntries: WorkspaceAnalysisCellEntry[];
} {
  const notebooks: WorkspaceAnalysisNotebook[] = [];
  const analysisCells: WorkspaceAnalysisCell[] = [];
  const analysisCellEntries: WorkspaceAnalysisCellEntry[] = [];
  const messagesByChatId = new Map<string, WorkspaceMessage[]>();

  for (const message of input.messages) {
    const existing = messagesByChatId.get(message.chatId);
    if (existing) {
      existing.push(message);
    } else {
      messagesByChatId.set(message.chatId, [message]);
    }
  }

  const chats = [...input.chats].sort(compareByCreatedAt);

  for (const chat of chats) {
    notebooks.push({
      id: chat.id,
      title: chat.title,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
    });

    const chatMessages = [...(messagesByChatId.get(chat.id) ?? [])].sort(
      compareByCreatedAt,
    );
    let currentCell: MutableMigratedCell | null = null;
    let nextCellPosition = 0;

    for (const message of chatMessages) {
      if (message.role === "user") {
        currentCell = {
          row: createCellRow({
            id: message.id,
            notebookId: chat.id,
            position: nextCellPosition,
            promptText: extractTextFromParts(message.parts, message.content),
            createdAt: message.createdAt,
          }),
          nextEntryOrder: 0,
        };
        analysisCells.push(currentCell.row);
        nextCellPosition += 1;
        continue;
      }

      if (!currentCell) {
        currentCell = {
          row: createCellRow({
            id: `${chat.id}::cell:${nextCellPosition}`,
            notebookId: chat.id,
            position: nextCellPosition,
            promptText: "",
            createdAt: message.createdAt,
          }),
          nextEntryOrder: 0,
        };
        analysisCells.push(currentCell.row);
        nextCellPosition += 1;
      }

      const partsJson = normalizePartsJson(message.parts, message.content);

      analysisCellEntries.push({
        id: message.id,
        notebookId: chat.id,
        cellId: currentCell.row.id,
        order: currentCell.nextEntryOrder,
        role: message.role,
        partsJson,
        createdAt: message.createdAt,
      });
      currentCell.nextEntryOrder += 1;

      applyAssistantMessageToCell(currentCell.row, message);
    }
  }

  return {
    notebooks,
    analysisCells,
    analysisCellEntries,
  };
}

export async function ensureAnalysisNotebookMigration(): Promise<void> {
  const alreadyMigrated = await getPreference<boolean>(
    ANALYSIS_NOTEBOOK_MIGRATION_KEY,
  );
  if (alreadyMigrated) {
    return;
  }

  const [existingNotebooks, existingCells, existingEntries] = await Promise.all(
    [
      getAllFromStore<WorkspaceAnalysisNotebook>(STORE_ANALYSIS_NOTEBOOKS),
      getAllFromStore<WorkspaceAnalysisCell>(STORE_ANALYSIS_CELLS),
      getAllFromStore<WorkspaceAnalysisCellEntry>(STORE_ANALYSIS_CELL_ENTRIES),
    ],
  );

  if (
    existingNotebooks.length > 0 ||
    existingCells.length > 0 ||
    existingEntries.length > 0
  ) {
    await setPreference(ANALYSIS_NOTEBOOK_MIGRATION_KEY, true);
    return;
  }

  const [legacyChats, legacyMessages] = await Promise.all([
    getAllFromStore<WorkspaceChat>(STORE_CHATS),
    getAllFromStore<WorkspaceMessage>(STORE_MESSAGES),
  ]);

  if (legacyChats.length === 0 && legacyMessages.length === 0) {
    await setPreference(ANALYSIS_NOTEBOOK_MIGRATION_KEY, true);
    return;
  }

  const migrated = migrateLegacyChatsToNotebooks({
    chats: legacyChats,
    messages: legacyMessages,
  });

  await Promise.all([
    putMany(STORE_ANALYSIS_NOTEBOOKS, migrated.notebooks),
    putMany(STORE_ANALYSIS_CELLS, migrated.analysisCells),
    putMany(STORE_ANALYSIS_CELL_ENTRIES, migrated.analysisCellEntries),
  ]);

  await setPreference(ANALYSIS_NOTEBOOK_MIGRATION_KEY, true);
}

export async function listRecentAnalysisNotebooks(
  optionsOrLimit: ListRecentAnalysisNotebooksOptions | number = {},
): Promise<ChatHistoryEntry[]> {
  await ensureAnalysisNotebookMigration();
  const options = resolveListRecentOptions(optionsOrLimit);
  const projectPaths = new Set(
    options.projectPaths
      .map((path) => normalizeProjectPath(path))
      .filter((path): path is string => path !== null),
  );
  const projectId = normalizeOptionalString(options.projectId);
  const hasProjectScope = Boolean(projectId) || projectPaths.size > 0;
  const notebooks = await getAllFromStore<WorkspaceAnalysisNotebook>(
    STORE_ANALYSIS_NOTEBOOKS,
  );
  return notebooks
    .filter((notebook) => {
      if (!hasProjectScope) {
        return true;
      }

      if (
        projectId &&
        normalizeOptionalString(notebook.projectId) === projectId
      ) {
        return true;
      }

      const projectPath = normalizeProjectPath(notebook.projectPath);
      return projectPath ? projectPaths.has(projectPath) : false;
    })
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, Math.max(0, options.limit))
    .map((item) => ({
      id: item.id,
      title: item.title,
      updatedAt: item.updatedAt,
    }));
}

export async function listAnalysisNotebooks(): Promise<
  WorkspaceAnalysisNotebook[]
> {
  await ensureAnalysisNotebookMigration();
  return getAllFromStore<WorkspaceAnalysisNotebook>(STORE_ANALYSIS_NOTEBOOKS);
}

export async function getAnalysisNotebookById(
  notebookId: string,
): Promise<WorkspaceAnalysisNotebook | null> {
  await ensureAnalysisNotebookMigration();
  const notebook = await getByKey<WorkspaceAnalysisNotebook>(
    STORE_ANALYSIS_NOTEBOOKS,
    notebookId,
  );
  return notebook ?? null;
}

export async function listAnalysisCellsByNotebookId(
  notebookId: string,
): Promise<WorkspaceAnalysisCell[]> {
  await ensureAnalysisNotebookMigration();
  const cells =
    await getAllFromStore<WorkspaceAnalysisCell>(STORE_ANALYSIS_CELLS);
  return sortCells(cells.filter((cell) => cell.notebookId === notebookId));
}

export async function listAnalysisCellEntriesByNotebookId(
  notebookId: string,
): Promise<WorkspaceAnalysisCellEntry[]> {
  await ensureAnalysisNotebookMigration();
  const entries = await getAllFromStore<WorkspaceAnalysisCellEntry>(
    STORE_ANALYSIS_CELL_ENTRIES,
  );
  return sortEntries(
    entries.filter((entry) => entry.notebookId === notebookId),
  );
}

export async function listAnalysisCellEntriesByCellId(
  cellId: string,
): Promise<WorkspaceAnalysisCellEntry[]> {
  await ensureAnalysisNotebookMigration();
  const entries = await getAllFromStore<WorkspaceAnalysisCellEntry>(
    STORE_ANALYSIS_CELL_ENTRIES,
  );
  return sortEntries(entries.filter((entry) => entry.cellId === cellId));
}

export async function getAnalysisNotebookSnapshot(
  notebookId: string,
): Promise<AnalysisNotebookSnapshot> {
  const [notebook, rawCells, rawEntries] = await Promise.all([
    getAnalysisNotebookById(notebookId),
    listAnalysisCellsByNotebookId(notebookId),
    listAnalysisCellEntriesByNotebookId(notebookId),
  ]);
  const cells = sortCells(
    Array.from(new Map(rawCells.map((cell) => [cell.id, cell])).values()).map(
      (cell) => ({
        ...cell,
        kind: resolveAnalysisCellKind(cell),
      }),
    ),
  );
  const entries = sortEntries(
    Array.from(new Map(rawEntries.map((entry) => [entry.id, entry])).values()),
  );

  const cellEntriesByCellId = new Map<string, WorkspaceAnalysisCellEntry[]>();
  for (const entry of entries) {
    const existing = cellEntriesByCellId.get(entry.cellId);
    if (existing) {
      existing.push(entry);
    } else {
      cellEntriesByCellId.set(entry.cellId, [entry]);
    }
  }

  return {
    notebook,
    cells,
    cellEntriesByCellId,
  };
}

export async function upsertAnalysisNotebook(
  notebook: WorkspaceAnalysisNotebook,
): Promise<void> {
  await ensureAnalysisNotebookMigration();
  await putOne(STORE_ANALYSIS_NOTEBOOKS, {
    ...notebook,
    projectId:
      typeof notebook.projectId === "string" ? notebook.projectId : null,
    projectPath:
      typeof notebook.projectPath === "string" ? notebook.projectPath : null,
  });
}

export async function upsertAnalysisCell(
  cell: WorkspaceAnalysisCell,
): Promise<void> {
  await ensureAnalysisNotebookMigration();
  await putOne(STORE_ANALYSIS_CELLS, cell);
}

export async function putAnalysisCellEntries(
  entries: WorkspaceAnalysisCellEntry[],
): Promise<void> {
  await ensureAnalysisNotebookMigration();
  await putMany(STORE_ANALYSIS_CELL_ENTRIES, entries);
}

export async function ensureAnalysisNotebook(
  notebookId: string,
  title: string | null = null,
  now = Date.now(),
): Promise<void> {
  await ensureAnalysisNotebookMigration();
  const existing = await getByKey<WorkspaceAnalysisNotebook>(
    STORE_ANALYSIS_NOTEBOOKS,
    notebookId,
  );
  if (existing) {
    return;
  }
  const project = await getOpenProject();
  await putOne(STORE_ANALYSIS_NOTEBOOKS, {
    id: notebookId,
    title,
    projectId: project?.id ?? null,
    projectPath: null,
    createdAt: now,
    updatedAt: now,
  });
}

export async function updateAnalysisNotebookTitle(
  notebookId: string,
  title: string | null,
  now = Date.now(),
): Promise<void> {
  await ensureAnalysisNotebookMigration();
  const normalizedTitle = title?.trim() ? title.trim() : null;
  const existing = await getByKey<WorkspaceAnalysisNotebook>(
    STORE_ANALYSIS_NOTEBOOKS,
    notebookId,
  );
  if (!existing) {
    await ensureAnalysisNotebook(notebookId, normalizedTitle, now);
    return;
  }
  await putOne(STORE_ANALYSIS_NOTEBOOKS, {
    ...existing,
    title: normalizedTitle,
    projectId:
      typeof existing.projectId === "string" ? existing.projectId : null,
    projectPath:
      typeof existing.projectPath === "string" ? existing.projectPath : null,
    updatedAt: now,
  });
}

export async function touchAnalysisNotebookUpdatedAt(
  notebookId: string,
  now = Date.now(),
): Promise<void> {
  await ensureAnalysisNotebookMigration();
  const existing = await getByKey<WorkspaceAnalysisNotebook>(
    STORE_ANALYSIS_NOTEBOOKS,
    notebookId,
  );
  if (!existing) {
    return;
  }
  await putOne(STORE_ANALYSIS_NOTEBOOKS, {
    ...existing,
    updatedAt: now,
  });
}

export async function deleteAnalysisCellsByNotebookId(
  notebookId: string,
): Promise<void> {
  const allCells =
    await getAllFromStore<WorkspaceAnalysisCell>(STORE_ANALYSIS_CELLS);
  const allEntries = await getAllFromStore<WorkspaceAnalysisCellEntry>(
    STORE_ANALYSIS_CELL_ENTRIES,
  );
  const notebookEntries = allEntries.filter(
    (entry) => entry.notebookId === notebookId,
  );
  const notebookCells = allCells.filter(
    (cell) => cell.notebookId === notebookId,
  );
  for (const entry of notebookEntries) {
    await deleteByKey(STORE_ANALYSIS_CELL_ENTRIES, entry.id);
  }
  for (const cell of notebookCells) {
    await deleteByKey(STORE_ANALYSIS_CELLS, cell.id);
  }
}

export async function deleteAnalysisCell(cellId: string): Promise<void> {
  const allEntries = await getAllFromStore<WorkspaceAnalysisCellEntry>(
    STORE_ANALYSIS_CELL_ENTRIES,
  );
  const cellEntries = allEntries.filter((entry) => entry.cellId === cellId);
  for (const entry of cellEntries) {
    await deleteByKey(STORE_ANALYSIS_CELL_ENTRIES, entry.id);
  }
  await deleteByKey(STORE_ANALYSIS_CELLS, cellId);
}

export async function deleteAnalysisCellEntry(entryId: string): Promise<void> {
  await deleteByKey(STORE_ANALYSIS_CELL_ENTRIES, entryId);
}

export async function deleteAnalysisNotebook(
  notebookId: string,
): Promise<void> {
  const existing = await getByKey<WorkspaceAnalysisNotebook>(
    STORE_ANALYSIS_NOTEBOOKS,
    notebookId,
  );
  const existingProjectPath = normalizeProjectPath(existing?.projectPath);
  const hasSharedProjectPath = existingProjectPath
    ? (
        await getAllFromStore<WorkspaceAnalysisNotebook>(
          STORE_ANALYSIS_NOTEBOOKS,
        )
      ).some(
        (notebook) =>
          notebook.id !== notebookId &&
          normalizeProjectPath(notebook.projectPath) === existingProjectPath,
      )
    : false;

  await deleteAnalysisCellsByNotebookId(notebookId);
  await deleteByKey(STORE_ANALYSIS_NOTEBOOKS, notebookId);
  if (existing && !hasSharedProjectPath) {
    await deletePublishedNotebookProjectArtifact({
      notebookId,
      title: existing.title,
      projectPath: existing.projectPath ?? null,
    });
  }
}
