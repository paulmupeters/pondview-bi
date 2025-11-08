export function resolveDbPath(dbIdentifier: string, token?: string): string {
  const id = (dbIdentifier ?? "").trim();
  if (!id) return ":memory:";
  if (id.startsWith("md:")) {
    const hasToken = /motherduck_token=/i.test(id);
    if (hasToken) return id;
    
    // Prefer user-provided token over environment variable
    const finalToken = token?.trim() || process.env.MOTHERDUCK_TOKEN || "";
    if (!finalToken) {
      // Return as-is if no token available (will likely fail, but preserves original behavior)
      return id;
    }
    
    const separator = id.includes("?") ? "&" : "?";
    // URL encode the token to handle special characters
    const encodedToken = encodeURIComponent(finalToken);
    return `${id}${separator}motherduck_token=${encodedToken}`;
  }
  return id;
}


