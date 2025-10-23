"use client";

import {
  BeakerIcon,
  CircleStackIcon,
  NumberedListIcon,
  PaperClipIcon,
  SwatchIcon,
} from "@heroicons/react/24/outline";
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
          <PromptInputHoverCardContent className="w-[400px] p-0">
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
        <PromptInputHoverCard>
          <PromptInputHoverCardTrigger>
            <PromptInputButton size="sm" variant="outline">
              <BeakerIcon className="h-4 w-4 text-muted-foreground" />
            </PromptInputButton>
          </PromptInputHoverCardTrigger>
          <PromptInputHoverCardContent className="divide-y overflow-hidden p-0">
            <div className="space-y-2 p-3">
              <p className="font-medium text-muted-foreground text-sm">
                Project configuration
              </p>
              <ul>
                <li className="flex items-center gap-2">
                  <SwatchIcon className="h-4 w-4 text-primary" />
                  <span>style</span>
                </li>
                <li className="flex items-center gap-2">
                  <NumberedListIcon className="h-4 w-4 text-primary" />
                  <span>rules</span>
                </li>
              </ul>
            </div>
          </PromptInputHoverCardContent>
        </PromptInputHoverCard>
        <PromptInputHoverCard>
          <PromptInputHoverCardTrigger>
            <PromptInputButton size="sm" variant="outline">
              <CircleStackIcon className="h-4 w-4 text-muted-foreground" />
              <span>Connected data</span>
            </PromptInputButton>
          </PromptInputHoverCardTrigger>
          <PromptInputHoverCardContent className="w-[300px] space-y-4 px-0 py-3">
            <PromptInputTab>
              <PromptInputTabLabel>Active</PromptInputTabLabel>
              <PromptInputTabBody>
                <PromptInputTabItem>
                  <GlobeIcon className="h-4 w-4 text-primary" />
                  <span className="truncate" dir="rtl">
                    md:my-db.db - main.unicorns
                  </span>
                </PromptInputTabItem>
              </PromptInputTabBody>
            </PromptInputTab>
            <PromptInputTab>
              <PromptInputTabLabel>Other data</PromptInputTabLabel>
              <PromptInputTabBody>
                <PromptInputTabItem>
                  <GlobeIcon className="h-4 w-4 text-primary" />
                  <span className="truncate" dir="rtl">
                    nyc.taxi
                  </span>
                </PromptInputTabItem>
                <PromptInputTabItem>
                  <GlobeIcon className="h-4 w-4 text-primary" />
                  <span className="truncate" dir="rtl">
                    nyc.rideshare
                  </span>
                </PromptInputTabItem>
                <PromptInputTabItem>
                  <GlobeIcon className="h-4 w-4 text-primary" />
                  <span className="truncate" dir="rtl">
                    nyc.service_requests
                  </span>
                </PromptInputTabItem>
                <PromptInputTabItem>
                  <GlobeIcon className="h-4 w-4 text-primary" />
                  <span className="truncate" dir="rtl">
                    nyc.taxi
                  </span>
                </PromptInputTabItem>
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
