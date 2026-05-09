import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DashboardHeader } from "./DashboardHeader";

const dashboard = {
  id: "dashboard_1",
  title: "Revenue",
  createdAt: 1,
  updatedAt: 2,
};

describe("DashboardHeader", () => {
  test("hides title editing controls when read-only", () => {
    const markup = renderToStaticMarkup(
      <DashboardHeader
        dashboard={dashboard}
        onTitleUpdate={async () => undefined}
        readOnly
      />,
    );

    expect(markup).toContain("Revenue");
    expect(markup).not.toContain("Edit dashboard title");
  });

  test("shows title editing controls by default", () => {
    const markup = renderToStaticMarkup(
      <DashboardHeader
        dashboard={dashboard}
        onTitleUpdate={async () => undefined}
      />,
    );

    expect(markup).toContain("Edit dashboard title");
  });
});
