"use client";

import type { UIMessage } from "@ai-sdk/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getVisualizationIdForArtifact,
  shouldIncludeVisualization,
} from "@/components/chat/sql-artifact-utils";
import type {
  SqlAnalysisData,
  SqlAnalysisStage,
} from "@/components/sql-analysis-display.types";
import type { ArtifactStatus } from "@/hooks/types";

type VisualizationEntry = {
  id: string;
  data: SqlAnalysisData | null;
  stage?: SqlAnalysisStage;
  progress?: number;
};

type UseVisualizationSelectionArgs = {
  messages: UIMessage[];
  executeSqlArtifactType: string;
};

export function useVisualizationSelection({
  messages,
  executeSqlArtifactType,
}: UseVisualizationSelectionArgs) {
  const [activeVisualizationId, setActiveVisualizationId] = useState<
    string | null
  >(null);
  const [hasPinnedVisualizationSelection, setHasPinnedVisualizationSelection] =
    useState(false);

  const getFirstSelectableVisualizationIdForMessage = useCallback(
    (message: UIMessage) => {
      if (!message.parts) {
        return null;
      }

      for (
        let partIndex = 0;
        partIndex < message.parts.length;
        partIndex += 1
      ) {
        const part = message.parts[partIndex];
        if (part.type !== executeSqlArtifactType) {
          continue;
        }

        const artifactPart = part as {
          data?: {
            id?: string;
            status?: ArtifactStatus;
            progress?: number;
            error?: string;
            payload?: SqlAnalysisData;
          };
        };
        const artifactData = artifactPart.data;

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

        return getVisualizationIdForArtifact({
          artifactId: artifactData.id,
          messageId: message.id,
          partIndex,
        });
      }

      return null;
    },
    [executeSqlArtifactType],
  );

  const visualizations = useMemo(() => {
    const vizList: VisualizationEntry[] = [];

    messages.forEach((message) => {
      if (!message.parts) {
        return;
      }

      message.parts.forEach((part, partIndex) => {
        if (part.type !== executeSqlArtifactType) {
          return;
        }

        const artifactPart = part as {
          data?: {
            id?: string;
            status?: ArtifactStatus;
            progress?: number;
            error?: string;
            payload?: SqlAnalysisData;
          };
        };
        const artifactData = artifactPart.data;

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
        });
      });
    });

    return vizList;
  }, [messages, executeSqlArtifactType]);

  useEffect(() => {
    if (visualizations.length === 0) {
      if (activeVisualizationId !== null) {
        setActiveVisualizationId(null);
      }
      if (hasPinnedVisualizationSelection) {
        setHasPinnedVisualizationSelection(false);
      }
      return;
    }

    const latestVisualizationId = visualizations[visualizations.length - 1]?.id;
    const activeSelectionExists = visualizations.some(
      (visualization) => visualization.id === activeVisualizationId,
    );

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

  const handleSelectVisualization = useCallback((visualizationId: string) => {
    setHasPinnedVisualizationSelection(true);
    setActiveVisualizationId(visualizationId);
  }, []);

  return {
    visualizations,
    activeVisualizationId,
    handleSelectVisualization,
    getFirstSelectableVisualizationIdForMessage,
  };
}
