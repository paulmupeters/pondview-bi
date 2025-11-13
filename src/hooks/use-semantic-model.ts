"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  DataModel,
  DimensionDef,
  ExploreDef,
  JoinDef,
  MeasureDef,
  SegmentDef,
} from "@/../semantic-layer/types";
import type { MaterializationResult } from "@/lib/materialization/semantic-layer";

export function useSemanticModel(exploreName: string | undefined) {
  const [model, setModel] = useState<ExploreDef | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [materializing, setMaterializing] = useState(false);
  const [lastMaterialization, setLastMaterialization] =
    useState<MaterializationResult | null>(null);

  const loadModel = useCallback(async () => {
    if (!exploreName) {
      setModel(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/semantic-layer/models");
      if (!response.ok) {
        throw new Error("Failed to load models");
      }
      const dataModel: DataModel = await response.json();
      const explore = dataModel.explores.find((e) => e.name === exploreName);
      setModel(explore || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load model");
      setModel(null);
    } finally {
      setLoading(false);
    }
  }, [exploreName]);

  useEffect(() => {
    loadModel();
  }, [loadModel]);

  useEffect(() => {
    setLastMaterialization(null);
    setMaterializing(false);
  }, []);

  const performMutation = useCallback(
    async (
      url: string,
      options: RequestInit,
      errorContext: string
    ): Promise<boolean> => {
      setMaterializing(true);
      try {
        const response = await fetch(url, options);
        let data: any = null;
        try {
          data = await response.json();
        } catch {
          data = null;
        }

        if (!response.ok || (data && data.success === false)) {
          const message =
            data && data.error ? String(data.error) : errorContext;
          throw new Error(message);
        }

        await loadModel();

        if (data && Object.hasOwn(data, "materialization")) {
          const materialization = data.materialization as
            | MaterializationResult
            | null
            | undefined;
          setLastMaterialization(materialization ?? null);
        }

        return true;
      } catch (err) {
        console.error(`[Semantic Model] ${errorContext}:`, err);
        return false;
      } finally {
        setMaterializing(false);
      }
    },
    [loadModel]
  );

  const addDimension = useCallback(
    async (dimension: DimensionDef) => {
      if (!exploreName) return false;
      return performMutation(
        `/api/semantic-layer/models/${encodeURIComponent(
          exploreName
        )}/dimensions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(dimension),
        },
        "Failed to add dimension"
      );
    },
    [exploreName, performMutation]
  );

  const removeDimension = useCallback(
    async (dimensionName: string) => {
      if (!exploreName) return false;
      const url = `/api/semantic-layer/models/${encodeURIComponent(
        exploreName
      )}/dimensions?name=${encodeURIComponent(dimensionName)}`;
      return performMutation(
        url,
        { method: "DELETE" },
        "Failed to remove dimension"
      );
    },
    [exploreName, performMutation]
  );

  const addMeasure = useCallback(
    async (measure: MeasureDef) => {
      if (!exploreName) return false;
      return performMutation(
        `/api/semantic-layer/models/${encodeURIComponent(
          exploreName
        )}/measures`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(measure),
        },
        "Failed to add measure"
      );
    },
    [exploreName, performMutation]
  );

  const removeMeasure = useCallback(
    async (measureName: string) => {
      if (!exploreName) return false;
      const url = `/api/semantic-layer/models/${encodeURIComponent(
        exploreName
      )}/measures?name=${encodeURIComponent(measureName)}`;
      return performMutation(
        url,
        { method: "DELETE" },
        "Failed to remove measure"
      );
    },
    [exploreName, performMutation]
  );

  const addJoin = useCallback(
    async (join: JoinDef) => {
      if (!exploreName) return false;
      return performMutation(
        `/api/semantic-layer/models/${encodeURIComponent(exploreName)}/joins`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(join),
        },
        "Failed to add join"
      );
    },
    [exploreName, performMutation]
  );

  const removeJoin = useCallback(
    async (joinName: string) => {
      if (!exploreName) return false;
      const url = `/api/semantic-layer/models/${encodeURIComponent(
        exploreName
      )}/joins?name=${encodeURIComponent(joinName)}`;
      return performMutation(
        url,
        { method: "DELETE" },
        "Failed to remove join"
      );
    },
    [exploreName, performMutation]
  );

  const addSegment = useCallback(
    async (segment: SegmentDef) => {
      if (!exploreName) return false;
      return performMutation(
        `/api/semantic-layer/models/${encodeURIComponent(
          exploreName
        )}/segments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(segment),
        },
        "Failed to add segment"
      );
    },
    [exploreName, performMutation]
  );

  const removeSegment = useCallback(
    async (segmentName: string) => {
      if (!exploreName) return false;
      const url = `/api/semantic-layer/models/${encodeURIComponent(
        exploreName
      )}/segments?name=${encodeURIComponent(segmentName)}`;
      return performMutation(
        url,
        { method: "DELETE" },
        "Failed to remove segment"
      );
    },
    [exploreName, performMutation]
  );

  const clearMaterialization = useCallback(() => {
    setLastMaterialization(null);
  }, []);

  return {
    model,
    loading,
    error,
    dimensions: model?.dimensions || [],
    measures: model?.measures || [],
    joins: model?.joins || [],
    segments: model?.segments || [],
    addDimension,
    removeDimension,
    addMeasure,
    removeMeasure,
    addJoin,
    removeJoin,
    addSegment,
    removeSegment,
    refresh: loadModel,
    materializing,
    lastMaterialization,
    clearMaterialization,
  };
}
