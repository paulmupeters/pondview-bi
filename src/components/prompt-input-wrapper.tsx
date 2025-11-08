"use client";

import {
  CircleStackIcon,
  GlobeEuropeAfricaIcon,
  PaperClipIcon,
  Squares2X2Icon,
} from "@heroicons/react/24/outline";
import type { ChatStatus } from "ai";
import { useRef, useState } from "react";
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
  PromptInputSubmit,
  PromptInputTab,
  PromptInputTabBody,
  PromptInputTabItem,
  PromptInputTabLabel,
  PromptInputTextarea,
  usePromptInputAttachments,
} from "@/components/ai-elements/prompt-input";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useConnectedTables } from "@/hooks/use-connected-tables";
import { useUploadedFiles } from "@/hooks/use-uploaded-files";

interface PromptInputWrapperProps {
  onSubmit: (message: PromptInputMessage) => void;
  placeholder?: string;
  className?: string;
  status?: ChatStatus;
  onCreateDashboard?: () => void;
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
          className="!h-8 group"
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
                      <span className="ml-auto text-muted-foreground">
                        ✓
                      </span>
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
                        <span className="ml-auto text-muted-foreground">
                          ✓
                        </span>
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
  onCreateDashboard,
}: PromptInputWrapperProps) {
  const connectedTables = useConnectedTables();

  // Flatten the entries to show each table separately
  const getEntriesForDisplay = () => {
    const entries: Array<{ label: string; key: string }> = [];

    connectedTables.forEach((entry, idx) => {
      if (Array.isArray(entry.tables) && entry.tables.length > 0) {
        // Show each table separately
        entry.tables.forEach((tableName) => {
          entries.push({
            label: `${entry.databasePath} - ${entry.schema}.${tableName}`,
            key: `${entry.type}-${entry.databasePath}-${entry.schema}-${tableName}`,
          });
        });
      } else if (entry.table) {
        entries.push({
          label: `${entry.databasePath} - ${entry.table}`,
          key: `${entry.type}-${entry.databasePath}-${entry.table}-${idx}`,
        });
      } else if (entry.schema) {
        entries.push({
          label: `${entry.databasePath} - ${entry.schema}`,
          key: `${entry.type}-${entry.databasePath}-${entry.schema}-${idx}`,
        });
      }
    });

    return entries;
  };

  const displayEntries = getEntriesForDisplay();

  return (
    <PromptInput onSubmit={onSubmit} className={className} globalDrop multiple>
      <PromptInputBody>
        <PromptInputAttachments>
          {(attachment) => <PromptInputAttachment data={attachment} />}
        </PromptInputAttachments>
        <div className="flex items-start gap-2 justify-between w-full p-2">
          <PromptInputTextarea placeholder={placeholder} className="flex-1" />
          <PromptInputSubmit
            className="h-12 w-12 hover:bg-primary/70 shrink-0"
            status={status}
          />
        </div>
      </PromptInputBody>
      <PromptInputHeader>
        <FileAttachmentHoverCard />
        <PromptInputHoverCard>
          <PromptInputHoverCardTrigger>
            <PromptInputButton size="sm" variant="outline" className="group">
              <CircleStackIcon className="h-4 w-4 text-muted-foreground group-hover:text-primary-foreground" />
              <span className="group-hover:text-primary-foreground">
                Connected data
              </span>
            </PromptInputButton>
          </PromptInputHoverCardTrigger>
          <PromptInputHoverCardContent className="w-[300px] space-y-4 px-0 py-4 transform translate-y-[-10px]">
            <PromptInputTab>
              <PromptInputTabLabel>Connected data</PromptInputTabLabel>
              <PromptInputTabBody>
                {displayEntries.length > 0 ? (
                  displayEntries.map((entry) => (
                    <PromptInputTabItem key={entry.key}>
                      <GlobeEuropeAfricaIcon className="h-4 w-4 text-primary" />
                      <span className="truncate" dir="rtl">
                        {entry.label}
                      </span>
                    </PromptInputTabItem>
                  ))
                ) : (
                  <div className="px-3 py-1 text-xs text-muted-foreground">
                    No connected data.
                  </div>
                )}
              </PromptInputTabBody>
            </PromptInputTab>
            <div className="border-t px-3 pt-2 text-muted-foreground text-xs">
              Only data sources are included
            </div>
          </PromptInputHoverCardContent>
        </PromptInputHoverCard>
        <Tooltip>
          <TooltipTrigger asChild>
            <PromptInputButton
              size="sm"
              variant="outline"
              className="group"
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
      </PromptInputHeader>
    </PromptInput>
  );
}
