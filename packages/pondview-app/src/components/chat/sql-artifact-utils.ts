import type { UIMessage } from "@ai-sdk/react";
import type {
  SqlAnalysisData,
  SqlAnalysisStage,
} from "@/components/sql-analysis-display.types";
import type { ArtifactStatus } from "@/hooks/types";

type SqlArtifactData = {
  id?: string;
  status?: ArtifactStatus;
  progress?: number;
  error?: string;
  payload?: SqlAnalysisData;
};

export type ExtractedSqlArtifactPart = {
  partIndex: number;
  artifactData: SqlArtifactData;
};

const NESTED_PART_INDEX_BASE = 1000;

function isSqlArtifactData(value: unknown): value is SqlArtifactData {
  return Boolean(value && typeof value === "object");
}

function extractNestedSqlArtifactParts(
  toolPart: UIMessage["parts"][number],
  executeSqlArtifactType: string,
  topLevelPartIndex: number,
): ExtractedSqlArtifactPart[] {
  const toolOutput =
    ("output" in toolPart ? toolPart.output : undefined) ??
    ("result" in toolPart ? toolPart.result : undefined);

  if (
    !(toolOutput && typeof toolOutput === "object" && "parts" in toolOutput)
  ) {
    return [];
  }

  const nestedParts = (toolOutput as { parts?: UIMessage["parts"] }).parts;

  if (!Array.isArray(nestedParts)) {
    return [];
  }

  const extracted: ExtractedSqlArtifactPart[] = [];

  nestedParts.forEach((nestedPart, nestedPartIndex) => {
    if (
      nestedPart.type === executeSqlArtifactType &&
      "data" in nestedPart &&
      isSqlArtifactData(nestedPart.data)
    ) {
      extracted.push({
        // Keep a stable index for visualization IDs even for nested artifacts.
        partIndex:
          topLevelPartIndex * NESTED_PART_INDEX_BASE + (nestedPartIndex + 1),
        artifactData: nestedPart.data,
      });
    }
  });

  return extracted;
}

export function extractSqlArtifactParts(
  parts: UIMessage["parts"] | undefined,
  executeSqlArtifactType: string,
): ExtractedSqlArtifactPart[] {
  if (!parts || !Array.isArray(parts)) {
    return [];
  }

  const extracted: ExtractedSqlArtifactPart[] = [];

  parts.forEach((part, partIndex) => {
    if (
      part.type === executeSqlArtifactType &&
      "data" in part &&
      isSqlArtifactData(part.data)
    ) {
      extracted.push({
        partIndex,
        artifactData: part.data,
      });
      return;
    }

    if (part.type.startsWith("tool-")) {
      extracted.push(
        ...extractNestedSqlArtifactParts(
          part,
          executeSqlArtifactType,
          partIndex,
        ),
      );
    }
  });

  return extracted;
}

export function getTopLevelPartIndex(partIndex: number) {
  return Math.floor(partIndex / NESTED_PART_INDEX_BASE);
}

export function getVisualizationIdForArtifact({
  artifactId,
  messageId,
  partIndex,
}: {
  artifactId?: string;
  messageId: string;
  partIndex: number;
}) {
  if (artifactId && artifactId.trim().length > 0) {
    return artifactId;
  }

  return `${messageId}-artifact-${partIndex}`;
}

export function shouldIncludeVisualization(
  payload: SqlAnalysisData | null,
  derivedStage: SqlAnalysisStage,
) {
  return Boolean(
    payload &&
      (payload.visualType === "chart" ||
        payload.visualType === "card" ||
        (payload.visualType === "table" &&
          payload.rows &&
          payload.rows.length > 0) ||
        (payload.query && derivedStage !== "complete")),
  );
}
