type ContextModuleLoader = () => Promise<string>;

const contextModules = import.meta.glob("/docs/datasource-context/*.md", {
  query: "?raw",
  import: "default",
}) as Record<string, ContextModuleLoader>;

function parseFrontmatter(content: string): { name?: string; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    return { body: content };
  }

  const frontmatter = match[1];
  const body = match[2];
  const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);

  return {
    name: nameMatch?.[1]?.trim(),
    body,
  };
}

async function loadAllContextEntries(): Promise<
  Array<{
    file: string;
    content: string;
    parsed: { name?: string; body: string };
  }>
> {
  const entries = await Promise.all(
    Object.entries(contextModules).map(async ([file, load]) => {
      const content = await load();
      return {
        file,
        content,
        parsed: parseFrontmatter(content),
      };
    }),
  );

  return entries.sort((left, right) => left.file.localeCompare(right.file));
}

export async function readDatasourceContext(
  datasource?: string,
): Promise<{ content: string; file?: string }> {
  const entries = await loadAllContextEntries();

  if (!entries.length) {
    return { content: "" };
  }

  if (datasource) {
    const normalizedDatasource = datasource.trim().toLowerCase();
    const match = entries.find(
      (entry) => entry.parsed.name?.toLowerCase() === normalizedDatasource,
    );

    if (!match) {
      return { content: "" };
    }

    return {
      content: match.content,
      file: match.file,
    };
  }

  return {
    content: entries.map((entry) => entry.content).join("\n\n---\n\n"),
  };
}
