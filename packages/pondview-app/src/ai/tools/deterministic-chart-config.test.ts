import { describe, expect, test } from "bun:test";
import {
  buildDeterministicChartConfig,
  repairChartAxisMapping,
} from "./deterministic-chart-config";

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

  test("keeps a numeric year dimension on X when the measure is also numeric", () => {
    const config = buildDeterministicChartConfig({
      userQuery: "Unicorns by year",
      rows: [
        { year: 2018, unicorn_count: 10 },
        { year: 2019, unicorn_count: 16 },
      ],
    });

    expect(config).toMatchObject({
      type: "line",
      xKey: "year",
      yKeys: ["unicorn_count"],
    });
  });

  test("repairs a model that puts an aggregate on X", () => {
    const config = repairChartAxisMapping(
      {
        visualType: "chart",
        title: "Unicorns by year",
        description: "",
        type: "bar",
        xKey: "unicorn_count",
        yKeys: ["year"],
        multipleLines: false,
        legend: false,
        countMode: false,
      },
      [
        { year: 2018, unicorn_count: 10 },
        { year: 2019, unicorn_count: 16 },
      ],
    );

    expect(config).toMatchObject({
      xKey: "year",
      yKeys: ["unicorn_count"],
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
