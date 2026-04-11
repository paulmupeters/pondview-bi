import type { UIMessage } from "@ai-sdk/react";
import { extractSqlArtifactParts } from "@/components/chat/sql-artifact-utils";
import type { SqlAnalysisData } from "@/components/sql-analysis-display.types";

const EXECUTE_SQL_ARTIFACT_TYPE = "data-execute-sql";
const EXPLORATORY_SQL_TOOL_TYPE = "tool-execute_exploratory_sql";

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
}): string {
  const {
    prompt,
    sqlDraft,
    selectedDbIdentifier,
    selectedCatalogContext,
    resultPayload,
  } = params;

  const trimmedPrompt = prompt.trim();
  if (!trimmedPrompt) {
    return "";
  }

  const contextLines: string[] = [];

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
      : mapArtifactStatusToCellStatus(latestArtifact?.status),
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
