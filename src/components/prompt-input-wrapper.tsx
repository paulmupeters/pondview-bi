import {
  ChatBubbleBottomCenterTextIcon,
  Squares2X2Icon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";
import type { ChatStatus } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { DuckdbRepl } from "@/components/duckdb-shell/repl";
import type { SqlAnalysisData } from "@/components/sql-analysis-display.types";
import type { SqlConsoleApi } from "@/components/sql-console";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useUploadedFiles } from "@/hooks/use-uploaded-files";
import { buildDashboardSourceDescriptor } from "@/lib/dashboard/source-descriptor";
import type { SqlBackend } from "@/lib/sql/sql-runtime";
import { useResolvedSqlBackend } from "@/lib/sql/use-sql-backend";
import type { CardConfig, Config, Result } from "@/lib/types";
import { getUploadedFileBlob, persistUploadedFile } from "@/lib/uploaded-files";
import { cn } from "@/lib/utils";
import type { SavedSqlQuery } from "@/lib/workspace/saved-sql-queries-repo";

export type PromptMode = "ai" | "manual";
export type ManualShellVariant = "default" | "minimal";

interface PromptInputWrapperProps {
  onSubmit: (message: PromptInputMessage) => void;
  onManualRunRequest?: (sql: string) => void;
  placeholder?: string;
  className?: string;
  status?: ChatStatus;
  showHeader?: boolean;
  showAiInput?: boolean;
  onHomePage?: boolean;
  compact?: boolean;
  manualShellVariant?: ManualShellVariant;
  onCreateDashboard?: () => void;
  onAddVisual?: () => void;
  mode?: PromptMode;
  onModeChange?: (mode: PromptMode) => void;
  pendingMode?: PromptMode | null;
  selectedDb?: string;
  onAddSqlResultToChat?: (payload: SqlAnalysisData) => void;
  sqlResult?: {
    sql: string;
    rows: Record<string, unknown>[];
    columns: { name: string; type?: string }[];
    durationMs: number;
    backend?: SqlBackend;
    dbIdentifier?: string;
    catalogContext?: string | null;
    sourceDescriptor?: SqlAnalysisData["sourceDescriptor"];
  } | null;
  selectedCatalogContext?: string | null;
  onConsoleApiChange?: (api: SqlConsoleApi | null) => void;
  onResultChange?: (
    result: {
      sql: string;
      rows: Record<string, unknown>[];
      columns: { name: string; type?: string }[];
      durationMs: number;
      backend?: SqlBackend;
      dbIdentifier?: string;
      catalogContext?: string | null;
    } | null,
  ) => void;
  storedSqlQueries?: SavedSqlQuery[];
  onSaveQuery?: (sql: string) => void | Promise<void>;
  isSavingQuery?: boolean;
  manualChartConfig?: Config | null;
  manualCardConfig?: CardConfig | null;
  manualVisualType?: "table" | "chart" | "card" | null;
  onManualReplFocus?: () => void;
}

// Inner component that uses the attachments hook within PromptInput context
function FileAttachmentHoverCard() {
  const effectiveSqlBackend = useResolvedSqlBackend();
  const isFileUploadSupported = effectiveSqlBackend === "duckdb-wasm";
  const uploadedFiles = useUploadedFiles();
  const attachments = usePromptInputAttachments();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(
    new Set(),
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Filter uploaded files based on search query
  const filteredFiles = uploadedFiles.filter((file) =>
    file.originalName.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // Handle adding an uploaded file as attachment
  const handleAddUploadedFile = async (file: (typeof uploadedFiles)[0]) => {
    setErrorMessage(null);

    const blob = await getUploadedFileBlob(file.fileId);
    if (!blob) {
      setErrorMessage(
        "The browser copy of this file is no longer available. Remove it and upload again.",
      );
      return;
    }

    attachments.add([blob]);
    setSelectedFileIds((prev) => new Set(prev).add(file.fileId));
  };

  // Handle uploading a new file
  const handleUploadNewFile = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    e.preventDefault();
    const nextFile = e.currentTarget.files?.[0];
    if (!nextFile) {
      return;
    }

    setErrorMessage(null);
    setIsUploading(true);

    try {
      const uploadedFile = await persistUploadedFile(nextFile);
      const browserFile = await getUploadedFileBlob(uploadedFile.fileId);
      if (browserFile) {
        attachments.add([browserFile]);
        setSelectedFileIds((prev) => new Set(prev).add(uploadedFile.fileId));
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to upload file.",
      );
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <PromptInputHoverCard>
      <PromptInputHoverCardContent className="w-100 p-0 transform translate-y-[-10px]">
        <PromptInputCommand>
          <PromptInputCommandInput
            className="border-none focus-visible:ring-0"
            placeholder="Search data files"
            value={searchQuery}
            onValueChange={setSearchQuery}
          />
          <PromptInputCommandList>
            <PromptInputCommandEmpty className="p-3 text-muted-foreground text-sm">
              {!isFileUploadSupported
                ? ""
                : uploadedFiles.length === 0
                  ? "No uploaded files. Upload a file to get started."
                  : "No results found."}
            </PromptInputCommandEmpty>

            {attachments.files.length > 0 && (
              <>
                <PromptInputCommandGroup heading="Added">
                  {attachments.files.map((file) => (
                    <PromptInputCommandItem key={file.id}>
                      <ChatBubbleBottomCenterTextIcon className="h-4 w-4" />
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
                      disabled={!isFileUploadSupported}
                    >
                      <ChatBubbleBottomCenterTextIcon className="h-4 w-4" />
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
              {errorMessage ? (
                <div className="pb-2 text-xs text-destructive">
                  {errorMessage}
                </div>
              ) : null}
              {!isFileUploadSupported ? (
                <div className="text-xs text-muted-foreground">
                  File upload is currently only supported in DuckDB WASM. Use
                  the DuckDB shell to load files for HTTP or Bridge connections.
                </div>
              ) : (
                <>
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
                    disabled={isUploading}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {isUploading ? "Uploading..." : "Upload New File"}
                  </Button>
                </>
              )}
            </div>
          </PromptInputCommandList>
        </PromptInputCommand>
      </PromptInputHoverCardContent>
    </PromptInputHoverCard>
  );
}

function PromptInputModeEffects({ mode }: { mode: PromptMode }) {
  const { clear, files } = usePromptInputAttachments();

  useEffect(() => {
    if (mode === "manual" && files.length > 0) {
      clear();
    }
  }, [clear, files.length, mode]);

  return null;
}

export function PromptInputWrapper({
  onSubmit,
  onManualRunRequest,
  placeholder = "Ask a question about your data...",
  className,
  status,
  showHeader = true,
  showAiInput = true,
  onHomePage = false,
  compact = false,
  manualShellVariant = "default",
  onCreateDashboard,
  onAddVisual: _onAddVisual,
  mode,
  onModeChange,
  pendingMode = null,
  selectedDb,
  onAddSqlResultToChat,
  sqlResult = null,
  selectedCatalogContext = null,
  onConsoleApiChange,
  onResultChange,
  storedSqlQueries: _storedSqlQueries,
  onSaveQuery,
  isSavingQuery = false,
  manualChartConfig,
  manualCardConfig,
  manualVisualType,
  onManualReplFocus,
}: PromptInputWrapperProps) {
  const [internalMode, setInternalMode] = useState<PromptMode>(mode ?? "ai");
  const [manualConsoleApi, setManualConsoleApi] =
    useState<SqlConsoleApi | null>(null);

  useEffect(() => {
    if (mode) {
      setInternalMode(mode);
    }
  }, [mode]);

  const handlePromptModeChange = (value: PromptMode) => {
    if (!value || value === internalMode) {
      return;
    }
    if (!mode) {
      setInternalMode(value);
    }
    onModeChange?.(value);
  };

  const handlePromptSubmit = (message: PromptInputMessage) => onSubmit(message);

  const aiButtonLabel = useMemo(() => {
    if (
      pendingMode === "ai" &&
      (!status || status === ("ready" as ChatStatus))
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

  const handleManualConsoleApiChange = useCallback(
    (api: SqlConsoleApi | null) => {
      setManualConsoleApi(api);
      onConsoleApiChange?.(api);
    },
    [onConsoleApiChange],
  );

  const handleManualRun = useCallback(() => {
    const sql = manualConsoleApi?.getQuery()?.trim();
    if (!sql) {
      return;
    }

    if (onHomePage && onManualRunRequest) {
      onManualRunRequest(sql);
      return;
    }

    manualConsoleApi?.runQuery();
  }, [manualConsoleApi, onHomePage, onManualRunRequest]);

  const handleManualSend = useCallback(() => {
    if (!onAddSqlResultToChat || !sqlResult) {
      return;
    }

    const isCardMode =
      sqlResult.rows.length === 1 && sqlResult.columns.length === 1;
    const visualType: "table" | "chart" | "card" =
      manualVisualType ??
      (isCardMode ? "card" : manualChartConfig ? "chart" : "table");

    const payload: SqlAnalysisData = {
      stage: "complete",
      progress: 1,
      query: sqlResult.sql,
      dbIdentifier: sqlResult.dbIdentifier,
      catalogContext: sqlResult.catalogContext ?? selectedCatalogContext,
      sqlBackend: sqlResult.backend,
      sourceDescriptor:
        sqlResult.sourceDescriptor ??
        (sqlResult.backend
          ? buildDashboardSourceDescriptor({
              runtimeBackend: sqlResult.backend,
              dbIdentifier: sqlResult.dbIdentifier,
              catalogContext:
                sqlResult.catalogContext ?? selectedCatalogContext ?? null,
            })
          : null),
      executionTime: sqlResult.durationMs,
      rowCount: sqlResult.rows.length,
      columns: sqlResult.columns,
      rows: sqlResult.rows as Result[],
      visualType,
      chartConfig:
        visualType === "chart" ? (manualChartConfig ?? undefined) : undefined,
      cardConfig:
        visualType === "card" ? (manualCardConfig ?? undefined) : undefined,
      summary: {
        totalRows: sqlResult.rows.length,
        executionTimeMs: sqlResult.durationMs,
        insights: [],
      },
    };

    onAddSqlResultToChat(payload);
  }, [
    manualCardConfig,
    manualChartConfig,
    manualVisualType,
    onAddSqlResultToChat,
    selectedCatalogContext,
    sqlResult,
  ]);

  const content = aiButtonLabel;
  const nextMode: PromptMode = internalMode === "ai" ? "manual" : "ai";
  const modeButtonLabel = nextMode === "ai" ? "Chat" : "Manual";
  const showMinimalManualShell =
    manualShellVariant === "minimal" && internalMode === "manual";
  const showHomeManualComposer = onHomePage && showMinimalManualShell;
  const showManualAddToChatButton = !onHomePage;
  const useSegmentedModeToggle = manualShellVariant === "minimal";

  if (!showHeader && !showAiInput) {
    return null;
  }

  return (
    <div className="flex w-full mx-auto">
      <PromptInput
        onSubmit={handlePromptSubmit}
        className={cn(
          "flex-1 w-full flex flex-row [&_[data-slot=input-group]]:border-2 [&_[data-slot=input-group]]:rounded-xl",
          className,
        )}
        globalDrop={internalMode !== "manual"}
        multiple
      >
        <PromptInputModeEffects mode={internalMode} />
        {showAiInput && (
          <div className="flex w-full flex-col">
            <div
              aria-hidden={internalMode !== "manual"}
              className={cn(
                "grid overflow-hidden transition-[grid-template-rows,opacity,transform] duration-300 ease-out",
                internalMode === "manual"
                  ? "grid-rows-[1fr] opacity-100 translate-y-0"
                  : "pointer-events-none grid-rows-[0fr] opacity-0 -translate-y-2",
              )}
            >
              <div className="min-h-0">
                <div
                  className={cn(
                    "flex w-full flex-col",
                    showMinimalManualShell ? "gap-2 p-2.5" : "gap-3 p-3",
                  )}
                >
                  <div
                    className={cn(
                      "w-full overflow-hidden",
                      showMinimalManualShell
                        ? compact
                          ? "h-72 rounded-xl border border-border"
                          : "h-88 rounded-xl border border-border"
                        : compact
                          ? "h-85 rounded-lg"
                          : "h-105 rounded-lg",
                    )}
                    onFocusCapture={() => onManualReplFocus?.()}
                    onPointerDownCapture={() => onManualReplFocus?.()}
                  >
                    <DuckdbRepl
                      className={cn(
                        "h-full w-full border-r-0 p-0",
                        showMinimalManualShell && "border-0 bg-transparent",
                      )}
                      selectedDbIdentifier={selectedDb}
                      catalogContext={selectedCatalogContext}
                      onConsoleApiChangeAction={handleManualConsoleApiChange}
                      inlineResults={false}
                      editorMinHeight={
                        showMinimalManualShell ? "11rem" : "8rem"
                      }
                      editorMaxHeight={
                        showMinimalManualShell
                          ? compact
                            ? "10rem"
                            : "12rem"
                          : compact
                            ? "12rem"
                            : "14rem"
                      }
                      showRunControls={false}
                      showExplorer={false}
                      showCopySnippetButton={!showHomeManualComposer}
                      showClearButton={!showHomeManualComposer}
                      showSaveQueryButton={Boolean(onSaveQuery)}
                      onSaveQueryAction={onSaveQuery}
                      isSavingQuery={isSavingQuery}
                      chartConfig={manualChartConfig}
                      onResultChangeAction={onResultChange}
                    />
                  </div>
                  <div
                    className={cn(
                      "flex gap-2",
                      showMinimalManualShell
                        ? "items-center justify-between px-1 pb-1"
                        : "m-2 justify-end",
                      showMinimalManualShell
                        ? "pt-0"
                        : compact
                          ? "pt-1 pr-1"
                          : "pt-2 pr-2",
                    )}
                  >
                    <Button
                      size="sm"
                      variant="outline"
                      type="button"
                      className="text-sm font-mono border-border hover:bg-primary/80 hover:text-primary-foreground hover:border-primary dark:hover:bg-primary/80 dark:hover:text-primary-foreground dark:hover:border-primary"
                      disabled={!manualConsoleApi?.getQuery()?.trim()}
                      onClick={handleManualRun}
                    >
                      {showHomeManualComposer ? "[Run in chat ▷]" : "[Run ▷]"}
                    </Button>
                    {showManualAddToChatButton && (
                      <Button
                        size="sm"
                        variant="outline"
                        type="button"
                        className="text-sm font-mono border-border hover:bg-primary/80 hover:text-primary-foreground hover:border-primary dark:hover:bg-primary/80 dark:hover:text-primary-foreground dark:hover:border-primary"
                        disabled={!sqlResult}
                        onClick={handleManualSend}
                      >
                        [Add to chat +]
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div
              aria-hidden={internalMode === "manual"}
              className={cn(
                "grid overflow-hidden transition-[grid-template-rows,opacity,transform] duration-300 ease-out",
                internalMode !== "manual"
                  ? "grid-rows-[1fr] opacity-100 translate-y-0"
                  : "pointer-events-none grid-rows-[0fr] opacity-0 translate-y-2",
              )}
            >
              <div className="min-h-0">
                <PromptInputBody>
                  <PromptInputAttachments>
                    {(attachment) => (
                      <PromptInputAttachment data={attachment} />
                    )}
                  </PromptInputAttachments>
                  <div className="w-full">
                    <div className="min-h-0 overflow-hidden">
                      <div className="relative w-full">
                        <PromptInputTextarea
                          placeholder={placeholder}
                          className={cn(
                            "flex-1 pr-4",
                            compact ? "min-h-10 pb-10" : "min-h-28 pb-10",
                          )}
                        />
                        <div
                          className={cn(
                            "absolute right-3",
                            compact ? "bottom-2" : "bottom-3",
                          )}
                        >
                          <Button
                            size="sm"
                            variant="outline"
                            type="submit"
                            className="text-sm font-mono border-border hover:bg-primary/80 hover:text-primary-foreground hover:border-primary dark:hover:bg-primary/80 dark:hover:text-primary-foreground dark:hover:border-primary"
                            disabled={pendingMode === "ai"}
                          >
                            {content}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </PromptInputBody>
              </div>
            </div>
          </div>
        )}
        {showHeader && (
          <PromptInputHeader className={cn("p-0 overflow-hidden")}>
            <div className="flex items-center gap-1.5 justify-between w-full m-3">
              <div className="flex items-center gap-1.5">
                {internalMode !== "manual" && <FileAttachmentHoverCard />}
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
              {useSegmentedModeToggle ? (
                <div className="inline-flex items-center rounded-full border border-border/70 bg-background/80 p-1 shadow-sm backdrop-blur-sm">
                  <button
                    type="button"
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all",
                      internalMode === "ai"
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() => handlePromptModeChange("ai")}
                    disabled={Boolean(pendingMode)}
                  >
                    <ChatBubbleBottomCenterTextIcon className="h-4 w-4" />
                    <span>Chat</span>
                  </button>
                  <button
                    type="button"
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all",
                      internalMode === "manual"
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() => handlePromptModeChange("manual")}
                    disabled={Boolean(pendingMode)}
                  >
                    <WrenchScrewdriverIcon className="h-4 w-4" />
                    <span>Manual</span>
                  </button>
                </div>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="default"
                  className={cn(
                    "gap-1.5",
                    "bg-primary text-primary-foreground hover:bg-primary/90 border-primary",
                  )}
                  onClick={() => handlePromptModeChange(nextMode)}
                  disabled={Boolean(pendingMode)}
                  aria-pressed
                  title={modeButtonLabel}
                >
                  {nextMode === "ai" ? (
                    <ChatBubbleBottomCenterTextIcon className="h-4 w-4" />
                  ) : (
                    <WrenchScrewdriverIcon className="h-4 w-4" />
                  )}
                  <span>{modeButtonLabel}</span>
                </Button>
              )}
            </div>
          </PromptInputHeader>
        )}
      </PromptInput>
    </div>
  );
}
