"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  DataModel,
  ExploreDef,
  DimensionDef,
  MeasureDef,
  JoinDef,
  SegmentDef,
} from "@/../semantic-layer/types";

export function useSemanticModel(exploreName: string | undefined) {
  const [model, setModel] = useState<ExploreDef | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const addDimension = useCallback(
    async (dimension: DimensionDef) => {
      if (!exploreName) return false;
      try {
        const response = await fetch(
          `/api/semantic-layer/models/${encodeURIComponent(exploreName)}/dimensions`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(dimension),
          }
        );
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to add dimension");
        }
        await loadModel();
        return true;
      } catch (err) {
        console.error("Failed to add dimension:", err);
        return false;
      }
    },
    [exploreName, loadModel]
  );

  const removeDimension = useCallback(
    async (dimensionName: string) => {
      if (!exploreName) return false;
      try {
        const response = await fetch(
          `/api/semantic-layer/models/${encodeURIComponent(exploreName)}/dimensions?name=${encodeURIComponent(dimensionName)}`,
          {
            method: "DELETE",
          }
        );
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to remove dimension");
        }
        await loadModel();
        return true;
      } catch (err) {
        console.error("Failed to remove dimension:", err);
        return false;
      }
    },
    [exploreName, loadModel]
  );

  const addMeasure = useCallback(
    async (measure: MeasureDef) => {
      if (!exploreName) return false;
      try {
        const response = await fetch(
          `/api/semantic-layer/models/${encodeURIComponent(exploreName)}/measures`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(measure),
          }
        );
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to add measure");
        }
        await loadModel();
        return true;
      } catch (err) {
        console.error("Failed to add measure:", err);
        return false;
      }
    },
    [exploreName, loadModel]
  );

  const removeMeasure = useCallback(
    async (measureName: string) => {
      if (!exploreName) return false;
      try {
        const response = await fetch(
          `/api/semantic-layer/models/${encodeURIComponent(exploreName)}/measures?name=${encodeURIComponent(measureName)}`,
          {
            method: "DELETE",
          }
        );
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to remove measure");
        }
        await loadModel();
        return true;
      } catch (err) {
        console.error("Failed to remove measure:", err);
        return false;
      }
    },
    [exploreName, loadModel]
  );

  const addJoin = useCallback(
    async (join: JoinDef) => {
      if (!exploreName) return false;
      try {
        const response = await fetch(
          `/api/semantic-layer/models/${encodeURIComponent(exploreName)}/joins`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(join),
          }
        );
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to add join");
        }
        await loadModel();
        return true;
      } catch (err) {
        console.error("Failed to add join:", err);
        return false;
      }
    },
    [exploreName, loadModel]
  );

  const removeJoin = useCallback(
    async (joinName: string) => {
      if (!exploreName) return false;
      try {
        const response = await fetch(
          `/api/semantic-layer/models/${encodeURIComponent(exploreName)}/joins?name=${encodeURIComponent(joinName)}`,
          {
            method: "DELETE",
          }
        );
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to remove join");
        }
        await loadModel();
        return true;
      } catch (err) {
        console.error("Failed to remove join:", err);
        return false;
      }
    },
    [exploreName, loadModel]
  );

  const addSegment = useCallback(
    async (segment: SegmentDef) => {
      if (!exploreName) return false;
      try {
        const response = await fetch(
          `/api/semantic-layer/models/${encodeURIComponent(exploreName)}/segments`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(segment),
          }
        );
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to add segment");
        }
        await loadModel();
        return true;
      } catch (err) {
        console.error("Failed to add segment:", err);
        return false;
      }
    },
    [exploreName, loadModel]
  );

  const removeSegment = useCallback(
    async (segmentName: string) => {
      if (!exploreName) return false;
      try {
        const response = await fetch(
          `/api/semantic-layer/models/${encodeURIComponent(exploreName)}/segments?name=${encodeURIComponent(segmentName)}`,
          {
            method: "DELETE",
          }
        );
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to remove segment");
        }
        await loadModel();
        return true;
      } catch (err) {
        console.error("Failed to remove segment:", err);
        return false;
      }
    },
    [exploreName, loadModel]
  );

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
  };
}

