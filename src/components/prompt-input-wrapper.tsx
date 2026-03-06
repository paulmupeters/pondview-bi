import {
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
import { ConnectedDataPanel } from "@/components/connected-data-panel";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useUploadedFiles } from "@/hooks/use-uploaded-files";
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
  onInsertTable?: (tableName: string) => void;
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
  const deferredUploadsMessage = "File uploads are deferred in browser mode.";
  // Filter uploaded files based on search query
  const filteredFiles = uploadedFiles.filter((file) =>
    file.originalName.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // Handle adding an uploaded file as attachment
  const handleAddUploadedFile = async (file: (typeof uploadedFiles)[0]) => {
    console.info(deferredUploadsMessage, file.fileId);
    setSelectedFileIds((prev) => new Set(prev).add(file.fileId));
    alert(deferredUploadsMessage);
  };

  // Handle uploading a new file
  const handleUploadNewFile = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    e.preventDefault();
    alert(deferredUploadsMessage);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
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
  const [internalMode, setInternalMode] = useState<PromptMode>(
    mode ?? "ai",
  );

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
  const modeButtonLabel =
    nextMode === "ai" ? "Switch to AI" : "Switch to Manual";

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
          <PromptInputHeader
            className={cn(
              "p-0 overflow-hidden",
            )}
          >
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
                  <GlobeEuropeAfricaIcon className="h-4 w-4" />
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
