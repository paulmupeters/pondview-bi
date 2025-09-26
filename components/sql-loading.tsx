"use client";

import { useArtifact } from "@ai-sdk-tools/artifacts/client";
import { ExecuteSqlArtifact } from "@/ai/artifacts/execute-sql";

export function SqlLoading() {
  const sqlData = useArtifact(ExecuteSqlArtifact);

  if (!sqlData?.data || sqlData.data.stage === "complete") {
    return null;
  }

  const getStageText = (stage: string) => {
    switch (stage) {
      case "loading":
        return "Preparing SQL query...";
      case "processing":
        return "Executing query...";
      case "analyzing":
        return "Processing results...";
      default:
        return "Executing SQL...";
    }
  };

  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-500">{getStageText(sqlData.data.stage)}</p>
        {sqlData.data.progress > 0 && (
          <div className="mt-2 w-48 mx-auto">
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${sqlData.data.progress * 100}%` }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">
              {Math.round(sqlData.data.progress * 100)}%
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
