"use client";

import { useEffect, useState } from "react";
import {
  CONNECTED_TABLES_UPDATED_EVENT,
  type ConnectedTable,
  readConnectedTablesFromStorage,
} from "@/lib/connected-tables";

export function useConnectedTables() {
  const [tables, setTables] = useState<ConnectedTable[]>([]);

  useEffect(() => {
    setTables(readConnectedTablesFromStorage());

    const handleUpdate = () => {
      setTables(readConnectedTablesFromStorage());
    };

    window.addEventListener(CONNECTED_TABLES_UPDATED_EVENT, handleUpdate);

    return () => {
      window.removeEventListener(CONNECTED_TABLES_UPDATED_EVENT, handleUpdate);
    };
  }, []);

  return tables;
}
