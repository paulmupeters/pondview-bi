import type { UIMessage } from "ai";
import type { QueryNotice } from "@/components/sql-console";
import type { SqlBackend } from "@/lib/sql/sql-runtime";

export type SqlEditorAiAction =
  | "custom"
  | "write"
  | "refine"
  | "fix"
  | "explain"
  | "summarize";

export type SqlEditorResultPayload = {
  sql: string;
  rows: Record<string, unknown>[];
  columns: { name: string; type?: string }[];
  durationMs: number;
  backend?: SqlBackend;
  dbIdentifier?: string;
  catalogContext?: string | null;
};

export type SqlEditorResultContext = {
  sql: string;
  columns: { name: string; type?: string }[];
  rowCount: number;
  durationMs: number;
  sampleRows: Record<string, unknown>[];
  omittedRowCount: number;
  backend?: SqlBackend;
  dbIdentifier?: string;
  catalogContext?: string | null;
};

export type SqlEditorAssistPromptInput = {
  action: SqlEditorAiAction;
  customPrompt: string;
  currentSql: string;
  selectedDb?: string;
  selectedCatalogContext?: string | null;
  queryNotice?: QueryNotice | null;
  resultContext?: SqlEditorResultContext | null;
};

const DEFAULT_SAMPLE_ROW_LIMIT = 20;
const READ_ONLY_SQL_PATTERN = /^(select|with)\b/i;
const MUTATING_SQL_PATTERN =
  /\b(create|insert|update|delete|drop|alter|truncate|merge|copy|attach|detach|install|load|pragma|call)\b/i;

export function buildSqlEditorResultContext(
  result: SqlEditorResultPayload | null,
  sampleRowLimit = DEFAULT_SAMPLE_ROW_LIMIT,
): SqlEditorResultContext | null {
  if (!result) {
    return null;
  }

  const boundedLimit = Math.max(0, sampleRowLimit);
  const sampleRows = result.rows.slice(0, boundedLimit);

  return {
    sql: result.sql,
    columns: result.columns,
    rowCount: result.rows.length,
    durationMs: result.durationMs,
    sampleRows,
    omittedRowCount: Math.max(0, result.rows.length - sampleRows.length),
    backend: result.backend,
    dbIdentifier: result.dbIdentifier,
    catalogContext: result.catalogContext,
  };
}

function actionInstruction(action: SqlEditorAiAction): string {
  switch (action) {
    case "write":
      return "Write a new read-only SELECT query from the user's request. Put the replacement query in a fenced sql code block.";
    case "refine":
      return "Refine the current SQL while preserving the user's intent. Put the replacement query in a fenced sql code block.";
    case "fix":
      return "Fix the current SQL using the latest error if available. Put the replacement query in a fenced sql code block.";
    case "explain":
      return "Explain what the current SQL does. Do not suggest replacement SQL unless the user asks for it.";
    case "summarize":
      return "Summarize the current result using only the supplied result context. Do not suggest replacement SQL unless the user asks for it.";
    case "custom":
      return "Answer the user's request. If the user asks you to write, refine, or fix SQL, put the replacement query in a fenced sql code block.";
  }
}

export function buildSqlEditorAssistPrompt({
  action,
  customPrompt,
  currentSql,
  selectedDb,
  selectedCatalogContext,
  queryNotice,
  resultContext,
}: SqlEditorAssistPromptInput): string {
  const trimmedPrompt = customPrompt.trim();
  const trimmedSql = currentSql.trim();

  return [
    `Action: ${action}`,
    `Instruction: ${actionInstruction(action)}`,
    "Safety: Only suggest read-only SELECT SQL. Never suggest DDL, DML, attachment, extension, or administrative statements.",
    "",
    "User request:",
    trimmedPrompt || "(no additional request)",
    "",
    "Current SQL:",
    trimmedSql ? `\`\`\`sql\n${trimmedSql}\n\`\`\`` : "(empty)",
    "",
    "Selected context:",
    JSON.stringify(
      {
        dbIdentifier: selectedDb ?? null,
        catalogContext: selectedCatalogContext ?? null,
      },
      null,
      2,
    ),
    "",
    "Latest query notice:",
    queryNotice ? JSON.stringify(queryNotice, null, 2) : "(none)",
    "",
    "Current result context:",
    resultContext ? JSON.stringify(resultContext, null, 2) : "(none)",
  ].join("\n");
}

function stripLeadingSqlComments(sql: string): string {
  let next = sql.trim();
  let previous = "";

  while (next !== previous) {
    previous = next;
    next = next
      .replace(/^--[^\n]*(\n|$)/, "")
      .replace(/^\/\*[\s\S]*?\*\//, "")
      .trim();
  }

  return next;
}

export function isReadOnlySelectSql(sql: string): boolean {
  const withoutComments = stripLeadingSqlComments(sql);
  if (!READ_ONLY_SQL_PATTERN.test(withoutComments)) {
    return false;
  }

  return !MUTATING_SQL_PATTERN.test(withoutComments);
}

export function extractSqlSuggestion(text: string): string | null {
  const fencedSql = text.match(/```(?:sql)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidate = fencedSql ?? text.trim();

  if (!candidate || !isReadOnlySelectSql(candidate)) {
    return null;
  }

  return candidate;
}

export function getTextFromUiMessage(message: UIMessage): string {
  return (message.parts ?? [])
    .filter(
      (part): part is Extract<UIMessage["parts"][number], { type: "text" }> =>
        part.type === "text" && typeof part.text === "string",
    )
    .map((part) => part.text)
    .join("")
    .trim();
}
