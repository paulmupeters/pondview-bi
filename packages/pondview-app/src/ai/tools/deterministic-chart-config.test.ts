import { describe, expect, test } from "bun:test";
import { buildDeterministicChartConfig } from "./deterministic-chart-config";

describe("buildDeterministicChartConfig", () => {
  test("builds a bar chart from a dimension and numeric measure", () => {
    const config = buildDeterministicChartConfig({
      userQuery: "Revenue by country",
      rows: [
        { country: "NL", revenue: 120 },
        { country: "US", revenue: 240 },
      ],
    });

    expect(config).toMatchObject({
      visualType: "chart",
      type: "bar",
      title: "Revenue by country",
      xKey: "country",
      yKeys: ["revenue"],
      countMode: false,
    });
  });

  test("uses a line chart for temporal dimensions", () => {
    const config = buildDeterministicChartConfig({
      userQuery: "Monthly signups",
      rows: [
        { month: "2026-01", signups: "10" },
        { month: "2026-02", signups: "16" },
      ],
    });

    expect(config).toMatchObject({
      type: "line",
      xKey: "month",
      yKeys: ["signups"],
      showDots: true,
    });
  });

  test("returns null when there is no numeric measure", () => {
    const config = buildDeterministicChartConfig({
      userQuery: "Countries",
      rows: [{ country: "NL", segment: "Enterprise" }],
    });

    expect(config).toBeNull();
  });
});
