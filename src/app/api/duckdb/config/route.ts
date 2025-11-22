import type { NextRequest } from "next/server";
import { resolveHttpDuckDbConfig } from "@/lib/duckdb/duckdb-http";

export const runtime = "nodejs";

/**
 * API endpoint to get DuckDB HTTP configuration
 * This allows client-side code to access HTTP config without exposing env vars
 */
export async function GET(_req: NextRequest) {
  try {
    const config = resolveHttpDuckDbConfig();
    // Return only the config object, not the resolved version
    return Response.json({
      host: config.host,
      port: config.port,
      auth: config.auth,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error ?? "");
    return Response.json(
      { error: message },
      { status: 500 }
    );
  }
}

