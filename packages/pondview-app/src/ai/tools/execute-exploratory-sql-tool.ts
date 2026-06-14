import { tool } from "ai";
import { z } from "zod";
import { deriveColumns, executeSqlForRuntime } from "./sql-tool-shared";

export const executeExploratorySqlTool = tool({
  description:
    "Validate or refine a SQL draft for the current notebook cell. Use this while iterating on the query before the final committed execution. Returns the updated SQL plus a preview of rows.",
  inputSchema: z.object({
    sql: z
      .string()
      .describe("The SQL draft to validate or refine for the notebook cell."),
    databasePath: z
      .string()
      .optional()
      .describe(
        "Optional database identifier/path to run the SQL against. Omit to use the selected Query Runtime.",
      ),
  }),
  execute: async ({ sql, databasePath }) => {
    const queryResult = await executeSqlForRuntime(sql, databasePath);
    const columns = deriveColumns(queryResult.rows);
    const rowCount = queryResult.rows.length;
    const queryType = sql.trim().split(/\s+/)[0]?.toUpperCase() || "SELECT";

    return {
      text: `Validated ${queryType} draft successfully${
        queryResult.dbIdentifier ? ` on ${queryResult.dbIdentifier}` : ""
      }. Preview returned ${rowCount} row${
        rowCount === 1 ? "" : "s"
      } in ${queryResult.durationMs}ms.`,
      sql,
      dbIdentifier: queryResult.dbIdentifier,
      sqlBackend: queryResult.backend,
      rowCount,
      columns,
      rows: queryResult.rows,
      summary: {
        totalRows: rowCount,
        executionTimeMs: queryResult.durationMs,
        queryType,
      },
    };
  },
});
