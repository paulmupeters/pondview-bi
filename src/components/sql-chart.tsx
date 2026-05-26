import { Pencil } from "lucide-react";
import { useCallback } from "react";
import { DynamicChart } from "@/components/dynamic-chart";
import { useInlineTextEdit } from "@/components/hooks/use-inline-text-edit";
import type { Config, Result } from "@/lib/types";

export function SqlChart({
  customChartConfig,
  dataOverride,
  onTitleChange,
  onDescriptionChange,
}: {
  customChartConfig?: Config;
  dataOverride?: {
    stage?: "loading" | "processing" | "analyzing" | "visualizing" | "complete";
    rows: Result[];
    chartConfig?: Config;
    summary?: {
      totalRows: number;
      executionTimeMs?: number;
      insights: string[];
      queryType?: string;
    };
  };
  onTitleChange?: (value: string) => void;
  onDescriptionChange?: (value: string) => void;
}) {
  const payload = dataOverride; // parent supplies data; avoid extra subscription
  const isComplete = payload?.stage === "complete";
  const rows = payload?.rows ?? [];
  const chartConfig = payload?.chartConfig;
  const summary = payload?.summary;
  const effectiveChartConfig = customChartConfig || chartConfig;
  const title = effectiveChartConfig?.title ?? "";
  const description = effectiveChartConfig?.description ?? "";
  const insights = (summary?.insights ?? []).filter(Boolean);
  type EditableField = "title" | "description";

  const canEditTitle = typeof onTitleChange === "function";
  const canEditDescription = typeof onDescriptionChange === "function";

  const getFieldValue = useCallback(
    (field: EditableField) => {
      switch (field) {
        case "title":
          return title;
        case "description":
          return description;
      }
    },
    [description, title],
  );

  const handleFieldCommit = useCallback(
    (field: EditableField, value: string) => {
      if (field === "title") {
        onTitleChange?.(value);
      } else {
        onDescriptionChange?.(value);
      }
    },
    [onDescriptionChange, onTitleChange],
  );

  const {
    editingField,
    draftValue,
    setDraftValue,
    inputRef,
    startEditing,
    handleInputBlur,
    handleInputKeyDown,
  } = useInlineTextEdit<EditableField>({
    getValue: getFieldValue,
    onCommit: handleFieldCommit,
  });

  const handleStartEditing = (field: EditableField) => {
    const canEditField =
      (field === "title" && canEditTitle) ||
      (field === "description" && canEditDescription);
    if (!canEditField) {
      return;
    }
    startEditing(field);
  };

  if (!isComplete) {
    return null;
  }

  if (!effectiveChartConfig || !rows.length) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        No chart data available
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <div className="group/title flex items-center gap-2">
        {editingField === "title" ? (
          <input
            ref={inputRef}
            type="text"
            className="w-full bg-background border border-input rounded px-2 py-1.5 text-lg font-bold focus:outline-none focus:border-primary"
            value={draftValue}
            onChange={(event) => setDraftValue(event.target.value)}
            onBlur={handleInputBlur}
            onKeyDown={handleInputKeyDown}
          />
        ) : (
          <>
            <h2 className="text-lg font-bold">{title || "Chart"}</h2>
            {canEditTitle && (
              <button
                type="button"
                className="text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/title:opacity-100 focus-visible:opacity-100"
                onClick={() => handleStartEditing("title")}
                aria-label="Edit chart title"
              >
                <Pencil className="h-4 w-4" />
              </button>
            )}
          </>
        )}
      </div>

      {/* Chart */}
      <div className="w-full">
        <DynamicChart
          chartData={rows}
          chartConfig={effectiveChartConfig as Config}
          showMetadata={false}
        />
      </div>

      {/* Description + insights */}
      {(description || insights.length > 0 || canEditDescription) && (
        <div className="space-y-3">
          {(description || canEditDescription) && (
            <div className="group/description rounded-md border bg-muted/10 p-3">
              <div className="flex items-start gap-2">
                {editingField === "description" ? (
                  <input
                    ref={inputRef}
                    type="text"
                    className="w-full bg-background border border-input rounded px-2 py-1.5 text-sm focus:outline-none focus:border-primary"
                    value={draftValue}
                    onChange={(event) => setDraftValue(event.target.value)}
                    onBlur={handleInputBlur}
                    onKeyDown={handleInputKeyDown}
                    placeholder="Add a description"
                  />
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">
                      {description || "Add a description"}
                    </p>
                    {canEditDescription && (
                      <button
                        type="button"
                        className="mt-0.5 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/description:opacity-100 focus-visible:opacity-100"
                        onClick={() => handleStartEditing("description")}
                        aria-label="Edit chart description"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {insights.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-medium">Insights</h4>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {insights.map((insight, index) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: we need to use the index as a key
                  <li key={index} className="flex items-start gap-2">
                    <span className="w-1 h-1 rounded-full bg-primary mt-2 shrink-0" />
                    {insight}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
