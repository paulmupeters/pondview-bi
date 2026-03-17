import { describe, expect, test } from "bun:test";
import { buildExplorerTableReference } from "@/lib/duckdb/table-reference";

describe("buildExplorerTableReference", () => {
  test("keeps local main tables short when no catalog is needed", () => {
    expect(
      buildExplorerTableReference({
        schema: "main",
        table: "unicorns",
      }),
    ).toBe("unicorns");
  });

  test("keeps non-main schemas qualified without a catalog", () => {
    expect(
      buildExplorerTableReference({
        schema: "analytics",
        table: "events",
      }),
    ).toBe("analytics.events");
  });

  test("fully qualifies attached tables when a catalog should be included", () => {
    expect(
      buildExplorerTableReference({
        catalog: "motherduck",
        schema: "main",
        table: "unicorns",
        includeCatalog: true,
      }),
    ).toBe("motherduck.main.unicorns");
  });
});
