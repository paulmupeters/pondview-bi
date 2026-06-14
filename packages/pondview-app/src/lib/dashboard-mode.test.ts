import { describe, expect, test } from "bun:test";
import {
  DASHBOARD_MODE_SESSION_KEY,
  resolveDashboardMode,
  resolveDashboardModeState,
  searchEnablesDashboardMode,
  searchEnablesDashboardPreview,
} from "@/lib/dashboard-mode";

function createStorage(initialValue: string | null = null) {
  const values = new Map<string, string>();
  if (initialValue !== null) {
    values.set(DASHBOARD_MODE_SESSION_KEY, initialValue);
  }

  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

describe("dashboard mode", () => {
  test("detects the CLI dashboard mode query parameter", () => {
    expect(searchEnablesDashboardMode("?pondviewMode=dashboard")).toBe(true);
    expect(searchEnablesDashboardMode("?pondviewMode=app")).toBe(false);
  });

  test("detects the dashboard preview query parameter", () => {
    expect(
      searchEnablesDashboardPreview("?pondviewMode=dashboard-preview"),
    ).toBe(true);
    expect(searchEnablesDashboardPreview("?pondviewMode=dashboard")).toBe(
      false,
    );
  });

  test("persists dashboard mode in session storage", () => {
    const storage = createStorage();

    expect(resolveDashboardMode("?pondviewMode=dashboard", storage)).toBe(true);
    expect(storage.getItem(DASHBOARD_MODE_SESSION_KEY)).toBe("true");
    expect(resolveDashboardMode("", storage)).toBe(true);
  });

  test("keeps dashboard preview temporary", () => {
    const storage = createStorage();

    expect(
      resolveDashboardModeState("?pondviewMode=dashboard-preview", storage),
    ).toEqual({
      enabled: true,
      locked: false,
      preview: true,
    });
    expect(storage.getItem(DASHBOARD_MODE_SESSION_KEY)).toBeNull();
    expect(resolveDashboardMode("", storage)).toBe(false);
  });

  test("keeps locked dashboard mode non-exitable", () => {
    expect(
      resolveDashboardModeState(
        "?pondviewMode=dashboard-preview",
        createStorage("true"),
      ),
    ).toEqual({
      enabled: true,
      locked: true,
      preview: false,
    });
  });

  test("stays disabled without a query parameter or session value", () => {
    expect(resolveDashboardMode("", createStorage())).toBe(false);
  });
});
