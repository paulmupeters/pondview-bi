import {
  ChatBubbleBottomCenterTextIcon,
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
import { ConnectedDataPanel } from "@/components/connected-data-panel";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useUploadedFiles } from "@/hooks/use-uploaded-files";
import type { ExplorerInsertPayload } from "@/lib/duckdb/table-reference";
import { getUploadedFileBlob, persistUploadedFile } from "@/lib/uploaded-files";
import { cn } from "@/lib/utils";

export type PromptMode = "ai" | "manual";

interface PromptInputWrapperProps {
  onSubmit: (message: PromptInputMessage) => void;
  placeholder?: string;
  className?: string;
  status?: ChatStatus;
  showHeader?: boolean;
  showAiInput?: boolean;
  onHomePage?: boolean;
  compact?: boolean;
  onCreateDashboard?: () => void;
  onAddVisual?: () => void;
  mode?: PromptMode;
  onModeChange?: (mode: PromptMode) => void;
  pendingMode?: PromptMode | null;
  selectedDb?: string;
  onSelectDb?: (db: string) => void;
  onInsertTable?: (payload: ExplorerInsertPayload) => void;
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
      <PromptInputHoverCardTrigger>
        <PromptInputButton
          size="icon-sm"
          variant="outline"
          className="h-8! group dark:hover:bg-accent"
        >
          <PaperClipIcon className="h-4 w-4 text-muted-foreground group-hover:text-primary-foreground" />
        </PromptInputButton>
      </PromptInputHoverCardTrigger>
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
              {uploadedFiles.length === 0
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
            </div>
          </PromptInputCommandList>
        </PromptInputCommand>
      </PromptInputHoverCardContent>
    </PromptInputHoverCard>
  );
}

export function PromptInputWrapper({
  onSubmit,
  placeholder = "Ask a question about your data...",
  className,
  status,
  showHeader = true,
  showAiInput = true,
  onHomePage = false,
  compact = false,
  onCreateDashboard,
  onAddVisual: _onAddVisual,
  mode,
  onModeChange,
  pendingMode = null,
  selectedDb,
  onSelectDb,
  onInsertTable,
}: PromptInputWrapperProps) {
  const [internalMode, setInternalMode] = useState<PromptMode>(mode ?? "ai");

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

  const content = aiButtonLabel;
  const nextMode: PromptMode = internalMode === "ai" ? "manual" : "ai";
  const modeButtonLabel = nextMode === "ai" ? "Chat" : "Manual";

  if (!showHeader && !showAiInput) {
    return null;
  }

  return (
    <div className="flex w-full mx-auto">
      <PromptInput
        onSubmit={handlePromptSubmit}
        className={cn("flex-1 w-full flex flex-row", className)}
        globalDrop
        multiple
      >
        {showAiInput && (
          <PromptInputBody>
            <PromptInputAttachments>
              {(attachment) => <PromptInputAttachment data={attachment} />}
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
        )}
        {showHeader && (
          <PromptInputHeader className={cn("p-0 overflow-hidden")}>
            <div className="flex items-center gap-1.5 justify-between w-full m-3">
              <div className="flex items-center gap-1.5">
                {onHomePage && (
                  <ConnectedDataPanel
                    selectedDb={selectedDb}
                    onSelect={(db) => onSelectDb?.(db)}
                    className="h-full"
                    onInsertTable={onInsertTable}
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
            </div>
          </PromptInputHeader>
        )}
      </PromptInput>
    </div>
  );
}
