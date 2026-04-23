import { MinusCircleIcon, PlusCircleIcon } from "lucide-react";
import type { JoinDraftGroup } from "@/components/dashboard-builder-panel.joins";
import type { JoinColumnState } from "@/components/dashboard-builder-panel.shared";
import {
  type SearchableSelectOption,
  SearchableSingleSelect,
} from "@/components/dashboard-builder-panel.searchable-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { JoinKind } from "@/lib/joins/graph";

export type DashboardBuilderJoinCardProps = {
  joinGroups: JoinDraftGroup[];
  detectedTableOptions: SearchableSelectOption[];
  columnStateByTable: Record<string, JoinColumnState>;
  isJoinBuilderEditable: boolean;
  onAddJoinGroup: () => void;
  onRemoveJoinGroup: (groupId: string) => void;
  onJoinGroupChange: (
    groupId: string,
    input: Partial<Pick<JoinDraftGroup, "leftTable" | "rightTable" | "type">>,
  ) => void;
  onAddJoinClause: (groupId: string) => void;
  onRemoveJoinClause: (groupId: string, clauseId: string) => void;
  onJoinClauseChange: (
    groupId: string,
    clauseId: string,
    input: Partial<{ leftColumn: string; rightColumn: string }>,
  ) => void;
  onLoadColumnsForTable: (tableName: string) => void;
};

export function DashboardBuilderJoinCard({
  joinGroups,
  detectedTableOptions,
  columnStateByTable,
  isJoinBuilderEditable,
  onAddJoinGroup,
  onRemoveJoinGroup,
  onJoinGroupChange,
  onAddJoinClause,
  onRemoveJoinClause,
  onJoinClauseChange,
  onLoadColumnsForTable,
}: DashboardBuilderJoinCardProps) {
  return (
    <Card className="bg-secondary/20">
      <CardHeader>
        <CardTitle className="text-sm">Table joins</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-foreground">
          Add joins now so dashboard filters can move cleanly across tables
          after creation.
        </p>

        {!isJoinBuilderEditable ? (
          <div className="rounded-md border border-dashed px-4 py-3 text-sm text-muted-foreground">
            Join setup is available in this builder only when all selected
            visuals use the same data source and SQL runtime. You can still
            create the dashboard now.
          </div>
        ) : (
          <>
            {joinGroups.length === 0 ? (
              <div className="rounded-md border border-dashed px-4 py-6 text-sm text-muted-foreground">
                No joins configured yet. Add one if these tables should filter
                each other.
              </div>
            ) : (
              <div className="space-y-4">
                {joinGroups.map((group, groupIndex) => {
                  const leftColumnState = group.leftTable
                    ? (columnStateByTable[group.leftTable] ?? {
                        status: "idle" as const,
                        columns: [],
                      })
                    : null;
                  const rightColumnState = group.rightTable
                    ? (columnStateByTable[group.rightTable] ?? {
                        status: "idle" as const,
                        columns: [],
                      })
                    : null;

                  const leftColumnOptions = (
                    leftColumnState?.columns ?? []
                  ).map((column) => ({
                    value: column,
                    label: column,
                  }));

                  const rightColumnOptions = (
                    rightColumnState?.columns ?? []
                  ).map((column) => ({
                    value: column,
                    label: column,
                  }));

                  return (
                    <div
                      key={group.id}
                      className="space-y-4 rounded-lg border bg-muted/20 p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium">
                            Join {groupIndex + 1}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Define the table pair and one or more ON clauses.
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => onRemoveJoinGroup(group.id)}
                        >
                          <MinusCircleIcon className="mr-1 h-4 w-4" />
                          Remove join
                        </Button>
                      </div>

                      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_minmax(0,1fr)]">
                        <div className="space-y-2">
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Left table
                          </p>
                          <SearchableSingleSelect
                            value={group.leftTable}
                            onChange={(value) =>
                              onJoinGroupChange(group.id, {
                                leftTable: value,
                              })
                            }
                            options={detectedTableOptions}
                            placeholder="Select table"
                            searchPlaceholder="Find table"
                            emptyLabel="No tables found"
                          />
                        </div>

                        <div className="space-y-2">
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Join type
                          </p>
                          <Select
                            value={group.type}
                            onValueChange={(value) =>
                              onJoinGroupChange(group.id, {
                                type: value as JoinKind,
                              })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="inner">Inner</SelectItem>
                              <SelectItem value="left">Left</SelectItem>
                              <SelectItem value="right">Right</SelectItem>
                              <SelectItem value="full">Full</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Right table
                          </p>
                          <SearchableSingleSelect
                            value={group.rightTable}
                            onChange={(value) =>
                              onJoinGroupChange(group.id, {
                                rightTable: value,
                              })
                            }
                            options={detectedTableOptions}
                            placeholder="Select table"
                            searchPlaceholder="Find table"
                            emptyLabel="No tables found"
                          />
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium">ON clauses</p>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => onAddJoinClause(group.id)}
                          >
                            <PlusCircleIcon className="mr-1 h-4 w-4" />
                            Add ON clause
                          </Button>
                        </div>

                        {group.clauses.map((clause, clauseIndex) => (
                          <div
                            key={clause.id}
                            className="grid gap-3 rounded-md border bg-background p-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto]"
                          >
                            <div className="space-y-2">
                              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                Left column
                              </p>
                              <SearchableSingleSelect
                                value={clause.leftColumn}
                                onChange={(value) =>
                                  onJoinClauseChange(group.id, clause.id, {
                                    leftColumn: value,
                                  })
                                }
                                options={leftColumnOptions}
                                placeholder={
                                  group.leftTable
                                    ? "Select column"
                                    : "Pick a table first"
                                }
                                searchPlaceholder="Find column"
                                emptyLabel={
                                  !group.leftTable
                                    ? "Select a table first"
                                    : leftColumnState?.status === "loading"
                                      ? "Loading columns..."
                                      : leftColumnState?.status === "error"
                                        ? (leftColumnState.error ??
                                          "Failed to load columns.")
                                        : "No columns found"
                                }
                                disabled={!group.leftTable}
                                onOpen={() => {
                                  onLoadColumnsForTable(group.leftTable);
                                }}
                              />
                            </div>

                            <div className="flex items-end justify-center pb-2 text-sm font-medium text-muted-foreground">
                              =
                            </div>

                            <div className="space-y-2">
                              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                Right column
                              </p>
                              <SearchableSingleSelect
                                value={clause.rightColumn}
                                onChange={(value) =>
                                  onJoinClauseChange(group.id, clause.id, {
                                    rightColumn: value,
                                  })
                                }
                                options={rightColumnOptions}
                                placeholder={
                                  group.rightTable
                                    ? "Select column"
                                    : "Pick a table first"
                                }
                                searchPlaceholder="Find column"
                                emptyLabel={
                                  !group.rightTable
                                    ? "Select a table first"
                                    : rightColumnState?.status === "loading"
                                      ? "Loading columns..."
                                      : rightColumnState?.status === "error"
                                        ? (rightColumnState.error ??
                                          "Failed to load columns.")
                                        : "No columns found"
                                }
                                disabled={!group.rightTable}
                                onOpen={() => {
                                  onLoadColumnsForTable(group.rightTable);
                                }}
                              />
                            </div>

                            <div className="flex items-end justify-end">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                                onClick={() =>
                                  onRemoveJoinClause(group.id, clause.id)
                                }
                              >
                                <MinusCircleIcon className="mr-1 h-4 w-4" />
                                {clauseIndex === 0 && group.clauses.length === 1
                                  ? "Clear"
                                  : "Remove"}
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onAddJoinGroup}
              >
                <PlusCircleIcon className="mr-1 h-4 w-4" />
                Add join
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
