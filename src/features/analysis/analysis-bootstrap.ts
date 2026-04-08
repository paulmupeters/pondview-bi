type SearchParamsLike = Pick<URLSearchParams, "get"> | null;

export type AnalysisBootstrapIntent = {
  mode: "ai" | "manual";
  prompt: string | null;
  sql: string | null;
  autorun: boolean;
};

function normalizeParam(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function resolveAnalysisBootstrapIntent(
  searchParams: SearchParamsLike,
): AnalysisBootstrapIntent | null {
  const prompt = normalizeParam(searchParams?.get("q"));
  if (prompt) {
    return {
      mode: "ai",
      prompt,
      sql: null,
      autorun: false,
    };
  }

  const sql = normalizeParam(searchParams?.get("sql"));
  if (sql) {
    return {
      mode: "manual",
      prompt: null,
      sql,
      autorun: searchParams?.get("autorun") === "1",
    };
  }

  const mode = searchParams?.get("mode");
  if (mode === "ai" || mode === "manual") {
    return {
      mode,
      prompt: null,
      sql: null,
      autorun: false,
    };
  }

  return null;
}

export function getAnalysisPostBootstrapHref(
  notebookId: string,
  pathname = "/analysis",
): string {
  return `${pathname}?id=${encodeURIComponent(notebookId)}`;
}
