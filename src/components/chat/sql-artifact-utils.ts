import type {
  SqlAnalysisData,
  SqlAnalysisStage,
} from "@/components/sql-analysis-display.types";

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
