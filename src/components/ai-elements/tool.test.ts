import { describe, expect, test } from "bun:test";
import { formatJsonBlockContent } from "@/components/ai-elements/tool";

describe("formatJsonBlockContent", () => {
  test("pretty prints objects and arrays", () => {
    expect(
      formatJsonBlockContent({
        name: "orders",
        columns: ["id", "amount"],
      }),
    ).toBe(
      '{\n  "name": "orders",\n  "columns": [\n    "id",\n    "amount"\n  ]\n}',
    );
  });

  test("returns strings verbatim", () => {
    expect(formatJsonBlockContent('{\n  "raw": true\n}')).toBe(
      '{\n  "raw": true\n}',
    );
  });

  test("renders escaped newlines in strings", () => {
    expect(formatJsonBlockContent("first line\\nsecond line")).toBe(
      "first line\nsecond line",
    );
  });

  test("falls back to String when stringify throws", () => {
    const circular: { self?: unknown } = {};
    circular.self = circular;

    expect(formatJsonBlockContent(circular)).toBe("[object Object]");
  });
});
