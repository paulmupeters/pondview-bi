import { getBridgeSession } from "@/lib/bridge/pondview-bridge";
import { getDuckDbHttpConfigFromStorage } from "@/lib/duckdb/duckdb-http-browser";
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

  if (backend === "duckdb-http") {
    const config = getDuckDbHttpConfigFromStorage();
    return config
      ? `duckdb-http:${normalizeHost(config.host)}:${config.port}`
      : "duckdb-http:unknown";
  }

  try {
    const session = await getBridgeSession();
    return `bridge:${normalizeHost(session.host)}:${session.port}`;
  } catch {
    return "bridge:unknown";
  }
}

function normalizeHost(host: string): string {
  return host.trim().toLowerCase();
}
