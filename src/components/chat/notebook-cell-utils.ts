import type { UIMessage } from "@ai-sdk/react";
import { parsePartsOrFallback } from "@/components/chat/hooks/chat-session-utils";
import type { SqlAnalysisData } from "@/components/sql-analysis-display.types";
import type { WorkspaceAnalysisCellEntry } from "@/lib/workspace/workspace-db";

export function parseStoredPayload(
  resultPayloadJson: string | null | undefined,
): SqlAnalysisData | null {
  if (!resultPayloadJson) {
    return null;
  }

  try {
    const parsed = JSON.parse(resultPayloadJson);
    return parsed && typeof parsed === "object"
      ? (parsed as SqlAnalysisData)
      : null;
  } catch {
    return null;
  }
}

export function buildNotebookArtifactEntry(params: {
  executeSqlArtifactType: string;
  payload: SqlAnalysisData;
}): string {
  const now = Date.now();

  return JSON.stringify([
    {
      type: params.executeSqlArtifactType,
      data: {
        id: `notebook-artifact-${now}`,
        version: 1,
        status: "complete",
        progress: 1,
        payload: params.payload,
        createdAt: now,
        updatedAt: now,
      },
    },
  ]);
}

export function analysisCellEntryToUiMessage(
  entry: WorkspaceAnalysisCellEntry,
): UIMessage {
  return {
    id: entry.id,
    role: entry.role as UIMessage["role"],
    parts: parsePartsOrFallback(entry.partsJson, ""),
  };
}

export function getTrailingAssistantMessages(
  messages: UIMessage[],
): UIMessage[] {
  const trailingAssistantMessages: UIMessage[] = [];

  for (
    let messageIndex = messages.length - 1;
    messageIndex >= 0;
    messageIndex -= 1
  ) {
    const message = messages[messageIndex];

    if (message?.role !== "assistant") {
      break;
    }

    trailingAssistantMessages.push(message);
  }

  return trailingAssistantMessages.reverse();
}
