"use client";

import {
  ChatBubbleLeftRightIcon,
  CodeBracketIcon,
  GlobeEuropeAfricaIcon,
  PaperClipIcon,
  PresentationChartBarIcon,
  Squares2X2Icon,
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
import { ConnectedDataPanel } from "@/components/connected-data-panel";
import { DuckdbRepl } from "@/components/duckdb-shell/repl";
import { SqlAnalysisDisplay } from "@/components/sql-analysis-display";
import type { SqlConsoleApi } from "@/components/sql-console";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useUploadedFiles } from "@/hooks/use-uploaded-files";
import { cn } from "@/lib/utils";

type PromptMode = "ai" | "sql" | "chart";

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
  placeholder = "Ask a question about your data...",
  className,
  status,
  onHomePage = false,
  onCreateDashboard,
  onAddVisual,
  mode,
  onModeChange,
  pendingMode = null,
}: PromptInputWrapperProps) {
  const [internalMode, setInternalMode] = useState<PromptMode>(mode ?? "ai");
  const [selectedDb, setSelectedDb] = useState<string | undefined>();
  const [sqlConsoleApi, setSqlConsoleApi] = useState<SqlConsoleApi | null>(
    null,
  );

  const promptMode = mode ?? internalMode;

  useEffect(() => {
    if (mode) {
      setInternalMode(mode);
    }
  }, [mode]);

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

  const handleChartSubmit = () => {
    if (!onAddVisual || pendingMode === "chart") {
      return;
    }
    onAddVisual();
  };

  const aiButtonLabel = useMemo(() => {
    if (pendingMode === "ai" && (!status || status === "idle" as ChatStatus)) {
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

  const chartButtonLabel =
    pendingMode === "chart" ? "[ADDING …]" : "[Add visual]";

  const content = aiButtonLabel;

  // Get display name for selected database
  const getSelectedDbLabel = (): string | undefined => {
    if (!selectedDb) return undefined;
    // Try to extract a readable name from the identifier
    // Format is usually "type:path" or "attachAs"
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
          {promptMode === "sql" && (
            <div className="flex flex-col gap-3 w-full">
              <DuckdbRepl
                selectedDbLabel={getSelectedDbLabel()}
                selectedDbIdentifier={selectedDb}
                onRunSql={onRunSql}
                onConsoleApiChange={setSqlConsoleApi}
              />
            </div>
          )}
          {promptMode === "chart" && (
            <div className="flex flex-col gap-3">
              <SqlAnalysisDisplay
                data={{
                  stage: "initial",
                  progress: 0,
                  executionTime: 0,
                  rowCount: 0,
                  columns: [],
                  rows: [],
                  dbIdentifier: selectedDb,
                }}
                stage="initial"
                progress={1}
                showStageIndicator={false}
                className="max-w-3xl w-full"
                selectedDbLabel={getSelectedDbLabel()}
              />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleChartSubmit}
                  disabled={!onAddVisual || pendingMode === "chart"}
                  className="text-sm font-mono border-border hover:bg-primary/80 hover:text-primary-foreground hover:border-primary mx-2 dark:hover:bg-primary/80 dark:hover:text-primary-foreground dark:hover:border-primary"
                >
                  {chartButtonLabel}
                </Button>
              </div>
            </div>
          )}
        </PromptInputBody>
        <PromptInputHeader className="border-b p-2 border-border">
          <div className="flex items-center gap-2 justify-between w-full">
            <div className="flex items-center gap-2">
              <ConnectedDataPanel
                selectedDb={selectedDb}
                onSelect={setSelectedDb}
                className="h-full"
                onInsertTable={handleInsertTableIntoSql}
              />
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
              <ToggleGroupItem value="sql">
                <CodeBracketIcon className="h-4 w-4 group-hover:text-primary-foreground" />
                <span>SQL mode</span>
              </ToggleGroupItem>
              <ToggleGroupItem value="chart">
                <PresentationChartBarIcon className="h-4 w-4 group-hover:text-primary-foreground" />
                <span>Chart mode</span>
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </PromptInputHeader>
      </PromptInput>
    </div>
  );
}
