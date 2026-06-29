import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { App, isDashboardModeRoutePath } from "@/vite/App";

describe("App dashboard mode", () => {
  test("only allows dashboard routes", () => {
    expect(isDashboardModeRoutePath("/dashboards")).toBe(true);
    expect(isDashboardModeRoutePath("/dashboards/view")).toBe(true);
    expect(isDashboardModeRoutePath("/visual/example")).toBe(true);
    expect(isDashboardModeRoutePath("/settings")).toBe(false);
    expect(isDashboardModeRoutePath("/sql-editor")).toBe(false);
  });

  test("omits app navigation chrome in dashboard mode", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/dashboards?pondviewMode=dashboard"]}>
        <App />
      </MemoryRouter>,
    );

    expect(markup).toContain("Dashboards");
    expect(markup).not.toContain("Exit preview");
    expect(markup).not.toContain('aria-label="Settings"');
    expect(markup).not.toContain('aria-label="History"');
  });

  test("allows leaving dashboard preview mode", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter
        initialEntries={["/dashboards?pondviewMode=dashboard-preview"]}
      >
        <App />
      </MemoryRouter>,
    );

    expect(markup).toContain("Dashboards");
    expect(markup).toContain("Exit preview");
    expect(markup).not.toContain('aria-label="Settings"');
    expect(markup).not.toContain('aria-label="History"');
  });

  test("omits app navigation chrome on standalone visual routes in dashboard mode", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/visual/example?pondviewMode=dashboard"]}>
        <App />
      </MemoryRouter>,
    );

    expect(markup).not.toContain('aria-label="Settings"');
    expect(markup).not.toContain('aria-label="History"');
  });
});
