import { describe, expect, test } from "bun:test";
import {
  buildAttachmentPlan,
  resolveAttachmentAlias,
} from "@/lib/duckdb/duckdb-attachments";

describe("resolveAttachmentAlias", () => {
  test("rewrites reserved aliases like main", () => {
    expect(
      resolveAttachmentAlias({
        alias: "main",
        identifier: "host=127.0.0.1 dbname=main",
      }),
    ).toBe("main_db");
  });

  test("rewrites reserved aliases like system", () => {
    expect(
      resolveAttachmentAlias({
        alias: "system",
        identifier: "host=127.0.0.1 dbname=system",
      }),
    ).toBe("system_db");
  });

  test("preserves ordinary aliases", () => {
    expect(
      resolveAttachmentAlias({
        alias: "motherduck",
        identifier: "md:my_db",
      }),
    ).toBe("motherduck");
  });
});

describe("buildAttachmentPlan", () => {
  test("builds MotherDuck attachment statements", () => {
    const plan = buildAttachmentPlan({
      type: "motherduck",
      identifier: "md:my_db",
      alias: "motherduck",
      readOnly: false,
      duckdbExtension: "motherduck",
    });

    expect(plan.alias).toBe("motherduck");
    expect(plan.statements).toEqual([
      "INSTALL motherduck;",
      "LOAD motherduck;",
      `ATTACH 'md:my_db' AS "motherduck";`,
    ]);
  });

  test("loads httpfs for remote DuckDB attachments on native runtimes", () => {
    const plan = buildAttachmentPlan({
      type: "duckdb_remote",
      identifier: "s3://bucket/warehouse.duckdb",
      alias: "warehouse",
      readOnly: true,
    });

    expect(plan.alias).toBe("warehouse");
    expect(plan.statements).toEqual([
      "INSTALL httpfs;",
      "LOAD httpfs;",
      `ATTACH 's3://bucket/warehouse.duckdb' AS "warehouse" (READ_ONLY);`,
    ]);
  });

  test("can skip extension loading for remote DuckDB attachments in WASM", () => {
    const plan = buildAttachmentPlan(
      {
        type: "duckdb_remote",
        identifier: "https://example.com/warehouse.duckdb",
        alias: "warehouse",
        readOnly: true,
      },
      { skipExtensionLoad: true },
    );

    expect(plan.statements).toEqual([
      `ATTACH 'https://example.com/warehouse.duckdb' AS "warehouse" (READ_ONLY);`,
    ]);
  });

  test("builds Quack attachment statements from nightly extension", () => {
    const plan = buildAttachmentPlan({
      type: "quack",
      identifier: "quack:localhost:9494",
      alias: "analytics",
      readOnly: false,
      duckdbExtension: "quack",
      duckdbExtensionRepository: "core_nightly",
      attachOptions: {
        type: "quack",
        token: "secret-token",
        disableSsl: true,
      },
    });

    expect(plan.alias).toBe("analytics");
    expect(plan.statements).toEqual([
      "INSTALL quack FROM core_nightly;",
      "LOAD quack;",
      `ATTACH 'quack:localhost:9494' AS "analytics" (TYPE quack, TOKEN 'secret-token', DISABLE_SSL true);`,
    ]);
  });
});
