import { describe, expect, test } from "bun:test";
import { createSqlCodeEditorKeyBindings } from "@/components/sql-code-editor";

describe("createSqlCodeEditorKeyBindings", () => {
  test("uses Shift+Enter to run queries", () => {
    const bindings = createSqlCodeEditorKeyBindings({
      onRunQuery: () => {},
    });

    expect(bindings.map((binding) => binding.key)).toContain("Shift-Enter");
    expect(bindings.map((binding) => binding.key)).not.toContain("Enter");
  });

  test("keeps navigation and escape bindings when handlers are present", () => {
    const bindings = createSqlCodeEditorKeyBindings({
      onCancel: () => {},
      onHistoryPrev: () => {},
      onHistoryNext: () => {},
    });

    expect(bindings.map((binding) => binding.key)).toEqual([
      "Escape",
      "ArrowUp",
      "ArrowDown",
    ]);
  });
});
