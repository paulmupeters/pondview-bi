export function resolveDbPath(dbIdentifier: string): string {
  const id = (dbIdentifier ?? "").trim();
  if (!id) return ":memory:";
  if (id.startsWith("md:")) {
    const hasToken = /motherduck_token=/i.test(id);
    if (hasToken) return id;
    const token = process.env.MOTHERDUCK_TOKEN ?? "";
    const separator = id.includes("?") ? "&" : "?";
    return `${id}${separator}motherduck_token=${token}`;
  }
  return id;
}


