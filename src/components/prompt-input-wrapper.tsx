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
  PromptInputTextarea,
  usePromptInputAttachments,
} from "@/components/ai-elements/prompt-input";
import { logNotebookDebug } from "@/components/chat/notebook-debug";
import { DuckdbRepl } from "@/components/duckdb-shell/repl";
import type { SqlAnalysisData } from "@/components/sql-analysis-display.types";
import type { QueryNotice, SqlConsoleApi } from "@/components/sql-console";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useUploadedFiles } from "@/hooks/use-uploaded-files";
import { useResolvedSqlBackend } from "@/lib/sql/use-sql-backend";
import type { CardConfig, Config } from "@/lib/types";
import { getUploadedFileBlob, persistUploadedFile } from "@/lib/uploaded-files";
import { cn } from "@/lib/utils";
import { readXlsxSheetNames } from "@/lib/xlsx-sheets";

export type PromptMode = "ai" | "manual";
export type ManualShellVariant = "default" | "minimal";

type PromptInputChatComposer = {
  submitPrompt: (message: PromptInputMessage) => Promise<void>;
  status: ChatStatus;
  pendingMode?: "ai" | null;
};

type PromptInputSqlRepl = {
  result: {
    sql: string;
    rows: Record<string, unknown>[];
    columns: { name: string; type?: string }[];
    durationMs: number;
    backend?: string;
    dbIdentifier?: string;
    catalogContext?: string | null;
    sourceDescriptor?: SqlAnalysisData["sourceDescriptor"];
  } | null;
  setConsoleApi: (api: SqlConsoleApi | null) => void;
  saveQuery: (sql?: string) => Promise<void>;
  isSavingQuery: boolean;
  persistManualResultToChat: (payload: SqlAnalysisData) => Promise<void>;
};

type PromptInputManualVisualization = {
  chartConfig: Config | null;
  cardConfig: CardConfig | null;
  visualType: "table" | "chart" | "card" | null;
  handleReplResultChange: (result: PromptInputSqlRepl["result"]) => void;
  focusManualVisualization: () => void;
  createPayload: (params: {
    result: PromptInputSqlRepl["result"];
    selectedCatalogContext?: string | null;
  }) => SqlAnalysisData | null;
};

interface PromptInputWrapperProps {
  chatComposer: PromptInputChatComposer;
  sqlRepl?: PromptInputSqlRepl;
  manualVisualization?: PromptInputManualVisualization;
  onManualRunRequest?: (sql: string) => void;
  placeholder?: string;
  className?: string;
  showHeader?: boolean;
  showAiInput?: boolean;
  onHomePage?: boolean;
  compact?: boolean;
  manualShellVariant?: ManualShellVariant;
  onCreateDashboard?: () => void;
  onAddVisual?: () => void;
  mode?: PromptMode;
  onModeChange?: (mode: PromptMode) => void;
  selectedDb?: string;
  selectedCatalogContext?: string | null;
  integratedComposer?: boolean;
  promptValue?: string;
  onPromptChange?: (value: string) => void;
  sqlValue?: string;
  onSqlChange?: (value: string) => void;
  onManualRun?: () => void;
  onManualRunNotice?: (notice: QueryNotice | null) => void;
  onManualRunStateChange?: (isRunning: boolean) => void;
  onManualRunSuccess?: () => void;
}

// Inner component that uses the attachments hook within PromptInput context
function FileAttachmentHoverCard() {
  const effectiveSqlBackend = useResolvedSqlBackend();
  const isFileUploadSupported =
    effectiveSqlBackend === "duckdb-wasm" || effectiveSqlBackend === "bridge";
  const uploadedFiles = useUploadedFiles();
  const attachments = usePromptInputAttachments();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(
    new Set(),
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingXlsxFile, setPendingXlsxFile] = useState<File | null>(null);
  const [xlsxSheets, setXlsxSheets] = useState<string[]>([]);
  const [selectedXlsxSheet, setSelectedXlsxSheet] = useState("");
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
      if (
        effectiveSqlBackend === "bridge" &&
        nextFile.name.toLowerCase().endsWith(".xlsx")
      ) {
        const sheets = await readXlsxSheetNames(nextFile);
        setPendingXlsxFile(nextFile);
        setXlsxSheets(sheets);
        setSelectedXlsxSheet(sheets[0] ?? "");
        return;
      }

      const uploadedFile = await persistUploadedFile(nextFile, {
        backend: effectiveSqlBackend,
      });
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

  const handleImportSelectedXlsxSheet = async () => {
    if (!pendingXlsxFile || !selectedXlsxSheet) {
      return;
    }

    setErrorMessage(null);
    setIsUploading(true);
    try {
      const uploadedFile = await persistUploadedFile(pendingXlsxFile, {
        backend: "bridge",
        xlsxSheet: selectedXlsxSheet,
      });
      const browserFile = await getUploadedFileBlob(uploadedFile.fileId);
      if (browserFile) {
        attachments.add([browserFile]);
        setSelectedFileIds((prev) => new Set(prev).add(uploadedFile.fileId));
      }
      setPendingXlsxFile(null);
      setXlsxSheets([]);
      setSelectedXlsxSheet("");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to import worksheet.",
      );
    } finally {
      setIsUploading(false);
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
                  File upload is currently only supported in DuckDB WASM and
                  Bridge.
                </div>
              ) : pendingXlsxFile ? (
                <div className="space-y-2">
                  <Select
                    value={selectedXlsxSheet}
                    onValueChange={setSelectedXlsxSheet}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select worksheet" />
                    </SelectTrigger>
                    <SelectContent>
                      {xlsxSheets.map((sheet) => (
                        <SelectItem key={sheet} value={sheet}>
                          {sheet}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      className="flex-1"
                      disabled={isUploading || !selectedXlsxSheet}
                      onClick={handleImportSelectedXlsxSheet}
                    >
                      {isUploading ? "Importing..." : "Import Sheet"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isUploading}
                      onClick={() => {
                        setPendingXlsxFile(null);
                        setXlsxSheets([]);
                        setSelectedXlsxSheet("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
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
  chatComposer,
  sqlRepl,
  manualVisualization,
  onManualRunRequest,
  placeholder = "Ask a question about your data...",
  className,
  showHeader = true,
  showAiInput = true,
  onHomePage = false,
  compact = false,
  manualShellVariant = "default",
  onCreateDashboard,
  onAddVisual: _onAddVisual,
  mode,
  onModeChange,
  selectedDb,
  selectedCatalogContext = null,
  integratedComposer = false,
  promptValue,
  onPromptChange,
  sqlValue,
  onSqlChange,
  onManualRun,
  onManualRunNotice,
  onManualRunStateChange,
  onManualRunSuccess,
}: PromptInputWrapperProps) {
  const [internalMode, setInternalMode] = useState<PromptMode>(mode ?? "ai");
  const manualConsoleApiRef = useRef<SqlConsoleApi | null>(null);
  const [manualQuery, setManualQuery] = useState("");
  const status = chatComposer.status;
  const pendingMode = chatComposer.pendingMode ?? null;
  const sqlResult = sqlRepl?.result ?? null;
  const manualChartConfig = manualVisualization?.chartConfig ?? null;
  const _manualVisualType = manualVisualization?.visualType ?? null;
  const effectivePromptValue = promptValue ?? undefined;

  useEffect(() => {
    if (mode) {
      setInternalMode(mode);
    }
  }, [mode]);

  useEffect(() => {
    const manualConsoleApi = manualConsoleApiRef.current;
    if (!manualConsoleApi || sqlValue === undefined) {
      return;
    }

    if (manualConsoleApi.getQuery() === sqlValue) {
      return;
    }

    manualConsoleApi.setQuery(sqlValue);
  }, [sqlValue]);

  const handlePromptModeChange = (value: PromptMode) => {
    if (!value || value === internalMode) {
      return;
    }
    logNotebookDebug("prompt-input:event:mode-toggle", {
      fromMode: internalMode,
      toMode: value,
      integratedComposer,
      selectedDb: selectedDb ?? null,
      selectedCatalogContext,
    });
    if (!mode) {
      setInternalMode(value);
    }
    onModeChange?.(value);
  };

  const handlePromptSubmit = (message: PromptInputMessage) => {
    void chatComposer.submitPrompt(message);
  };

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
      logNotebookDebug("prompt-input:event:manual-console-api-change", {
        hasApi: Boolean(api),
      });
      manualConsoleApiRef.current = api;
      if (api && sqlValue !== undefined && api.getQuery() !== sqlValue) {
        api.setQuery(sqlValue);
      }
      sqlRepl?.setConsoleApi(api);
    },
    [sqlRepl, sqlValue],
  );

  const handleManualRun = useCallback(() => {
    const manualConsoleApi = manualConsoleApiRef.current;
    const sql = manualQuery.trim() || manualConsoleApi?.getQuery()?.trim();
    if (!sql) {
      return;
    }

    onManualRun?.();

    if (onHomePage && onManualRunRequest) {
      onManualRunRequest(sql);
      return;
    }

    manualConsoleApi?.runQuery();
  }, [manualQuery, onHomePage, onManualRun, onManualRunRequest]);

  const handleManualSend = useCallback(() => {
    if (!sqlRepl || !manualVisualization || !sqlResult) {
      return;
    }

    const payload = manualVisualization.createPayload({
      result: sqlResult,
      selectedCatalogContext,
    });
    if (!payload) {
      return;
    }

    void sqlRepl.persistManualResultToChat(payload);
  }, [manualVisualization, selectedCatalogContext, sqlRepl, sqlResult]);

  const handleManualQueryChange = useCallback(
    (query: string) => {
      setManualQuery(query);
      onSqlChange?.(query);
    },
    [onSqlChange],
  );

  const content = aiButtonLabel;
  const nextMode: PromptMode = internalMode === "ai" ? "manual" : "ai";
  const modeButtonLabel = nextMode === "ai" ? "Chat" : "Manual";
  const showMinimalManualShell =
    manualShellVariant === "minimal" && internalMode === "manual";
  const showHomeManualComposer = onHomePage && showMinimalManualShell;
  const showManualAddToChatButton = !onHomePage && !integratedComposer;
  const useSegmentedModeToggle = manualShellVariant === "minimal";
  const showIntegratedComposer = integratedComposer;
  const showManualPane = internalMode === "manual";
  const showPromptPane = internalMode !== "manual";

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
            {showManualPane ? (
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
                    onFocusCapture={() =>
                      manualVisualization?.focusManualVisualization()
                    }
                    onPointerDownCapture={() =>
                      manualVisualization?.focusManualVisualization()
                    }
                  >
                    <DuckdbRepl
                      className={cn(
                        "h-full w-full border-r-0 p-0",
                        showMinimalManualShell && "border-0 bg-transparent",
                      )}
                      selectedDbIdentifier={selectedDb}
                      catalogContext={selectedCatalogContext}
                      onConsoleApiChangeAction={handleManualConsoleApiChange}
                      onQueryChangeAction={handleManualQueryChange}
                      onNoticeAction={onManualRunNotice}
                      onRunStateChangeAction={onManualRunStateChange}
                      onRunSuccessAction={onManualRunSuccess}
                      onRunShortcutAction={handleManualRun}
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
                      showSaveQueryButton={
                        !onHomePage && Boolean(sqlRepl?.saveQuery)
                      }
                      onSaveQueryAction={
                        !onHomePage ? sqlRepl?.saveQuery : undefined
                      }
                      isSavingQuery={sqlRepl?.isSavingQuery ?? false}
                      chartConfig={manualChartConfig}
                      onResultChangeAction={
                        manualVisualization?.handleReplResultChange
                      }
                    />
                  </div>
                  <div
                    className={cn(
                      "flex gap-2",
                      showMinimalManualShell
                        ? "items-center justify-between px-1 pb-1"
                        : showIntegratedComposer
                          ? "flex-wrap items-center justify-between border-t border-border/70 px-1 pt-3"
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
                      disabled={!manualQuery.trim()}
                      onClick={handleManualRun}
                    >
                      {showIntegratedComposer
                        ? "[Run SQL ▷]"
                        : showHomeManualComposer
                          ? "[Run in chat ▷]"
                          : "[Run ▷]"}
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
            ) : null}
            <div
              aria-hidden={!showPromptPane}
              className={cn(
                "grid overflow-hidden transition-[grid-template-rows,opacity,transform] duration-300 ease-out",
                showPromptPane
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
                          value={effectivePromptValue}
                          onChange={(event) =>
                            onPromptChange?.(event.currentTarget.value)
                          }
                          className={cn(
                            "flex-1 pr-4",
                            showIntegratedComposer
                              ? "min-h-18 pb-10"
                              : compact
                                ? "min-h-10 pb-10"
                                : "min-h-28 pb-10",
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
                            {showIntegratedComposer ? "[Ask AI |>]" : content}
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
