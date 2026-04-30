import type { UIMessage } from "@ai-sdk/react";
import { DashboardBuilderJoinCard } from "@/components/dashboard-builder-panel.joins-card";
import { SelectedVisualsSection } from "@/components/dashboard-builder-panel.visuals";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDashboardBuilder } from "@/components/use-dashboard-builder";
import type { SqlBackend } from "@/lib/sql/sql-runtime";

export { resolveStoredChartDbIdentifier } from "@/components/dashboard-builder-panel.shared";

type DashboardBuilderPanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messages: UIMessage[];
  selectedDbIdentifier?: string;
  selectedSqlBackend?: SqlBackend;
};

export function DashboardBuilderPanel({
  open,
  onOpenChange,
  messages,
  selectedDbIdentifier,
  selectedSqlBackend,
}: DashboardBuilderPanelProps) {
  const {
    dashboardTitle,
    setDashboardTitle,
    joinGroups,
    columnStateByTable,
    isSaving,
    error,
    visualSnapshots,
    selectedCharts,
    removedCharts,
    detectedTableOptions,
    shouldShowJoinBuilder,
    isJoinBuilderEditable,
    handleRemoveChart,
    handleRestoreChart,
    handleAddJoinGroup,
    handleRemoveJoinGroup,
    handleJoinGroupChange,
    handleJoinClauseChange,
    handleAddJoinClause,
    handleRemoveJoinClause,
    handleCreateDashboard,
    loadColumnsForTable,
  } = useDashboardBuilder({
    open,
    onOpenChange,
    messages,
    selectedDbIdentifier,
    selectedSqlBackend,
  });

  return (
    <div className="flex h-full min-h-0 min-w-0 w-full flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto pr-2">
        <div className="min-w-0 space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Generate dashboard</h2>
            <p className="text-sm text-muted-foreground">
              Select the visuals you'd like to include and give the dashboard a
              title.
            </p>
          </div>

          <div className="space-y-3">
            <label className="text-sm font-medium" htmlFor="dashboard-title">
              Dashboard title
            </label>
            <Input
              id="dashboard-title"
              value={dashboardTitle}
              onChange={(event) => setDashboardTitle(event.target.value)}
              placeholder="e.g. Weekly revenue overview"
            />
          </div>

          {shouldShowJoinBuilder && (
            <DashboardBuilderJoinCard
              joinGroups={joinGroups}
              detectedTableOptions={detectedTableOptions}
              columnStateByTable={columnStateByTable}
              isJoinBuilderEditable={isJoinBuilderEditable}
              onAddJoinGroup={handleAddJoinGroup}
              onRemoveJoinGroup={handleRemoveJoinGroup}
              onJoinGroupChange={handleJoinGroupChange}
              onAddJoinClause={handleAddJoinClause}
              onRemoveJoinClause={handleRemoveJoinClause}
              onJoinClauseChange={handleJoinClauseChange}
              onLoadColumnsForTable={(tableName) => {
                void loadColumnsForTable(tableName);
              }}
            />
          )}

          <SelectedVisualsSection
            visualSnapshots={visualSnapshots}
            selectedCharts={selectedCharts}
            removedCharts={removedCharts}
            onRemoveChart={handleRemoveChart}
            onRestoreChart={handleRestoreChart}
          />
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-md border border-destructive px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={isSaving}
        >
          Cancel
        </Button>
        <Button
          type="button"
          onClick={handleCreateDashboard}
          disabled={isSaving || selectedCharts.length === 0}
        >
          {isSaving ? "Creating…" : "Create dashboard"}
        </Button>
      </div>
    </div>
  );
}
