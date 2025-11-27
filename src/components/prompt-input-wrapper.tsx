"use client";

import {
  ChatBubbleLeftRightIcon,
  GlobeEuropeAfricaIcon,
  PaperClipIcon,
  Squares2X2Icon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";
import type { ChatStatus } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import {
  PromptInput,
  PromptInputAttachment,
  PromptInputAttachments,
  PromptInputBody,
  PromptInputButton,
  PromptInputCommand,
  PromptInputCommandEmpty,
  PromptInputCommandGroup,
  PromptInputCommandInput,
  PromptInputCommandItem,
  PromptInputCommandList,
  PromptInputCommandSeparator,
  PromptInputHeader,
  PromptInputHoverCard,
  PromptInputHoverCardContent,
  PromptInputHoverCardTrigger,
  PromptInputTextarea,
  usePromptInputAttachments,
} from "@/components/ai-elements/prompt-input";
import { ChartConfigDialog } from "@/components/chart-config-dialog";
import { ConnectedDataPanel } from "@/components/connected-data-panel";
import { DuckdbRepl } from "@/components/duckdb-shell/repl";
import type { SqlAnalysisData } from "@/components/sql-analysis-display.types";
import { SqlChart } from "@/components/sql-chart";
import type { SqlConsoleApi } from "@/components/sql-console";
import { SqlResultsTable } from "@/components/sql-results-table";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useConnectedTables } from "@/hooks/use-connected-tables";
import { useMaterializedTables } from "@/hooks/use-materialized-tables";
import { useUploadedFiles } from "@/hooks/use-uploaded-files";
import { isMaterializedTableIdentifier } from "@/lib/duckdb/materialized-tables";
import type { Config, Result } from "@/lib/types";
import { cn } from "@/lib/utils";

export type PromptMode = "ai" | "manual";

interface PromptInputWrapperProps {
  onSubmit: (message: PromptInputMessage) => void;
  onRunSql?: (params: {
    sql: string;
    dbIdentifier?: string;
    signal: AbortSignal;
  }) => Promise<{
    rows: Record<string, unknown>[];
    columns?: { name: string; type?: string }[];
  }>;
  onAddSqlResultToChat?: (payload: SqlAnalysisData) => void;
  placeholder?: string;
  className?: string;
  status?: ChatStatus;
  onHomePage?: boolean;
  onCreateDashboard?: () => void;
  onAddVisual?: () => void;
  mode?: PromptMode;
  onModeChange?: (mode: PromptMode) => void;
  pendingMode?: PromptMode | null;
}

// Inner component that uses the attachments hook within PromptInput context
function FileAttachmentHoverCard() {
  const uploadedFiles = useUploadedFiles();
  const attachments = usePromptInputAttachments();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(
    new Set(),
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Filter uploaded files based on search query
  const filteredFiles = uploadedFiles.filter((file) =>
    file.originalName.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // Handle adding an uploaded file as attachment
  const handleAddUploadedFile = async (file: (typeof uploadedFiles)[0]) => {
    try {
      // Fetch the file from the server
      const response = await fetch(`/api/upload/${file.fileId}`);
      if (!response.ok) {
        throw new Error("Failed to fetch file");
      }

      const blob = await response.blob();
      const fileObj = new File([blob], file.originalName, { type: file.type });

      // Add to attachments
      attachments.add([fileObj]);
      setSelectedFileIds((prev) => new Set([...prev, file.fileId]));
    } catch (error) {
      console.error("Failed to add file:", error);
    }
  };

  // Handle uploading a new file
  const handleUploadNewFile = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validExtensions = [".csv", ".xlsx", ".xls", ".parquet"];
    const fileExtension = file.name
      .toLowerCase()
      .substring(file.name.lastIndexOf("."));
    if (!validExtensions.includes(fileExtension)) {
      alert("Invalid file type. Please upload a CSV, XLSX, or Parquet file.");
      return;
    }

    // Validate file size (max 50MB)
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      alert("File size exceeds 50MB. Please choose a smaller file.");
      return;
    }

    try {
      const uploadFormData = new FormData();
      uploadFormData.append("file", file);

      const uploadResponse = await fetch("/api/upload", {
        method: "POST",
        body: uploadFormData,
      });

      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json();
        throw new Error(errorData.error || "Failed to upload file");
      }

      const uploadData = await uploadResponse.json();

      // Import and save to localStorage
      const { appendUploadedFile } = await import("@/lib/uploaded-files");
      appendUploadedFile({
        fileId: uploadData.fileId,
        fileName: uploadData.fileName,
        originalName: file.name,
        filePath: uploadData.filePath,
        size: file.size,
        type: file.type || "application/octet-stream",
        uploadedAt: new Date().toISOString(),
      });

      // Also add as attachment
      attachments.add([file]);
    } catch (error) {
      console.error("File upload error:", error);
      alert(error instanceof Error ? error.message : "Failed to upload file");
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <PromptInputHoverCard>
      <PromptInputHoverCardTrigger>
        <PromptInputButton
          size="icon-sm"
          variant="outline"
          className="!h-8 group dark:hover:bg-accent"
        >
          <PaperClipIcon className="h-4 w-4 text-muted-foreground group-hover:text-primary-foreground" />
        </PromptInputButton>
      </PromptInputHoverCardTrigger>
      <PromptInputHoverCardContent className="w-[400px] p-0 transform translate-y-[-10px]">
        <PromptInputCommand>
          <PromptInputCommandInput
            className="border-none focus-visible:ring-0"
            placeholder="Search data files"
            value={searchQuery}
            onValueChange={setSearchQuery}
          />
          <PromptInputCommandList>
            <PromptInputCommandEmpty className="p-3 text-muted-foreground text-sm">
              {uploadedFiles.length === 0
                ? "No uploaded files. Upload a file to get started."
                : "No results found."}
            </PromptInputCommandEmpty>

            {attachments.files.length > 0 && (
              <>
                <PromptInputCommandGroup heading="Added">
                  {attachments.files.map((file) => (
                    <PromptInputCommandItem key={file.id}>
                      <GlobeEuropeAfricaIcon className="h-4 w-4" />
                      <span>{file.filename}</span>
                      <span className="ml-auto text-muted-foreground">✓</span>
                    </PromptInputCommandItem>
                  ))}
                </PromptInputCommandGroup>
                <PromptInputCommandSeparator />
              </>
            )}

            <PromptInputCommandGroup heading="Uploaded Files">
              {filteredFiles.length === 0 && uploadedFiles.length > 0 ? (
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  No files match your search.
                </div>
              ) : (
                filteredFiles.map((file) => {
                  const isSelected =
                    selectedFileIds.has(file.fileId) ||
                    attachments.files.some(
                      (f) => f.filename === file.originalName,
                    );
                  return (
                    <PromptInputCommandItem
                      key={file.fileId}
                      onSelect={() => handleAddUploadedFile(file)}
                    >
                      <GlobeEuropeAfricaIcon className="h-4 w-4" />
                      <span className="flex-1 truncate">
                        {file.originalName}
                      </span>
                      {isSelected && (
                        <span className="ml-auto text-muted-foreground">✓</span>
                      )}
                    </PromptInputCommandItem>
                  );
                })
              )}
            </PromptInputCommandGroup>

            <PromptInputCommandSeparator />
            <div className="p-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls,.parquet"
                className="hidden"
                onChange={handleUploadNewFile}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => fileInputRef.current?.click()}
              >
                Upload New File
              </Button>
            </div>
          </PromptInputCommandList>
        </PromptInputCommand>
      </PromptInputHoverCardContent>
    </PromptInputHoverCard>
  );
}

export function PromptInputWrapper({
  onSubmit,
  onRunSql,
  onAddSqlResultToChat,
  placeholder = "Ask a question about your data...",
  className,
  status,
  onHomePage = false,
  onCreateDashboard,
  onAddVisual: _onAddVisual,
  mode,
  onModeChange,
  pendingMode = null,
}: PromptInputWrapperProps) {
  const [internalMode, setInternalMode] = useState<PromptMode>(mode ?? "ai");
  const [selectedDb, setSelectedDb] = useState<string | undefined>();
  const [sqlConsoleApi, setSqlConsoleApi] = useState<SqlConsoleApi | null>(
    null,
  );
  const [sqlResult, setSqlResult] = useState<{
    sql: string;
    rows: Record<string, unknown>[];
    columns: { name: string; type?: string }[];
    durationMs: number;
  } | null>(null);
  const [manualViewMode, setManualViewMode] = useState<"chart" | "table">(
    "table",
  );
  const [chartConfig, setChartConfig] = useState<Config | null>(null);
  const lastSqlQueryRef = useRef<string | null>(null);
  const defaultChartConfig = useMemo<Config>(() => {
    const xKey = sqlResult?.columns[0]?.name ?? "";
    const fallbackYKey = sqlResult?.columns[1]?.name;
    return {
      description: "",
      title: "Manual chart",
      type: "line",
      xKey,
      yKeys: fallbackYKey ? [fallbackYKey] : [],
      legend: false,
      multipleLines: false,
      countMode: false,
      showGrid: true,
      showXAxis: true,
      showYAxis: true,
      showDots: true,
      showTooltip: true,
      lineSize: 2,
      labelYAngle: -90,
    };
  }, [sqlResult?.columns]);

  const updateChartConfig = (updater: (config: Config) => Config) => {
    setChartConfig((prev) => {
      const base = prev ?? defaultChartConfig;
      return updater({ ...base });
    });
  };

  const effectiveChartConfig = chartConfig ?? defaultChartConfig;

  const handleColorChange = (color?: string) => {
    updateChartConfig((config) => {
      if (!config.yKeys.length) {
        return { ...config };
      }
      if (!color) {
        return { ...config, colors: undefined };
      }
      return {
        ...config,
        colors: {
          ...(config.colors ?? {}),
          [config.yKeys[0]]: color,
        },
      };
    });
  };

  const connectedTables = useConnectedTables();
  const { tables: materializedTables } = useMaterializedTables();
  const chartColumns = sqlResult?.columns ?? [];
  const chartRows = (sqlResult?.rows as Result[]) ?? [];
  const primaryYKey = effectiveChartConfig.yKeys[0];
  const selectedColor =
    primaryYKey && effectiveChartConfig.colors
      ? effectiveChartConfig.colors[primaryYKey]
      : undefined;

  const promptMode = mode ?? internalMode;

  useEffect(() => {
    if (mode) {
      setInternalMode(mode);
    }
  }, [mode]);

  // Ensure manualViewMode is always valid
  useEffect(() => {
    if (promptMode === "manual" && manualViewMode !== "chart" && manualViewMode !== "table") {
      setManualViewMode("table");
    }
  }, [promptMode, manualViewMode]);

  const handlePromptModeChange = (value: PromptMode) => {
    if (!value || value === promptMode) {
      return;
    }
    if (!mode) {
      setInternalMode(value);
    }
    onModeChange?.(value);
  };

  const handlePromptSubmit = (message: PromptInputMessage) => {
    if (promptMode !== "ai") {
      return;
    }
    return onSubmit(message);
  };

  const handleInsertTableIntoSql = (tableName: string) => {
    if (!sqlConsoleApi) return;
    const current = sqlConsoleApi.getQuery() ?? "";
    const lastChar = current.length > 0 ? current[current.length - 1] : "";
    const needsSpace = current.length > 0 && !/\s/.test(lastChar);
    sqlConsoleApi.insertText(`${needsSpace ? " " : ""}${tableName}`);
    sqlConsoleApi.focus();
  };

  const aiButtonLabel = useMemo(() => {
    if (
      pendingMode === "ai" &&
      (!status || status === ("idle" as ChatStatus))
    ) {
      return "[SENDING …]";
    }
    switch (status) {
      case "submitted":
        return "[STOP X]";
      case "streaming":
        return "[STREAMING …]";
      case "error":
        return "[ERROR]";
      default:
        return "[Send |>]";
    }
  }, [pendingMode, status]);

  const content = aiButtonLabel;

  // Get display name for selected database - matches ConnectedDataPanel logic
  const getSelectedDbLabel = (): string => {
    // If no database selected, default to Materialized (HTTP connection)
    if (!selectedDb) {
      return materializedTables.length > 0
        ? `Materialized (${materializedTables.length})`
        : "Materialized";
    }

    // Check if it's a materialized table identifier
    if (isMaterializedTableIdentifier(selectedDb)) {
      return materializedTables.length > 0
        ? `Materialized (${materializedTables.length})`
        : "Materialized";
    }

    // Find matching connected table and use same display logic as ConnectedDataPanel
    const matchingEntry = connectedTables.find((entry) => {
      // Match by databasePath (same as getDbIdentifier in ConnectedDataPanel)
      return entry.databasePath === selectedDb || entry.attachAs === selectedDb;
    });

    if (matchingEntry) {
      // Use same logic as getDbDisplayName in ConnectedDataPanel
      const parts: string[] = [];
      if (matchingEntry.schema) parts.push(matchingEntry.schema);
      if (matchingEntry.table) parts.push(matchingEntry.table);
      if (parts.length === 0) {
        parts.push(matchingEntry.databasePath);
      }
      return `${parts.join(".")} (${matchingEntry.type})`;
    }

  // Fallback: try to extract a readable name from the identifier
    if (selectedDb.includes(":")) {
      const [type, ...pathParts] = selectedDb.split(":");
      const path = pathParts.join(":");
      const fileName = path.split("/").pop() || path.split("\\").pop() || path;
      return `${fileName} (${type})`;
    }

    return selectedDb;
  };

  return (
    <div className="flex">
      <PromptInput
        onSubmit={handlePromptSubmit}
        className={cn("flex-1 flex flex-row", className)}
        globalDrop
        multiple
      >
        <PromptInputBody>
          <PromptInputAttachments>
            {(attachment) => <PromptInputAttachment data={attachment} />}
          </PromptInputAttachments>
          {promptMode === "ai" && (
            <div className="flex items-center gap-2 justify-between w-full">
              <PromptInputTextarea
                placeholder={placeholder}
                className="flex-1 min-h-32"
              />
              <div className="flex flex-col items-center gap-2 h-full justify-center">
                <Button
                  size="sm"
                  variant="outline"
                  type="submit"
                  className="text-sm font-mono border-border hover:bg-primary/80 hover:text-primary-foreground hover:border-primary mx-2 dark:hover:bg-primary/80 dark:hover:text-primary-foreground dark:hover:border-primary"
                  disabled={pendingMode === "ai"}
                >
                  {content}
                </Button>
              </div>
            </div>
          )}
          {promptMode === "manual" && (
            <div className="flex flex-row gap-0 w-full h-[800px] max-h-[calc(100vh-200px)]">
              {/* Left Panel: Sidebar + SQL Editor */}
              <div className="flex flex-row border-r border-border min-w-0">
                <ConnectedDataPanel
                  selectedDb={selectedDb}
                  onSelect={setSelectedDb}
                  mode="sidebar"
                  onInsertTable={handleInsertTableIntoSql}
                />
              </div>

              {/* SQL Editor */}
              <div className="flex flex-1 h-full w-full">
                  <DuckdbRepl
                  className="flex-1 h-full w-full bg-background border-r border-border"
                    selectedDbIdentifier={selectedDb}
                    onRunSqlAction={onRunSql}
                    onConsoleApiChangeAction={setSqlConsoleApi}
                    onAddToChatAction={onAddSqlResultToChat}
                    inlineResults={false}
                  onResultChangeAction={(result) => {
                    const sqlChanged = result?.sql !== lastSqlQueryRef.current;
                    
                    if (sqlChanged) {
                      // Only reset config and view mode when SQL query actually changes
                      setChartConfig(null);
                      setManualViewMode(result ? "table" : "chart");
                      lastSqlQueryRef.current = result?.sql ?? null;
                    }
                    
                    setSqlResult(result);
                  }}
                />
                {/* Right Panel: Chart/Table View with Config */}
                <div className="flex-1 flex flex-col min-w-0 bg-card-background">
                  {/* Tabs Header */}
                  <div className="flex items-center justify-between px-4 pt-4 border-b border-border">
                    <ToggleGroup
                      type="single"
                      value={manualViewMode}
                      onValueChange={(value) => {
                        if (value) {
                          setManualViewMode(value as "chart" | "table");
                        }
                      }}
                      className="gap-2"
                    >
                      <ToggleGroupItem
                        value="chart"
                        disabled={false}
                        className={cn(
                          "rounded-none border-b-2 border-transparent px-3 py-2 text-sm font-medium",
                          manualViewMode === "chart"
                            ? "border-primary text-foreground"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        Chart
                      </ToggleGroupItem>
                      <ToggleGroupItem
                        value="table"
                        disabled={false}
                        className={cn(
                          "rounded-none border-b-2 border-transparent px-3 py-2 text-sm font-medium",
                          manualViewMode === "table"
                            ? "border-primary text-foreground"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        Table
                      </ToggleGroupItem>
                    </ToggleGroup>
                    {sqlResult && sqlResult.columns.length > 0 && (
                      <ChartConfigDialog
                        trigger={
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="text-xs font-mono"
                          >
                            Advanced config
                          </Button>
                        }
                        config={chartConfig ?? defaultChartConfig}
                        columns={chartColumns.map((column) => ({
                          name: column.name,
                        }))}
                        rows={chartRows}
                        onConfigChange={(config) => {
                          // Save the full config object - ensure it's a complete config
                          // Use functional update to avoid stale state issues
                          setChartConfig(() => ({ ...config }));
                          // Switch to chart view when config is set - use functional update
                          setManualViewMode(() => "chart");
                        }}
                        tooltip="Open advanced chart settings"
                      />
                    )}
                  </div>
                  {/* Chart Config (only visible in chart mode) */}
                  {manualViewMode === "chart" &&
                    sqlResult &&
                    sqlResult.columns.length > 0 && (
                      <div className="p-4 border-b border-border bg-muted/30 grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <label
                            htmlFor="visualization"
                            className="block text-[10px] text-muted-foreground mb-1 tracking-wider font-bold uppercase"
                          >
                            Visualization
                          </label>
                          <select
                            id="visualization"
                            className="w-full bg-background border border-input rounded px-2 py-1.5 text-xs focus:outline-none focus:border-primary"
                            value={effectiveChartConfig.type}
                            onChange={(e) =>
                              updateChartConfig((config) => ({
                                ...config,
                                type: e.target.value as Config["type"],
                              }))
                            }
                          >
                            <option value="line">Line Chart</option>
                            <option value="bar">Bar Chart</option>
                            <option value="area">Area Chart</option>
                            <option value="pie">Pie Chart</option>
                          </select>
                        </div>
                        <div>
                          <label
                            htmlFor="x-axis"
                            className="block text-[10px] text-muted-foreground mb-1 tracking-wider font-bold uppercase"
                          >
                            X-Axis
                          </label>
                          <select
                            className="w-full bg-background border border-input rounded px-2 py-1.5 text-xs focus:outline-none focus:border-primary"
                            value={effectiveChartConfig.xKey}
                            disabled={!chartColumns.length}
                            onChange={(e) =>
                              updateChartConfig((config) => ({
                                ...config,
                                xKey: e.target.value,
                              }))
                            }
                          >
                            {chartColumns.map((col) => (
                              <option key={col.name} value={col.name}>
                                {col.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label
                            htmlFor="y-axis"
                            className="block text-[10px] text-muted-foreground mb-1 tracking-wider font-bold uppercase"
                          >
                            Y-Axis
                          </label>
                          <select
                            className="w-full bg-background border border-input rounded px-2 py-1.5 text-xs focus:outline-none focus:border-primary"
                            value={effectiveChartConfig.yKeys[0] ?? ""}
                            disabled={!chartColumns.length}
                            onChange={(e) =>
                              updateChartConfig((config) => ({
                                ...config,
                                yKeys: e.target.value ? [e.target.value] : [],
                              }))
                            }
                          >
                            <option value="">Select column</option>
                            {chartColumns.map((col) => (
                              <option key={col.name} value={col.name}>
                                {col.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label
                            htmlFor="color"
                            className="block text-[10px] text-muted-foreground mb-1 tracking-wider font-bold uppercase"
                          >
                            Color
                          </label>
                          <div className="flex gap-2 items-center h-[26px]">
                            <button
                              type="button"
                              aria-label="Use theme color"
                              className={cn(
                                "w-4 h-4 rounded-full bg-primary cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                                !selectedColor &&
                                "ring-2 ring-primary ring-offset-2",
                              )}
                              onClick={() => handleColorChange(undefined)}
                            />
                            <button
                              type="button"
                              aria-label="Use blue color"
                              className={cn(
                                "w-4 h-4 rounded-full bg-blue-500 cursor-pointer transition-all hover:ring-2 hover:ring-blue-500 hover:ring-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
                                selectedColor === "hsl(221.2 83.2% 53.3%)" &&
                                "ring-2 ring-blue-500 ring-offset-2",
                              )}
                              onClick={() =>
                                handleColorChange("hsl(221.2 83.2% 53.3%)")
                              }
                            />
                            <button
                              type="button"
                              aria-label="Use green color"
                              className={cn(
                                "w-4 h-4 rounded-full bg-green-500 cursor-pointer transition-all hover:ring-2 hover:ring-green-500 hover:ring-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2",
                                selectedColor === "hsl(142.1 76.2% 36.3%)" &&
                                "ring-2 ring-green-500 ring-offset-2",
                              )}
                              onClick={() =>
                                handleColorChange("hsl(142.1 76.2% 36.3%)")
                              }
                  />
                </div>
              </div>
                      </div>
                    )}
                  {/* Content Area */}
                  <div className="flex-1 p-4 overflow-auto">
                {sqlResult ? (
                      manualViewMode === "chart" ? (
                        <SqlChart
                          customChartConfig={chartConfig ?? defaultChartConfig}
                          dataOverride={{
                            stage: "complete",
                            rows: chartRows,
                            summary: {
                              totalRows: sqlResult.rows.length,
                              executionTimeMs: sqlResult.durationMs,
                              insights: [],
                            },
                          }}
                        />
                      ) : (
                  <SqlResultsTable
                            className="w-full h-full"
                    dataOverride={{
                      stage: "complete",
                      columns: sqlResult.columns,
                      rows: sqlResult.rows,
                      summary: {
                        totalRows: sqlResult.rows.length,
                        executionTimeMs: sqlResult.durationMs,
                        insights: [],
                      },
                    }}
                  />
                        )
                    ) : (
                      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                        Run a SQL query to see results here.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </PromptInputBody>
        <PromptInputHeader className="border-b p-2 border-border">
          <div className="flex items-center gap-2 justify-between w-full">
            <div className="flex items-center gap-2">
              {promptMode === "ai" && (
                <ConnectedDataPanel
                  selectedDb={selectedDb}
                  onSelect={setSelectedDb}
                  className="h-full"
                  onInsertTable={handleInsertTableIntoSql}
                />
              )}
              <FileAttachmentHoverCard />
              {!onHomePage && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <PromptInputButton
                      size="sm"
                      variant="outline"
                      className="group dark:hover:bg-accent"
                      onClick={() => onCreateDashboard?.()}
                    >
                      <Squares2X2Icon className="h-4 w-4 text-muted-foreground group-hover:text-primary-foreground" />
                      <span>Create dashboard</span>
                    </PromptInputButton>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>generate dashboard from chat visuals</p>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
            <ToggleGroup
              type="single"
              value={promptMode}
              onValueChange={(value) =>
                handlePromptModeChange(value as PromptMode)
              }
              disabled={Boolean(pendingMode)}
            >
              <ToggleGroupItem value="ai">
                <ChatBubbleLeftRightIcon className="h-4 w-4 group-hover:text-primary-foreground" />
                <span>AI mode</span>
              </ToggleGroupItem>
              <ToggleGroupItem value="manual">
                <WrenchScrewdriverIcon className="h-4 w-4 group-hover:text-primary-foreground" />
                <span>Manual mode</span>
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </PromptInputHeader>
      </PromptInput>
    </div>
  );
}
