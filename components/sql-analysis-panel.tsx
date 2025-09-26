"use client";

import { useArtifact } from "@ai-sdk-tools/artifacts/client";
import { ExecuteSqlArtifact } from "@/ai/artifacts/execute-sql";
import { SqlResultsTable } from "@/components/sql-results-table";

export function SqlAnalysisPanel() {
  const sqlData = useArtifact(ExecuteSqlArtifact);

  if (!sqlData?.data) {
    return null;
  }

  return (
    <div className="space-y-6">
      <SqlResultsTable />
    </div>
  );
}