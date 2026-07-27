import { migrateLegacySavedSqlQueriesToProject } from "./saved-sql-queries-repo";
import { migrateLegacyDraftSqlQueriesToProject } from "./sql-editor-drafts-repo";

export async function migrateLegacySqlQueryStateToProject(
  projectId: string,
): Promise<void> {
  await Promise.all([
    migrateLegacySavedSqlQueriesToProject(projectId),
    migrateLegacyDraftSqlQueriesToProject(projectId),
  ]);
}
