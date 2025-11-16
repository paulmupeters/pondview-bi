"use client";

import { useEffect, useRef, useState } from "react";
import { ExecuteSqlArtifact } from "@/ai/artifacts/execute-sql";
import {
  SqlAnalysisDisplay,
} from "@/components/sql-analysis-display";
import type { SqlAnalysisData, SqlAnalysisStage } from "@/components/sql-analysis-display.types";
import { useArtifact } from "@/hooks/use-artifacts";
import type { Result } from "@/lib/types";

type AnalysisSnapshot = SqlAnalysisData & {
  columns: { name: string; type?: string }[];
  rows: Result[];
};

function normalizePayload(payload: SqlAnalysisData | null): AnalysisSnapshot | null {
  if (!payload) return null;

  return {
    ...payload,
    columns: (payload.columns ?? []).map((column) => ({ ...column })),
    rows: (payload.rows as Result[] | undefined) ?? [],
  };
}

export function SqlAnalysisPanel({ storeId }: { storeId?: string }) {
  const sqlData = useArtifact(ExecuteSqlArtifact, undefined, storeId) as
    | { data?: SqlAnalysisData }
    | undefined;

  const latestPayloadRaw = (sqlData?.data as SqlAnalysisData | null) ?? null;
  const latestPayload = normalizePayload(latestPayloadRaw);

  const [history, setHistory] = useState<AnalysisSnapshot[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const lastFingerprintRef = useRef<string | null>(null);
  const prevHistoryLenRef = useRef(0);

  useEffect(() => {
    if (!latestPayloadRaw || latestPayloadRaw.stage !== "complete") return;

    const fingerprint = `${latestPayloadRaw.query ?? ""}|${latestPayloadRaw.executionTime ?? 0}|${latestPayloadRaw.rowCount ?? 0}|${latestPayloadRaw.columns?.length ?? 0}|${latestPayloadRaw.summary?.totalRows ?? 0}`;
    if (lastFingerprintRef.current === fingerprint) return;
    lastFingerprintRef.current = fingerprint;

    const snapshot = normalizePayload(latestPayloadRaw);
    if (!snapshot) return;

    setHistory((prev) => {
      const exists = prev.some(
        (entry) =>
          (entry.query ?? "") === (snapshot.query ?? "") &&
          (entry.executionTime ?? 0) === (snapshot.executionTime ?? 0) &&
          (entry.summary?.totalRows ?? 0) === (snapshot.summary?.totalRows ?? 0),
      );
      if (exists) return prev;
      return [...prev, snapshot];
    });
  }, [latestPayloadRaw]);

  useEffect(() => {
    if (history.length > prevHistoryLenRef.current) {
      setCurrentIndex(history.length - 1);
    } else if (currentIndex < 0 && history.length > 0) {
      setCurrentIndex(0);
    }
    prevHistoryLenRef.current = history.length;
  }, [history.length, currentIndex]);

  const hasHistory = history.length > 0 && currentIndex >= 0;
  const selected = hasHistory ? history[currentIndex] : latestPayload;

  if (!latestPayloadRaw && !hasHistory) {
    return null;
  }

  const stageForIndicator = (latestPayloadRaw?.stage ?? "loading") as SqlAnalysisStage;
  const progressForIndicator = latestPayloadRaw?.progress ?? 0;
  const isProcessing = stageForIndicator !== "complete";

  return (
    <SqlAnalysisDisplay
      data={selected ?? null}
      stage={stageForIndicator}
      progress={progressForIndicator}
      showStageIndicator={isProcessing}
      history={
        hasHistory
          ? {
              currentIndex,
              total: history.length,
              onPrev: () => setCurrentIndex((index) => Math.max(0, index - 1)),
              onNext: () =>
                setCurrentIndex((index) =>
                  Math.min(history.length - 1, index + 1),
                ),
            }
          : undefined
      }
    />
  );
}
