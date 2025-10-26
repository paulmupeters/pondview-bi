"use client";

import { CircleStackIcon, PaperClipIcon } from "@heroicons/react/24/outline";
import type { ChatStatus } from "ai";
import { GlobeIcon } from "lucide-react";
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
  PromptInputFooter,
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
} from "@/components/ai-elements/prompt-input";
import { useConnectedTables } from "@/hooks/use-connected-tables";

interface PromptInputWrapperProps {
  onSubmit: (message: PromptInputMessage) => void;
  placeholder?: string;
  className?: string;
  status?: ChatStatus;
}

export function PromptInputWrapper({
  onSubmit,
  placeholder = "Ask a question about your data...",
  className,
  status,
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
        <PromptInputTextarea placeholder={placeholder} />
      </PromptInputBody>
      <PromptInputHeader>
        <PromptInputHoverCard>
          <PromptInputHoverCardTrigger>
            <PromptInputButton
              size="icon-sm"
              variant="outline"
              className="!h-8"
            >
              <PaperClipIcon className="h-4 w-4 text-muted-foreground" />
            </PromptInputButton>
          </PromptInputHoverCardTrigger>
          <PromptInputHoverCardContent className="w-[400px] p-0 transform translate-y-[-10px]">
            <PromptInputCommand>
              <PromptInputCommandInput
                className="border-none focus-visible:ring-0"
                placeholder="Search data files"
              />
              <PromptInputCommandList>
                <PromptInputCommandEmpty className="p-3 text-muted-foreground text-sm">
                  No results found.
                </PromptInputCommandEmpty>
                <PromptInputCommandGroup heading="Added">
                  <PromptInputCommandItem>
                    <GlobeIcon />
                    <span>transactions.csv</span>
                    <span className="ml-auto text-muted-foreground">✓</span>
                  </PromptInputCommandItem>
                  <PromptInputCommandItem>
                    <GlobeIcon />
                    <span>products.csv</span>
                    <span className="ml-auto text-muted-foreground">✓</span>
                  </PromptInputCommandItem>
                </PromptInputCommandGroup>
                <PromptInputCommandSeparator />
                <PromptInputCommandGroup heading="Uploaded Files">
                  <PromptInputCommandItem>
                    <GlobeIcon />
                    <span>client_data.csv</span>
                  </PromptInputCommandItem>
                  <PromptInputCommandItem>
                    <GlobeIcon />
                    <span>product_data.csv</span>
                  </PromptInputCommandItem>
                  <PromptInputCommandItem>
                    <GlobeIcon />
                    <span>users.xlsx</span>
                  </PromptInputCommandItem>
                </PromptInputCommandGroup>
              </PromptInputCommandList>
            </PromptInputCommand>
          </PromptInputHoverCardContent>
        </PromptInputHoverCard>
        {/* <PromptInputHoverCard>
          <PromptInputHoverCardTrigger>
            <PromptInputButton size="sm" variant="outline">
              <BeakerIcon className="h-4 w-4 text-muted-foreground" />
            </PromptInputButton>
          </PromptInputHoverCardTrigger>
          <PromptInputHoverCardContent className="overflow-hidden p-0">
            <div className="space-y-3 p-3">
              <p className="font-medium text-muted-foreground text-sm">
                Rules:
              </p>
              <div className="rounded border border-border bg-muted/50 p-2 text-sm">
                <div className="max-h-[200px] space-y-1 overflow-y-auto text-muted-foreground">
                  <p>• Rule 1</p>
                  <p>• Rule 2</p>
                  <p>• Rule 3</p>
                </div>
              </div>
              <PromptInputButton size="sm" variant="outline" className="w-full">
                Edit Rules
              </PromptInputButton>
            </div>
          </PromptInputHoverCardContent>
        </PromptInputHoverCard> */}
        <PromptInputHoverCard>
          <PromptInputHoverCardTrigger>
            <PromptInputButton size="sm" variant="outline">
              <CircleStackIcon className="h-4 w-4 text-muted-foreground" />
              <span>Connected data</span>
            </PromptInputButton>
          </PromptInputHoverCardTrigger>
          <PromptInputHoverCardContent className="w-[300px] space-y-4 px-0 py-4 transform translate-y-[-10px]">
            <PromptInputTab>
              <PromptInputTabLabel>Connected data</PromptInputTabLabel>
              <PromptInputTabBody>
                {displayEntries.length > 0 ? (
                  displayEntries.map((entry) => (
                    <PromptInputTabItem key={entry.key}>
                      <GlobeIcon className="h-4 w-4 text-primary" />
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
      </PromptInputHeader>
      <PromptInputFooter className="flex items-end justify-end gap-2">
        <PromptInputSubmit
          className="h-12 w-12 hover:bg-primary/70"
          status={status}
        />
      </PromptInputFooter>
    </PromptInput>
  );
}
