import { runSqlNormalized } from "@/lib/duckdb/query";

export const runtime = "nodejs";

const LIST_SECRETS_SQL =
  "SELECT name, provider FROM duckdb_secrets();";

export async function GET() {
  try {
    const rows = await runSqlNormalized("", LIST_SECRETS_SQL);
    const secrets = rows
      .map((row) => ({
        name: String(row.name ?? ""),
        provider: String(row.provider ?? ""),
      }));
    console.log("secrets", secrets)

    return Response.json({ secrets });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error ?? "Unknown error");

    const isMissingFunction =
      /duckdb_secrets/iu.test(message) &&
      /not found|does not exist|No function matches/iu.test(message);

    return Response.json(
      {
        error: isMissingFunction
          ? "duckdb_secrets() is not available in this DuckDB build."
          : message,
      },
      { status: 500 },
    );
  }
}

