import { canonicalTable } from "@/lib/joins/graph";

type Token = {
  text: string;
  lower: string;
  start: number;
  end: number;
  kind: "word" | "quoted" | "punct" | "string";
};

type TableReferenceCandidate = {
  keyword: "from" | "join";
  depth: number;
  functionDepth: number;
  tokenIndex: number;
  token: Token;
  rawReference: string;
  alias?: string;
  matchedClause: string;
};

const RESERVED_ALIAS_KEYWORDS = new Set([
  "on",
  "where",
  "group",
  "order",
  "having",
  "limit",
  "offset",
  "join",
  "left",
  "right",
  "inner",
  "full",
  "cross",
  "union",
  "intersect",
  "except",
  "qualify",
  "window",
  "with",
  "from",
]);

const FUNCTION_BLACKLIST_PRECEDERS = new Set([
  "select",
  "from",
  "join",
  "on",
  "where",
  "group",
  "order",
  "having",
  "limit",
  "offset",
  "union",
  "intersect",
  "except",
  "with",
  "as",
  "case",
  "when",
  "then",
  "else",
  "end",
  "by",
  "and",
  "or",
  "in",
  "exists",
]);

export interface SqlTableReference {
  rawReference: string;
  tableName: string;
  alias?: string;
}

export interface BaseTableReference extends SqlTableReference {
  matchedFromClause: string;
}

export function extractTableNamesFromSql(sql: string): string[] {
  const refs = extractTableReferencesFromSql(sql);
  return Array.from(new Set(refs.map((ref) => ref.tableName)));
}

export function extractTableReferencesFromSql(
  sql: string,
): SqlTableReference[] {
  const references: SqlTableReference[] = [];
  const candidates = findTableReferenceCandidates(sql);
  for (const candidate of candidates) {
    const tableName = canonicalTable(candidate.rawReference);
    if (!tableName) {
      continue;
    }
    references.push({
      rawReference: candidate.rawReference,
      tableName,
      alias: candidate.alias,
    });
  }

  return references;
}

export function findBaseTableReference(sql: string): BaseTableReference | null {
  const candidates = findTableReferenceCandidates(sql);
  const baseCandidate = candidates.find(
    (candidate) =>
      candidate.keyword === "from" &&
      candidate.depth === 0 &&
      candidate.functionDepth === 0,
  );
  if (!baseCandidate) {
    return null;
  }

  const tableName = canonicalTable(baseCandidate.rawReference);
  if (!tableName) {
    return null;
  }

  return {
    rawReference: baseCandidate.rawReference,
    tableName,
    alias: baseCandidate.alias,
    matchedFromClause: baseCandidate.matchedClause,
  };
}

function findTableReferenceCandidates(sql: string): TableReferenceCandidate[] {
  const tokens = tokenizeSql(sql);
  const candidates: TableReferenceCandidate[] = [];
  const parenStack: Array<"function" | "other"> = [];
  let functionDepth = 0;

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];

    if (token.kind === "punct" && token.text === "(") {
      const prev = previousSignificantToken(tokens, i - 1);
      const isFunctionContext =
        !!prev &&
        (prev.kind === "word" || prev.kind === "quoted") &&
        !FUNCTION_BLACKLIST_PRECEDERS.has(prev.lower);
      parenStack.push(isFunctionContext ? "function" : "other");
      if (isFunctionContext) {
        functionDepth += 1;
      }
      continue;
    }

    if (token.kind === "punct" && token.text === ")") {
      const popped = parenStack.pop();
      if (popped === "function" && functionDepth > 0) {
        functionDepth -= 1;
      }
      continue;
    }

    if (token.kind !== "word") {
      continue;
    }

    if (token.lower !== "from" && token.lower !== "join") {
      continue;
    }

    if (functionDepth > 0) {
      continue;
    }

    const parsed = parseTableRefAfterClause(tokens, i + 1);
    if (!parsed) {
      continue;
    }

    const matchedClause = sql.slice(token.start, parsed.clauseEnd).trim();
    candidates.push({
      keyword: token.lower as "from" | "join",
      depth: parenStack.length,
      functionDepth,
      tokenIndex: i,
      token,
      rawReference: parsed.rawReference,
      alias: parsed.alias,
      matchedClause,
    });
  }

  return candidates;
}

function parseTableRefAfterClause(
  tokens: Token[],
  startIndex: number,
): { rawReference: string; alias?: string; clauseEnd: number } | null {
  let i = startIndex;
  if (i >= tokens.length) {
    return null;
  }

  // Optional LATERAL keyword before a table reference.
  if (tokens[i]?.kind === "word" && tokens[i]?.lower === "lateral") {
    i += 1;
  }
  if (i >= tokens.length) {
    return null;
  }

  const start = i;
  const first = tokens[start];
  if (!first) {
    return null;
  }

  // FROM (subquery) ... is intentionally skipped.
  if (first.kind === "punct" && first.text === "(") {
    return null;
  }
  if (!isIdentifierToken(first)) {
    return null;
  }

  let endToken = first;
  i += 1;
  while (i + 1 < tokens.length) {
    const dot = tokens[i];
    const next = tokens[i + 1];
    if (
      dot?.kind !== "punct" ||
      dot.text !== "." ||
      !next ||
      !isIdentifierToken(next)
    ) {
      break;
    }
    endToken = next;
    i += 2;
  }

  const rawReference = tokens
    .slice(start, i)
    .map((token) => token.text)
    .join("")
    .trim();
  if (!rawReference) {
    return null;
  }

  let alias: string | undefined;
  let clauseEnd = endToken.end;
  const aliasToken = tokens[i];
  const aliasValueToken = tokens[i + 1];
  if (aliasToken?.kind === "word" && aliasToken.lower === "as") {
    if (aliasValueToken && isAliasToken(aliasValueToken)) {
      alias = cleanIdentifier(aliasValueToken.text);
      clauseEnd = aliasValueToken.end;
    }
  } else if (aliasToken && isAliasToken(aliasToken)) {
    alias = cleanIdentifier(aliasToken.text);
    clauseEnd = aliasToken.end;
  }

  return { rawReference, alias, clauseEnd };
}

function previousSignificantToken(
  tokens: Token[],
  fromIndex: number,
): Token | null {
  for (let i = fromIndex; i >= 0; i -= 1) {
    const token = tokens[i];
    if (!token) {
      continue;
    }
    return token;
  }
  return null;
}

function isIdentifierToken(token: Token): boolean {
  return token.kind === "word" || token.kind === "quoted";
}

function isAliasToken(token: Token): boolean {
  if (!isIdentifierToken(token)) {
    return false;
  }
  if (token.kind !== "word") {
    return true;
  }
  return !RESERVED_ALIAS_KEYWORDS.has(token.lower);
}

function cleanIdentifier(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("`") && value.endsWith("`")) ||
    (value.startsWith("[") && value.endsWith("]"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function tokenizeSql(sql: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < sql.length) {
    const char = sql[i] ?? "";

    if (isWhitespace(char)) {
      i += 1;
      continue;
    }

    if (char === "-" && sql[i + 1] === "-") {
      i += 2;
      while (i < sql.length && sql[i] !== "\n") {
        i += 1;
      }
      continue;
    }

    if (char === "/" && sql[i + 1] === "*") {
      i += 2;
      while (i + 1 < sql.length && !(sql[i] === "*" && sql[i + 1] === "/")) {
        i += 1;
      }
      i += 2;
      continue;
    }

    if (char === "'" || char === '"' || char === "`" || char === "[") {
      const quoteKind = char === "[" ? "]" : char;
      const start = i;
      i += 1;
      while (i < sql.length) {
        const current = sql[i] ?? "";
        if (current === quoteKind) {
          if (
            (quoteKind === "'" || quoteKind === '"' || quoteKind === "`") &&
            sql[i + 1] === quoteKind
          ) {
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        i += 1;
      }
      const text = sql.slice(start, i);
      tokens.push({
        text,
        lower: text.toLowerCase(),
        start,
        end: i,
        kind: char === "'" ? "string" : "quoted",
      });
      continue;
    }

    if (isWordStart(char)) {
      const start = i;
      i += 1;
      while (i < sql.length && isWordPart(sql[i] ?? "")) {
        i += 1;
      }
      const text = sql.slice(start, i);
      tokens.push({
        text,
        lower: text.toLowerCase(),
        start,
        end: i,
        kind: "word",
      });
      continue;
    }

    if (isPunctuation(char)) {
      tokens.push({
        text: char,
        lower: char,
        start: i,
        end: i + 1,
        kind: "punct",
      });
      i += 1;
      continue;
    }

    i += 1;
  }

  return tokens;
}

function isWhitespace(value: string): boolean {
  return /\s/.test(value);
}

function isWordStart(value: string): boolean {
  return /[A-Za-z_]/.test(value);
}

function isWordPart(value: string): boolean {
  return /[A-Za-z0-9_$]/.test(value);
}

function isPunctuation(value: string): boolean {
  return value === "(" || value === ")" || value === "." || value === ",";
}
