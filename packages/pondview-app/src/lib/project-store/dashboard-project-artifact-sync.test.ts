import { describe, expect, test } from "bun:test";
import { findDashboardProjectPathByManifestId } from "@/lib/project-store/dashboard-project-artifact-sync";

describe("dashboard project artifact paths", () => {
  test("finds an existing dashboard folder by manifest id", () => {
    expect(
      findDashboardProjectPathByManifestId(
        [
          {
            path: "pondview/dashboards/products/dashboard.json",
            content: JSON.stringify({
              schemaVersion: 1,
              id: "dashboard-products",
              title: "Products",
              measures: [],
              visuals: [],
            }),
          },
          {
            path: "pondview/dashboards/broken/dashboard.json",
            content: "{",
          },
        ],
        "dashboard-products",
      ),
    ).toBe("pondview/dashboards/products");
  });

  test("returns null when no dashboard manifest id matches", () => {
    expect(
      findDashboardProjectPathByManifestId(
        [
          {
            path: "pondview/dashboards/products/dashboard.json",
            content: JSON.stringify({
              schemaVersion: 1,
              id: "dashboard-products",
              title: "Products",
              measures: [],
              visuals: [],
            }),
          },
        ],
        "dashboard-orders",
      ),
    ).toBeNull();
  });
});
