import { getBridgeSession } from "@/lib/bridge/pondview-bridge";
import type { SqlBackend } from "@/lib/sql/sql-runtime";

const WASM_RUNTIME_FINGERPRINT = "duckdb-wasm:local";

export function getDefaultSqlRuntimeFingerprint(
  backend: SqlBackend,
): string | null {
  if (backend === "duckdb-wasm") {
    return WASM_RUNTIME_FINGERPRINT;
  }
  return null;
}

export async function resolveSqlRuntimeFingerprint(
  backend: SqlBackend,
): Promise<string> {
  const defaultFingerprint = getDefaultSqlRuntimeFingerprint(backend);
  if (defaultFingerprint) {
    return defaultFingerprint;
  }

  try {
    const session = await getBridgeSession();
    const databaseId = session.database?.id ?? "unknown";
    return `bridge:${normalizeHost(session.host)}:${session.port}:${databaseId}`;
  } catch {
    return "bridge:unknown";
  }
}

function normalizeHost(host: string): string {
  return host.trim().toLowerCase();
}
