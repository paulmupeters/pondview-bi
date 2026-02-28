import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { MetricCardSqlEditorProps } from "../types";

export function MetricCardSqlEditor({
  chart,
  expandedSqlChartId,
  onToggleSql,
  onSqlUpdate,
}: MetricCardSqlEditorProps) {
  const [editedSql, setEditedSql] = useState(chart.sql);
  const [isSaving, setIsSaving] = useState(false);
  const isExpanded = expandedSqlChartId === chart.id;

  useEffect(() => {
    if (isExpanded) {
      setEditedSql(chart.sql);
    }
  }, [isExpanded, chart.sql]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSqlUpdate(chart.id, editedSql);
      onToggleSql(chart.id);
    } catch (error) {
      console.error("Failed to save SQL:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setEditedSql(chart.sql);
    onToggleSql(chart.id);
  };

  return (
    <div className="flex flex-col gap-3">
      <label htmlFor={`sql-editor-${chart.id}`} className="text-sm font-medium">
        SQL Query
      </label>
      <textarea
        id={`sql-editor-${chart.id}`}
        value={editedSql}
        onChange={(e) => setEditedSql(e.target.value)}
        className="min-h-[200px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        placeholder="SELECT * FROM ..."
      />
      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleCancel}
          disabled={isSaving}
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={handleSave}
          disabled={isSaving || editedSql === chart.sql}
        >
          {isSaving ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  );
}
