import type { SourceConnectionConfig } from "@/lib/sources/source-config";

export function isSqlBackedSourceConnection(
  connection: SourceConnectionConfig | null | undefined,
): connection is SourceConnectionConfig & { setupSql: string } {
  return (
    connection?.type === "custom" &&
    typeof connection.setupSql === "string" &&
    connection.setupSql.trim().length > 0
  );
}

export async function runSourceSetupSql(input: {
  connection: SourceConnectionConfig | null | undefined;
  runSql: (statement: string) => Promise<unknown>;
}): Promise<void> {
  if (!isSqlBackedSourceConnection(input.connection)) {
    return;
  }

  await input.runSql(input.connection.setupSql);
}
