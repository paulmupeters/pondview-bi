import type { UIMessage } from "@ai-sdk/react";
import { extractSqlArtifactParts } from "@/components/chat/sql-artifact-utils";
import type { SqlAnalysisData } from "@/components/sql-analysis-display.types";
import type { Result } from "@/lib/types";

const EXECUTE_SQL_ARTIFACT_TYPE = "data-execute-sql";
const EXPLORATORY_SQL_TOOL_TYPE = "tool-execute_exploratory_sql";
const SET_NOTEBOOK_TITLE_TOOL_TYPE = "tool-set_notebook_title";
const FINAL_SQL_TOOL_TYPES = new Set([
  "tool-execute_final_sql",
  "tool-execute_sql",
]);

export type TranscriptMessageBlock =
  | {
      key: string;
      kind: "text";
      text: string;
    }
  | {
      key: string;
      kind: "tool-call";
      toolName: string;
      summaryText: string | null;
      errorText: string | null;
      sql: string | null;
      rawOutputJson: string | null;
    }
  | {
      key: string;
      kind: "sql-result";
      data: SqlAnalysisData;
    };

function hasToolError(message: UIMessage): boolean {
  return (message.parts ?? []).some((part) => {
    if (!part.type.startsWith("tool-")) {
      return false;
    }

    return (
      ("errorText" in part &&
        typeof part.errorText === "string" &&
        part.errorText.trim().length > 0) ||
      ("error" in part &&
        typeof part.error === "string" &&
        part.error.trim().length > 0)
    );
  });
}

function mapArtifactStatusToCellStatus(
  status: string | undefined,
): "idle" | "running" | "complete" | "error" {
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

function resolveSqlArtifactCellStatus(artifact: {
  status?: string;
  payload?: SqlAnalysisData;
}): "idle" | "running" | "complete" | "error" {
  if (artifact.payload?.stage === "complete") {
    return "complete";
  }

  return mapArtifactStatusToCellStatus(artifact.status);
}

function extractToolOutput(part: UIMessage["parts"][number]): unknown {
  if (!("output" in part) && !("result" in part)) {
    return undefined;
  }

  return "output" in part && typeof part.output !== "undefined"
    ? part.output
    : "result" in part
      ? part.result
      : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}

function extractToolErrorText(part: UIMessage["parts"][number]): string | null {
  if ("errorText" in part && typeof part.errorText === "string") {
    const trimmedError = part.errorText.trim();
    if (trimmedError.length > 0) {
      return trimmedError;
    }
  }

  if ("error" in part && typeof part.error === "string") {
    const trimmedError = part.error.trim();
    if (trimmedError.length > 0) {
      return trimmedError;
    }
  }

  return null;
}

function extractToolSummaryText(output: unknown): string | null {
  if (typeof output === "string") {
    const trimmedOutput = output.trim();
    return trimmedOutput.length > 0 ? trimmedOutput : null;
  }

  if (!isRecord(output) || typeof output.text !== "string") {
    return null;
  }

  const trimmedText = output.text.trim();
  return trimmedText.length > 0 ? trimmedText : null;
}

function extractToolSql(
  part: UIMessage["parts"][number],
  output: unknown,
): string | null {
  if (
    "input" in part &&
    isRecord(part.input) &&
    typeof part.input.sql === "string"
  ) {
    const trimmedSql = part.input.sql.trim();
    if (trimmedSql.length > 0) {
      return trimmedSql;
    }
  }

  if (!isRecord(output) || typeof output.sql !== "string") {
    return null;
  }

  const trimmedSql = output.sql.trim();
  return trimmedSql.length > 0 ? trimmedSql : null;
}

function buildExploratorySqlResult(output: unknown): SqlAnalysisData | null {
  if (!isRecord(output) || typeof output.sql !== "string") {
    return null;
  }

  const sql = output.sql.trim();
  if (!sql) {
    return null;
  }

  const columns = Array.isArray(output.columns)
    ? output.columns.filter(
        (column): column is { name: string; type?: string } => {
          return (
            isRecord(column) &&
            typeof column.name === "string" &&
            (!("type" in column) || typeof column.type === "string")
          );
        },
      )
    : [];
  const rows = Array.isArray(output.rows)
    ? output.rows.filter((row): row is Result => {
        if (!isRecord(row)) {
          return false;
        }

        return Object.values(row).every((value) => {
          return (
            typeof value === "string" ||
            typeof value === "number" ||
            typeof value === "boolean" ||
            value instanceof Date
          );
        });
      })
    : [];
  const rowCount =
    typeof output.rowCount === "number" ? output.rowCount : rows.length;
  const summary = isRecord(output.summary) ? output.summary : null;

  return {
    stage: "complete",
    progress: 1,
    query: sql,
    dbIdentifier:
      typeof output.dbIdentifier === "string" ? output.dbIdentifier : undefined,
    sqlBackend:
      typeof output.sqlBackend === "string"
        ? (output.sqlBackend as SqlAnalysisData["sqlBackend"])
        : undefined,
    rowCount,
    columns,
    rows,
    visualType: "table",
    summary: {
      totalRows: rowCount,
      executionTimeMs:
        typeof summary?.executionTimeMs === "number"
          ? summary.executionTimeMs
          : undefined,
      queryType:
        typeof summary?.queryType === "string" ? summary.queryType : undefined,
      insights:
        typeof output.text === "string" && output.text.trim().length > 0
          ? [output.text.trim()]
          : [],
    },
  };
}

function stringifyTranscriptOutput(output: unknown): string | null {
  if (typeof output === "undefined") {
    return null;
  }

  try {
    return JSON.stringify(output, null, 2);
  } catch {
    return null;
  }
}

export function buildTranscriptMessageBlocks(
  message: UIMessage,
  options: {
    showToolCalls: boolean;
    showExecuteSqlRawOutput: boolean;
  },
): TranscriptMessageBlock[] {
  const blocks: TranscriptMessageBlock[] = [];

  (message.parts ?? []).forEach((part, partIndex) => {
    if (part.type === "text" && typeof part.text === "string") {
      const trimmedText = part.text.trim();
      if (trimmedText.length > 0) {
        blocks.push({
          key: `${message.id}-text-${partIndex}`,
          kind: "text",
          text: trimmedText,
        });
      }
      return;
    }

    if (!part.type.startsWith("tool-")) {
      return;
    }

    if (part.type === SET_NOTEBOOK_TITLE_TOOL_TYPE) {
      return;
    }

    const output = extractToolOutput(part);
    const toolName = part.type.slice("tool-".length);

    if (options.showToolCalls) {
      blocks.push({
        key: `${message.id}-tool-${partIndex}`,
        kind: "tool-call",
        toolName,
        summaryText: extractToolSummaryText(output),
        errorText: extractToolErrorText(part),
        sql: extractToolSql(part, output),
        rawOutputJson:
          options.showExecuteSqlRawOutput &&
          (FINAL_SQL_TOOL_TYPES.has(part.type) ||
            part.type === EXPLORATORY_SQL_TOOL_TYPE)
            ? stringifyTranscriptOutput(output)
            : null,
      });
    }

    if (FINAL_SQL_TOOL_TYPES.has(part.type)) {
      extractSqlArtifactParts([part], EXECUTE_SQL_ARTIFACT_TYPE).forEach(
        (artifactPart, artifactIndex) => {
          if (!artifactPart.artifactData.payload) {
            return;
          }

          blocks.push({
            key: `${message.id}-sql-result-${partIndex}-${artifactIndex}`,
            kind: "sql-result",
            data: artifactPart.artifactData.payload,
          });
        },
      );
      return;
    }

    if (part.type !== EXPLORATORY_SQL_TOOL_TYPE) {
      return;
    }

    const exploratoryResult = buildExploratorySqlResult(output);
    if (!exploratoryResult) {
      return;
    }

    blocks.push({
      key: `${message.id}-sql-preview-${partIndex}`,
      kind: "sql-result",
      data: exploratoryResult,
    });
  });

  return blocks;
}

function extractLatestExploratoryDraft(parts: UIMessage["parts"] | undefined): {
  sql: string;
  dbIdentifier?: string;
  catalogContext?: string | null;
} | null {
  if (!parts?.length) {
    return null;
  }

  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index];
    if (part.type !== EXPLORATORY_SQL_TOOL_TYPE) {
      continue;
    }

    const output = extractToolOutput(part);
    if (!output || typeof output !== "object") {
      continue;
    }

    const candidate = output as {
      sql?: unknown;
      dbIdentifier?: unknown;
      catalogContext?: unknown;
    };

    if (typeof candidate.sql !== "string" || !candidate.sql.trim()) {
      continue;
    }

    return {
      sql: candidate.sql,
      dbIdentifier:
        typeof candidate.dbIdentifier === "string"
          ? candidate.dbIdentifier
          : undefined,
      catalogContext:
        typeof candidate.catalogContext === "string" ||
        candidate.catalogContext === null
          ? candidate.catalogContext
          : undefined,
    };
  }

  return null;
}

export function buildAiCellPrompt(params: {
  prompt: string;
  sqlDraft?: string | null;
  selectedDbIdentifier?: string | null;
  selectedCatalogContext?: string | null;
  resultPayload?: SqlAnalysisData | null;
  shouldGenerateNotebookTitle?: boolean;
}): string {
  const {
    prompt,
    sqlDraft,
    selectedDbIdentifier,
    selectedCatalogContext,
    resultPayload,
    shouldGenerateNotebookTitle = false,
  } = params;

  const trimmedPrompt = prompt.trim();
  if (!trimmedPrompt) {
    return "";
  }

  const contextLines: string[] = [];

  if (shouldGenerateNotebookTitle) {
    contextLines.push(
      "This is the first prompt in a new notebook. Before doing the analysis, call set_notebook_title with a concise 3-6 word title for this notebook.",
    );
  }

  if (selectedDbIdentifier) {
    contextLines.push(`Selected database: ${selectedDbIdentifier}`);
  }

  if (selectedCatalogContext) {
    contextLines.push(`Selected catalog: ${selectedCatalogContext}`);
  }

  if (sqlDraft?.trim()) {
    contextLines.push("Current cell SQL:");
    contextLines.push("```sql");
    contextLines.push(sqlDraft.trim());
    contextLines.push("```");
  }

  if (resultPayload?.visualType) {
    contextLines.push(
      `Current visualization type: ${resultPayload.visualType}`,
    );
  }

  if (typeof resultPayload?.rowCount === "number") {
    contextLines.push(`Current row count: ${resultPayload.rowCount}`);
  }

  if (contextLines.length === 0) {
    return trimmedPrompt;
  }

  return [
    "Use the current notebook cell context below when responding.",
    ...contextLines,
    "",
    `User request: ${trimmedPrompt}`,
  ].join("\n");
}

export function buildAiCellUpdatePatch(params: {
  message: UIMessage;
  createdAt: number;
  selectedDbIdentifier?: string | null;
  selectedCatalogContext?: string | null;
}): {
  status: "idle" | "running" | "complete" | "error";
  sqlDraft?: string | null;
  resultPayloadJson?: string | null;
  lastRunAt?: number | null;
  selectedDbIdentifier?: string | null;
  selectedCatalogContext?: string | null;
} {
  const {
    message,
    createdAt,
    selectedDbIdentifier = null,
    selectedCatalogContext = null,
  } = params;
  const latestArtifact = extractSqlArtifactParts(
    message.parts,
    EXECUTE_SQL_ARTIFACT_TYPE,
  ).at(-1)?.artifactData;
  const latestExploratoryDraft = extractLatestExploratoryDraft(message.parts);

  const patch: {
    status: "idle" | "running" | "complete" | "error";
    sqlDraft?: string | null;
    resultPayloadJson?: string | null;
    lastRunAt?: number | null;
    selectedDbIdentifier?: string | null;
    selectedCatalogContext?: string | null;
  } = {
    status: hasToolError(message)
      ? "error"
      : latestArtifact
        ? resolveSqlArtifactCellStatus(latestArtifact)
        : "idle",
  };

  if (latestArtifact?.payload) {
    patch.sqlDraft = latestArtifact.payload.query || null;
    patch.resultPayloadJson = JSON.stringify(latestArtifact.payload);
    patch.lastRunAt = createdAt;
    patch.selectedDbIdentifier =
      latestArtifact.payload.dbIdentifier ?? selectedDbIdentifier;
    patch.selectedCatalogContext =
      latestArtifact.payload.catalogContext ?? selectedCatalogContext;
    return patch;
  }

  if (latestExploratoryDraft) {
    patch.sqlDraft = latestExploratoryDraft.sql;
    patch.selectedDbIdentifier =
      latestExploratoryDraft.dbIdentifier ?? selectedDbIdentifier;
    patch.selectedCatalogContext =
      latestExploratoryDraft.catalogContext ?? selectedCatalogContext;
  }

  return patch;
}

export function getLatestAssistantText(messages: UIMessage[]): string | null {
  for (
    let messageIndex = messages.length - 1;
    messageIndex >= 0;
    messageIndex -= 1
  ) {
    const message = messages[messageIndex];
    if (message.role !== "assistant") {
      continue;
    }

    const textPart = [...(message.parts ?? [])].reverse().find(
      (
        part,
      ): part is UIMessage["parts"][number] & {
        type: "text";
        text: string;
      } =>
        part.type === "text" &&
        typeof part.text === "string" &&
        part.text.trim().length > 0,
    );

    if (textPart) {
      return textPart.text;
    }
  }

  return null;
}

export function extractNotebookTitleFromMessage(
  message: UIMessage,
): string | null {
  for (const part of message.parts ?? []) {
    if (part.type !== SET_NOTEBOOK_TITLE_TOOL_TYPE) {
      continue;
    }

    const output = extractToolOutput(part);
    if (!isRecord(output) || typeof output.title !== "string") {
      continue;
    }

    const title = output.title.trim().replace(/\s+/g, " ");
    if (title.length > 0) {
      return title;
    }
  }

  return null;
}

export function getLatestUserText(messages: UIMessage[]): string | null {
  for (
    let messageIndex = messages.length - 1;
    messageIndex >= 0;
    messageIndex -= 1
  ) {
    const message = messages[messageIndex];
    if (message.role !== "user") {
      continue;
    }

    return getMessageText(message);
  }

  return null;
}

export function getMessageText(message: UIMessage): string | null {
  const textParts = (message.parts ?? []).filter(
    (
      part,
    ): part is UIMessage["parts"][number] & {
      type: "text";
      text: string;
    } =>
      part.type === "text" &&
      typeof part.text === "string" &&
      part.text.trim().length > 0,
  );

  if (textParts.length === 0) {
    return null;
  }

  return textParts.map((part) => part.text.trim()).join("\n\n");
}
