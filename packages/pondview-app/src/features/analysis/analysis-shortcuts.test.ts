import { describe, expect, test } from "bun:test";
import {
  getAnalysisShortcutLabel,
  matchAnalysisShortcut,
} from "@/features/analysis/analysis-shortcuts";

describe("analysis shortcuts", () => {
  test("uses platform-specific labels in the toolbar", () => {
    expect(getAnalysisShortcutLabel("toggleExplorer", "other")).toBe(
      "Alt+Shift+E",
    );
    expect(getAnalysisShortcutLabel("createDashboard", "other")).toBe(
      "Alt+Shift+D",
    );
    expect(getAnalysisShortcutLabel("toggleExplorer", "mac")).toBe(
      "\u2318\u21e7E",
    );
    expect(getAnalysisShortcutLabel("createDashboard", "mac")).toBe(
      "\u2318\u21e7I",
    );
  });

  test("matches the non-mac explorer shortcut", () => {
    expect(
      matchAnalysisShortcut(
        {
          key: "E",
          altKey: true,
          shiftKey: true,
          ctrlKey: false,
          metaKey: false,
          repeat: false,
          defaultPrevented: false,
          target: null,
        },
        "other",
      ),
    ).toBe("toggleExplorer");
  });

  test("matches the non-mac dashboard shortcut", () => {
    expect(
      matchAnalysisShortcut(
        {
          key: "d",
          altKey: true,
          shiftKey: true,
          ctrlKey: false,
          metaKey: false,
          repeat: false,
          defaultPrevented: false,
          target: null,
        },
        "other",
      ),
    ).toBe("createDashboard");
  });

  test("matches the mac shortcuts", () => {
    expect(
      matchAnalysisShortcut(
        {
          key: "E",
          altKey: false,
          shiftKey: true,
          ctrlKey: false,
          metaKey: true,
          repeat: false,
          defaultPrevented: false,
          target: null,
        },
        "mac",
      ),
    ).toBe("toggleExplorer");

    expect(
      matchAnalysisShortcut(
        {
          key: "i",
          altKey: false,
          shiftKey: true,
          ctrlKey: false,
          metaKey: true,
          repeat: false,
          defaultPrevented: false,
          target: null,
        },
        "mac",
      ),
    ).toBe("createDashboard");
  });

  test("ignores the wrong modifier combinations for each platform", () => {
    expect(
      matchAnalysisShortcut(
        {
          key: "e",
          altKey: false,
          shiftKey: true,
          ctrlKey: false,
          metaKey: true,
          repeat: false,
          defaultPrevented: false,
          target: null,
        },
        "other",
      ),
    ).toBeNull();

    expect(
      matchAnalysisShortcut(
        {
          key: "d",
          altKey: true,
          shiftKey: true,
          ctrlKey: false,
          metaKey: false,
          repeat: false,
          defaultPrevented: false,
          target: null,
        },
        "mac",
      ),
    ).toBeNull();
  });
});
