import { join } from "node:path";
import type { NextRequest } from "next/server";
import { loadModelsFromDirectory } from "@/../semantic-layer/model-loader";
import { listChartsByDashboard } from "@/lib/repositories/dashboard";
import type { AvailableDimension } from "@/lib/types/filters";
import type { DataModel } from "@/../semantic-layer/types";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ dashboardId: string }> },
) {
  try {
    const { dashboardId } = await params;

    // Get charts for this dashboard
    const charts = await listChartsByDashboard(dashboardId);

    // Extract unique explore names where semantic metadata exists
    const exploreNames = new Set(
      charts.map((c) => c.exploreName).filter((name): name is string => !!name),
    );

    if (exploreNames.size === 0) {
      return Response.json({
        dimensions: [],
        conformGroups: {},
        message:
          "No charts with semantic layer metadata found. Charts must use the semantic layer to enable filtering.",
      });
    }

    // Load models
    const modelsDir = join(process.cwd(), "semantic-layer", "models");
    let dataModel: DataModel;
    try {
      dataModel = loadModelsFromDirectory(modelsDir);
    } catch (error) {
      console.error("[Dimensions API] Failed to load models:", error);
      return Response.json(
        {
          error: "Failed to load semantic layer models",
          details: error instanceof Error ? error.message : String(error),
        },
        { status: 500 },
      );
    }

    // Build available dimensions
    const availableDimensions: AvailableDimension[] = [];

    for (const exploreName of exploreNames) {
      const explore = dataModel.explores.find((e) => e.name === exploreName);
      if (!explore) {
        console.warn(
          `[Dimensions API] Explore "${exploreName}" not found in models`,
        );
        continue;
      }
      for (const dim of explore.dimensions) {
        availableDimensions.push({
          exploreName: explore.name,
          field: `${explore.name}.${dim.name}`,
          displayName: formatDisplayName(dim.name),
          type: dim.type,
          conformKey: dim.conformKey,
        });
      }
    }

    // Group by conform key
    const conformGroups = new Map<string, AvailableDimension[]>();
    for (const dim of availableDimensions) {
      if (dim.conformKey) {
        const group = conformGroups.get(dim.conformKey) || [];
        group.push(dim);
        conformGroups.set(dim.conformKey, group);
      }
    }
    const conformGroupsObj = Object.fromEntries(conformGroups);

    return Response.json({
      dimensions: availableDimensions,
      conformGroups: conformGroupsObj,
    });
  } catch (error) {
    console.error("[Dimensions API] Unexpected error:", error);
    return Response.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

function formatDisplayName(fieldName: string): string {
  return fieldName.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}
