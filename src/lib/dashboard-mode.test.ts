import { describe, expect, test } from "bun:test";
import {
  DASHBOARD_MODE_SESSION_KEY,
  resolveDashboardMode,
  searchEnablesDashboardMode,
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

  test("persists dashboard mode in session storage", () => {
    const storage = createStorage();

    expect(resolveDashboardMode("?pondviewMode=dashboard", storage)).toBe(true);
    expect(storage.getItem(DASHBOARD_MODE_SESSION_KEY)).toBe("true");
    expect(resolveDashboardMode("", storage)).toBe(true);
  });

  test("stays disabled without a query parameter or session value", () => {
    expect(resolveDashboardMode("", createStorage())).toBe(false);
  });
});
