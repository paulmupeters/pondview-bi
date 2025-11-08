"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DataModel, TableRelationship } from "@/lib/types";

const DATA_MODEL_STORAGE_PREFIX = "bi-chat:data-model:";

const isClient = typeof window !== "undefined";

function storageKey(databasePath: string) {
  return `${DATA_MODEL_STORAGE_PREFIX}${databasePath}`;
}

function readModel(databasePath: string): DataModel {
  if (!isClient) return { relationships: [] };
  try {
    const raw = window.localStorage.getItem(storageKey(databasePath));
    if (!raw) return { relationships: [] };
    const parsed = JSON.parse(raw) as DataModel;
    if (!parsed || typeof parsed !== "object") return { relationships: [] };
    if (!Array.isArray(parsed.relationships)) return { relationships: [] };
    return { relationships: parsed.relationships };
  } catch {
    return { relationships: [] };
  }
}

function writeModel(databasePath: string, model: DataModel) {
  if (!isClient) return;
  try {
    window.localStorage.setItem(storageKey(databasePath), JSON.stringify(model));
  } catch {
    // ignore
  }
}

export function useDataModel(databasePath: string | undefined) {
  const [relationships, setRelationships] = useState<TableRelationship[]>([]);

  useEffect(() => {
    if (!databasePath) return;
    setRelationships(readModel(databasePath).relationships);
  }, [databasePath]);

  const addRelationship = useCallback(
    (rel: TableRelationship) => {
      if (!databasePath) return;
      setRelationships((prev) => {
        const next = [...prev, rel];
        writeModel(databasePath, { relationships: next });
        return next;
      });
    },
    [databasePath],
  );

  const removeRelationship = useCallback(
    (id: string) => {
      if (!databasePath) return;
      setRelationships((prev) => {
        const next = prev.filter((r) => r.id !== id);
        writeModel(databasePath, { relationships: next });
        return next;
      });
    },
    [databasePath],
  );

  const replaceRelationship = useCallback(
    (updated: TableRelationship) => {
      if (!databasePath) return;
      setRelationships((prev) => {
        const next = prev.map((r) => (r.id === updated.id ? updated : r));
        writeModel(databasePath, { relationships: next });
        return next;
      });
    },
    [databasePath],
  );

  const api = useMemo(
    () => ({ relationships, addRelationship, removeRelationship, replaceRelationship }),
    [relationships, addRelationship, removeRelationship, replaceRelationship],
  );

  return api;
}


