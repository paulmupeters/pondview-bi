import type { JoinDefinition } from "@/lib/joins/graph";
import {
  exportDashboardArtifact,
  serializeDashboardArtifact,
  toProjectArtifactId,
} from "@/lib/project-artifacts/export";
import type {
  WorkspaceChart,
  WorkspaceDashboard,
  WorkspaceDashboardMeasure,
  WorkspaceDashboardSlicer,
} from "@/lib/workspace/workspace-db";
import {
  deleteOpenProjectFiles,
  getOpenProject,
  listOpenProjectFiles,
  replaceOpenProjectFiles,
} from "./index";

export type DashboardProjectArtifactSnapshot = {
  dashboard: WorkspaceDashboard;
  charts: WorkspaceChart[];
  measures: WorkspaceDashboardMeasure[];
  slicers: WorkspaceDashboardSlicer[];
  joins: JoinDefinition[];
};

function getDashboardArtifactId(dashboard: WorkspaceDashboard): string {
  if (dashboard.projectPath) {
    const normalizedPath = dashboard.projectPath.replace(/\\/g, "/");
    const segments = normalizedPath.split("/").filter(Boolean);
    const dashboardsIndex = segments.indexOf("dashboards");
    const artifactId = segments[dashboardsIndex + 1];
    if (artifactId?.trim()) {
      return artifactId.trim();
    }
  }

  return toProjectArtifactId(dashboard.title, "dashboard");
}

function getDashboardScopePath(input: {
  title: string;
  projectPath?: string | null;
}): string {
  if (input.projectPath?.trim()) {
    return input.projectPath.trim().replace(/\\/g, "/").replace(/\/+$/, "");
  }

  return `pondview/dashboards/${toProjectArtifactId(input.title, "dashboard")}`;
}

async function deleteProjectSubtree(scopePath: string): Promise<void> {
  const pathsToDelete = (await listOpenProjectFiles())
    .map((file) => file.path)
    .filter((path) => path === scopePath || path.startsWith(`${scopePath}/`));

  if (pathsToDelete.length > 0) {
    await deleteOpenProjectFiles(pathsToDelete);
  }
}

export async function syncDashboardProjectArtifact(
  snapshot: DashboardProjectArtifactSnapshot,
): Promise<{ projectPath: string } | null> {
  const project = await getOpenProject();
  if (!project) {
    return null;
  }

  const previousScopePath = snapshot.dashboard.projectPath?.trim() || null;
  const artifact = exportDashboardArtifact({
    dashboard: snapshot.dashboard,
    charts: snapshot.charts,
    measures: snapshot.measures,
    slicers: snapshot.slicers,
    joins: snapshot.joins,
    artifactId: getDashboardArtifactId(snapshot.dashboard),
    fallbackSourceRef: project.defaultSourceRef ?? null,
    requireSourceRefs: false,
  });

  if (previousScopePath && previousScopePath !== artifact.rootPath) {
    await deleteProjectSubtree(previousScopePath);
  }

  await replaceOpenProjectFiles(
    artifact.rootPath,
    serializeDashboardArtifact(artifact),
  );

  return { projectPath: artifact.rootPath };
}

export async function deleteDashboardProjectArtifact(input: {
  title: string;
  projectPath?: string | null;
}): Promise<void> {
  const project = await getOpenProject();
  if (!project) {
    return;
  }

  await deleteProjectSubtree(getDashboardScopePath(input));
}
