import { describe, expect, test } from "bun:test";
import {
  DASHBOARD_BUILDER_DIALOG_BODY_CLASS,
  DASHBOARD_BUILDER_DIALOG_CONTENT_CLASS,
} from "@/features/analysis/dashboard-builder-dialog-layout";

describe("AnalysisWorkspace dialog layout", () => {
  test("uses a constrained, overflow-hidden dialog shell for the dashboard builder", () => {
    const classList = DASHBOARD_BUILDER_DIALOG_CONTENT_CLASS.split(/\s+/);
    expect(classList).toContain("overflow-hidden");
    expect(classList).toContain("p-0");
    expect(classList).toContain("flex-col");
    expect(classList).toContain("h-[85vh]");
  });

  test("uses a flex body wrapper so the panel can scroll within the dialog", () => {
    const classList = DASHBOARD_BUILDER_DIALOG_BODY_CLASS.split(/\s+/);
    expect(classList).toContain("flex");
    expect(classList).toContain("min-h-0");
    expect(classList).toContain("flex-1");
  });
});
