import type { UIMessage } from "@ai-sdk/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  extractSqlArtifactParts,
  getVisualizationIdForArtifact,
  shouldIncludeVisualization,
} from "@/components/chat/sql-artifact-utils";
import type {
  SqlAnalysisData,
  SqlAnalysisStage,
} from "@/components/sql-analysis-display.types";
import type { CardConfig, Config } from "@/lib/types";

export type VisualizationEntry = {
  id: string;
  data: SqlAnalysisData | null;
  stage?: SqlAnalysisStage;
  progress?: number;
  artifactId?: string;
  canAddToChat?: boolean;
  onConfigChange?: (config: {
    chartConfig?: Config;
    cardConfig?: CardConfig;
  }) => void;
  onVisualTypeChange?: (visualType: "table" | "chart" | "card") => void;
  source?: "artifact" | "manual-repl";
};

type UseVisualizationSelectionArgs = {
  messages: UIMessage[];
  executeSqlArtifactType: string;
  supplementalVisualizations?: VisualizationEntry[];
};

export function useVisualizationSelection({
  messages,
  executeSqlArtifactType,
  supplementalVisualizations = [],
}: UseVisualizationSelectionArgs) {
  const [activeVisualizationId, setActiveVisualizationId] = useState<
    string | null
  >(null);
  const [hasPinnedVisualizationSelection, setHasPinnedVisualizationSelection] =
    useState(false);
  const lastAutoSelectedGeneratedVisualizationIdRef = useRef<string | null>(
    null,
  );

  const getLastSelectableVisualizationIdForMessage = useCallback(
    (message: UIMessage) => {
      let lastVisualizationId: string | null = null;
      const sqlArtifacts = extractSqlArtifactParts(
        message.parts,
        executeSqlArtifactType,
      );

      for (const { partIndex, artifactData } of sqlArtifacts) {
        if (!artifactData || artifactData.status === "error") {
          continue;
        }

        const payload = (artifactData.payload ??
          null) as SqlAnalysisData | null;
        const artifactStatus = artifactData.status;
        const derivedStage = (payload?.stage ??
          (artifactStatus === "complete"
            ? "complete"
            : "loading")) as SqlAnalysisStage;

        if (!shouldIncludeVisualization(payload, derivedStage)) {
          continue;
        }

        lastVisualizationId = getVisualizationIdForArtifact({
          artifactId: artifactData.id,
          messageId: message.id,
          partIndex,
        });
      }

      return lastVisualizationId;
    },
    [executeSqlArtifactType],
  );

  const visualizations = useMemo(() => {
    const vizList: VisualizationEntry[] = [];

    messages.forEach((message) => {
      const sqlArtifacts = extractSqlArtifactParts(
        message.parts,
        executeSqlArtifactType,
      );

      sqlArtifacts.forEach(({ partIndex, artifactData }) => {
        if (!artifactData || artifactData.status === "error") {
          return;
        }

        const payload = (artifactData.payload ??
          null) as SqlAnalysisData | null;
        const artifactStatus = artifactData.status;
        const derivedStage = (payload?.stage ??
          (artifactStatus === "complete"
            ? "complete"
            : "loading")) as SqlAnalysisStage;
        const progressValue =
          typeof artifactData.progress === "number"
            ? artifactData.progress
            : (payload?.progress ?? 0);

        if (!shouldIncludeVisualization(payload, derivedStage)) {
          return;
        }

        const visualizationId = getVisualizationIdForArtifact({
          artifactId: artifactData.id,
          messageId: message.id,
          partIndex,
        });
        vizList.push({
          id: visualizationId,
          data: payload,
          stage: derivedStage,
          progress: progressValue,
          artifactId: artifactData.id,
          source: "artifact",
        });
      });
    });

    supplementalVisualizations.forEach((visualization) => {
      if (!visualization.data) {
        return;
      }

      vizList.push(visualization);
    });

    return vizList;
  }, [messages, executeSqlArtifactType, supplementalVisualizations]);

  useEffect(() => {
    if (visualizations.length === 0) {
      if (activeVisualizationId !== null) {
        setActiveVisualizationId(null);
      }
      if (hasPinnedVisualizationSelection) {
        setHasPinnedVisualizationSelection(false);
      }
      lastAutoSelectedGeneratedVisualizationIdRef.current = null;
      return;
    }

    const latestVisualization = visualizations[visualizations.length - 1];
    const latestPersistedVisualization =
      [...visualizations]
        .reverse()
        .find((visualization) => visualization.source !== "manual-repl") ??
      null;
    const latestVisualizationId =
      latestPersistedVisualization?.id ?? latestVisualization?.id;
    const activeSelectionExists = visualizations.some(
      (visualization) => visualization.id === activeVisualizationId,
    );
    const latestVisualizationIsGeneratedChart =
      latestPersistedVisualization?.stage === "complete" &&
      (latestPersistedVisualization.data?.visualType === "chart" ||
        latestPersistedVisualization.data?.visualType === "card");
    const isNewGeneratedVisualization =
      latestVisualizationId &&
      latestVisualizationId !==
        lastAutoSelectedGeneratedVisualizationIdRef.current;

    if (
      latestVisualizationIsGeneratedChart &&
      isNewGeneratedVisualization &&
      latestVisualizationId &&
      activeVisualizationId !== latestVisualizationId
    ) {
      lastAutoSelectedGeneratedVisualizationIdRef.current =
        latestVisualizationId;
      setHasPinnedVisualizationSelection(false);
      setActiveVisualizationId(latestVisualizationId);
      return;
    }

    if (hasPinnedVisualizationSelection) {
      if (!activeSelectionExists) {
        setHasPinnedVisualizationSelection(false);
        setActiveVisualizationId(latestVisualizationId);
      }
      return;
    }

    if (activeVisualizationId !== latestVisualizationId) {
      setActiveVisualizationId(latestVisualizationId);
    }
  }, [activeVisualizationId, hasPinnedVisualizationSelection, visualizations]);

  const handleSelectVisualization = useCallback(
    (visualizationId: string, options?: { pinned?: boolean }) => {
      setHasPinnedVisualizationSelection(options?.pinned ?? true);
      setActiveVisualizationId(visualizationId);
    },
    [],
  );

  return {
    visualizations,
    activeVisualizationId,
    handleSelectVisualization,
    getLastSelectableVisualizationIdForMessage,
  };
}
