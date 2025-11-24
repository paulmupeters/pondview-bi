"use server";

import { generateChartConfig as generateChartConfigTool } from "@/ai/tools/generate-chart-config-tool";
import {
  getSchemas as getSchemasLib,
  getTablesForSchema as getTablesForSchemaLib,
  getTables as getTablesLib,
  runSqlNormalized,
} from "@/lib/db/router";
import type { Result } from "@/lib/types";

export const runSqlAndGetRowObjectsJson = async (
  dbIdentifier: string,
  sql: string,
  useHttp?: boolean
): Promise<Result[]> => runSqlNormalized(dbIdentifier, sql, useHttp);

export const getTables = async (dbIdentifier: string) =>
  getTablesLib(dbIdentifier);

export const getSchemas = async (dbIdentifier: string) =>
  getSchemasLib(dbIdentifier);


export const getTablesForSchema = async (
  dbIdentifier: string,
  schema: string,
  limit = 20
) => getTablesForSchemaLib(dbIdentifier, schema, limit);

export const generateChartConfig = async (
  results: Result[],
  userQuery: string
) => generateChartConfigTool(results, userQuery);
