import { Parser } from "node-sql-parser";
import type { DimensionDef, MeasureDef } from "./types";

export interface ExtractedMetadata {
  exploreName: string;
  dimensions: DimensionDef[];
  measures: MeasureDef[];
}

/**
 * Extracts semantic layer metadata (dimensions and measures) from a SQL query.
 * Uses heuristics:
 * - Fields in GROUP BY or non-aggregated expressions → dimensions
 * - Aggregated fields (COUNT, SUM, etc.) → measures
 */
export function extractSemanticLayerFromSQL(sql: string): ExtractedMetadata {
  const parser = new Parser();
  let ast: any;

  try {
    // Parse SQL - support multiple dialects
    ast = parser.astify(sql, { database: "PostgreSQL" });
  } catch (error) {
    throw new Error(`Failed to parse SQL: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Handle array of statements (take first)
  const statement = Array.isArray(ast) ? ast[0] : ast;

  if (statement.type !== "select") {
    throw new Error("Only SELECT statements are supported");
  }

  // Extract table name from FROM clause
  const exploreName = extractTableName(statement.from);
  if (!exploreName) {
    throw new Error("Could not determine table name from SQL");
  }

  // Extract GROUP BY fields
  const groupByFields = new Set<string>();
  if (statement.groupby?.columns) {
    for (const groupItem of statement.groupby.columns) {
      const fieldName = extractFieldName(groupItem);
      if (fieldName) {
        groupByFields.add(fieldName.toLowerCase());
      }
    }
  }

  const dimensions: DimensionDef[] = [];
  const measures: MeasureDef[] = [];

  // Process SELECT columns
  for (const column of statement.columns) {
    if (column === "*") continue;

    // Handle the expr wrapper that node-sql-parser adds
    const columnExpr = column.type === "expr" ? column.expr : column;
    const alias = column.as || extractFieldName(columnExpr) || "unnamed";

    // Check if this is an aggregation function
    const aggType = getAggregationType(columnExpr);

    if (aggType) {
      // This is a measure
      const sqlExpression = getAggregationSQL(columnExpr, exploreName);
      measures.push({
        name: alias,
        sql: sqlExpression,
        agg: aggType,
      });
    } else {
      // This is a dimension
      const sqlExpression = getDimensionSQL(columnExpr, exploreName);
      const dimensionType = inferDimensionType(columnExpr);

      dimensions.push({
        name: alias,
        sql: sqlExpression,
        type: dimensionType,
      });
    }
  }

  return {
    exploreName,
    dimensions,
    measures,
  };
}

/**
 * Extracts table name from FROM clause
 */
function extractTableName(fromClause: any): string | null {
  if (!fromClause || fromClause.length === 0) return null;

  const firstTable = fromClause[0];

  if (firstTable.table) {
    // Handle schema.table format
    if (typeof firstTable.table === "string") {
      return firstTable.table;
    }
    // Handle object format
    if (firstTable.table.table) {
      return firstTable.table.table;
    }
  }

  return null;
}

/**
 * Extracts field name from an expression
 */
function extractFieldName(expr: any): string | null {
  if (!expr) return null;

  if (typeof expr === "string") return expr;

  if (expr.type === "column_ref") {
    // Handle qualified column refs (table.column)
    if (expr.column === "*") return null;

    // Handle nested column structure from node-sql-parser
    if (typeof expr.column === "object" && expr.column.expr?.value) {
      return expr.column.expr.value;
    }

    if (typeof expr.column === "string") {
      return expr.column;
    }

    return null;
  }

  if (expr.type === "extract") {
    // For EXTRACT(field FROM source), use field name and source column
    const field = expr.args?.field?.toLowerCase() || "";
    const source = extractFieldName(expr.args?.source);
    if (source) {
      return `${field}_${source}`;
    }
    return field;
  }

  if (expr.type === "function") {
    // For functions like DATE_TRUNC, use the function name + first arg
    if (expr.name?.name) {
      const funcName = expr.name.name.toLowerCase();
      if (["date_trunc", "year", "month", "day"].includes(funcName)) {
        // Try to extract a meaningful name from arguments
        if (expr.args?.value?.[0]) {
          const innerField = extractFieldName(expr.args.value[0]);
          if (innerField) {
            return `${funcName}_${innerField}`;
          }
        }
      }
      return expr.name.name.toLowerCase();
    }
  }

  if (expr.type === "binary_expr") {
    // For expressions like EXTRACT(YEAR FROM date), try left side
    return extractFieldName(expr.left) || extractFieldName(expr.right);
  }

  if (expr.type === "cast") {
    return extractFieldName(expr.expr);
  }

  if (expr.type === "aggr_func") {
    // Return null for aggregations - we'll handle them separately
    return null;
  }

  return null;
}

/**
 * Gets aggregation type if the expression is an aggregation function
 */
function getAggregationType(expr: any): MeasureDef["agg"] | null {
  if (!expr || expr.type !== "aggr_func") return null;

  // Handle both string and object name formats
  const funcName = (typeof expr.name === "string" ? expr.name : expr.name?.name)?.toLowerCase();

  switch (funcName) {
    case "count":
      return expr.args?.distinct ? "count_distinct" : "count";
    case "sum":
      return "sum";
    case "avg":
      return "avg";
    case "min":
      return "min";
    case "max":
      return "max";
    default:
      return null;
  }
}

/**
 * Generates SQL expression for an aggregation
 */
function getAggregationSQL(expr: any, tableName: string): string {
  if (expr.type !== "aggr_func") return "*";

  const funcName = (typeof expr.name === "string" ? expr.name : expr.name?.name)?.toLowerCase();

  // Handle COUNT(*) and COUNT with star
  if (funcName === "count" && (!expr.args?.expr || expr.args.expr.type === "star")) {
    return "*";
  }

  // Handle aggregations with column references
  if (expr.args?.expr) {
    const columnSQL = buildSQL(expr.args.expr, tableName);
    return columnSQL || "*";
  }

  return "*";
}

/**
 * Generates SQL expression for a dimension
 */
function getDimensionSQL(expr: any, tableName: string): string {
  return buildSQL(expr, tableName);
}

/**
 * Builds SQL expression from AST node
 */
function buildSQL(expr: any, tableName: string): string {
  if (!expr) return "";

  if (typeof expr === "string") return expr;

  if (expr.type === "column_ref") {
    // Qualify column with table name if not already qualified
    let column: string;

    // Handle nested column structure from node-sql-parser
    if (typeof expr.column === "object" && expr.column.expr?.value) {
      column = expr.column.expr.value;
    } else if (typeof expr.column === "string") {
      column = expr.column;
    } else {
      return "";
    }

    // Quote column names if they contain spaces or special characters
    const needsQuoting = /[\s\-\.]/.test(column);
    const quotedColumn = needsQuoting ? `"${column}"` : column;

    if (expr.table) {
      return `${expr.table}.${quotedColumn}`;
    }
    return `${tableName}.${quotedColumn}`;
  }

  if (expr.type === "number" || expr.type === "single_quote_string" || expr.type === "double_quote_string") {
    return String(expr.value);
  }

  if (expr.type === "extract") {
    // Handle EXTRACT(field FROM source) syntax
    const field = expr.args?.field || "";
    const source = buildSQL(expr.args?.source, tableName);
    return `EXTRACT(${field} FROM ${source})`;
  }

  if (expr.type === "function") {
    const funcName = expr.name?.name || "";
    const args = expr.args?.value || [];
    const argStrings = args.map((arg: any) => buildSQL(arg, tableName));
    return `${funcName}(${argStrings.join(", ")})`;
  }

  if (expr.type === "binary_expr") {
    const left = buildSQL(expr.left, tableName);
    const right = buildSQL(expr.right, tableName);
    return `${left} ${expr.operator} ${right}`;
  }

  if (expr.type === "cast") {
    const innerExpr = buildSQL(expr.expr, tableName);
    return `CAST(${innerExpr} AS ${expr.target.dataType})`;
  }

  // Fallback: return empty string
  return "";
}

/**
 * Infers dimension type from expression
 */
function inferDimensionType(expr: any): DimensionDef["type"] {
  if (!expr) return "string";

  if (expr.type === "column_ref") {
    // Default to string for plain columns
    return "string";
  }

  if (expr.type === "extract") {
    // EXTRACT returns numbers (year, month, day, etc.)
    return "number";
  }

  if (expr.type === "function") {
    const funcName = expr.name?.name?.toLowerCase();

    // Time functions
    if (["date_trunc", "year", "month", "day", "date_part"].includes(funcName)) {
      // These return time or numbers depending on context
      return "time";
    }

    // Numeric functions
    if (["round", "floor", "ceil", "abs"].includes(funcName)) {
      return "number";
    }
  }

  if (expr.type === "number") {
    return "number";
  }

  if (expr.type === "cast") {
    const dataType = expr.target?.dataType?.toLowerCase() || "";
    if (dataType.includes("int") || dataType.includes("numeric") || dataType.includes("decimal") || dataType.includes("float")) {
      return "number";
    }
    if (dataType.includes("bool")) {
      return "boolean";
    }
    if (dataType.includes("date") || dataType.includes("time")) {
      return "time";
    }
  }

  // Default to string
  return "string";
}
