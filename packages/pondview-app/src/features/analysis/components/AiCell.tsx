import type { UIMessage } from "ai";
import { useEffect, useState } from "react";
import { Response } from "@/components/ai-elements/response";
import { PromptErrorBanner } from "@/components/chat/prompt-error-banner";
import { SqlAnalysisDisplay } from "@/components/sql-analysis-display";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  buildTranscriptMessageBlocks,
  getLatestUserText,
  type TranscriptMessageBlock,
} from "@/features/analysis/ai-cell-message-utils";
import { animations, getAnimationFrame } from "@/lib/animations";
import {
  useExecuteSqlRawOutputPreference,
  useShowToolCallsPreference,
} from "@/lib/chat-display-preferences";

export type AiCellState = {
  promptDraft: string;
  setPromptDraft: (value: string) => void;
  promptError: string | null;
  latestAssistantText: string | null;
  transcriptMessages: UIMessage[];
  isAssistantThinking: boolean;
  submitPrompt: (prompt?: string) => Promise<void>;
};

type AiResponseBannerProps = {
  ai: AiCellState;
  showPromptError?: boolean;
};

const STREAMING_ANIMATION = "wave";

export function AiResponseBanner({
  ai,
  showPromptError = true,
}: AiResponseBannerProps) {
  const [isTranscriptExpanded, setIsTranscriptExpanded] = useState(false);
  const [streamingAnimationFrame, setStreamingAnimationFrame] = useState(() =>
    getAnimationFrame(STREAMING_ANIMATION, 0),
  );
  const showToolCalls = useShowToolCallsPreference();
  const showExecuteSqlRawOutput = useExecuteSqlRawOutputPreference();

  const transcriptEntries: Array<{
    id: string;
    role: "assistant" | "system" | "user";
    blocks: TranscriptMessageBlock[];
  }> = [];
  for (const message of ai.transcriptMessages) {
    const blocks = buildTranscriptMessageBlocks(message, {
      showToolCalls,
      showExecuteSqlRawOutput,
    });
    if (blocks.length === 0) {
      continue;
    }
    transcriptEntries.push({
      id: message.id,
      role: message.role,
      blocks,
    });
  }
  const hasTranscript = transcriptEntries.length > 0;
  const latestUserText = getLatestUserText(ai.transcriptMessages);
  const hasUserPrompt = Boolean(latestUserText);
  const hasResponse = !!(ai.latestAssistantText || ai.isAssistantThinking);
  const shouldShowPromptError = showPromptError && Boolean(ai.promptError);

  useEffect(() => {
    if (!ai.isAssistantThinking) {
      setStreamingAnimationFrame(getAnimationFrame(STREAMING_ANIMATION, 0));
      return;
    }

    if (ai.latestAssistantText) {
      return;
    }

    let frameIndex = 0;
    const intervalId = window.setInterval(() => {
      frameIndex += 1;
      setStreamingAnimationFrame(
        getAnimationFrame(STREAMING_ANIMATION, frameIndex),
      );
    }, animations[STREAMING_ANIMATION].interval);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [ai.isAssistantThinking, ai.latestAssistantText]);

  if (
    !hasUserPrompt &&
    !hasResponse &&
    !shouldShowPromptError &&
    !hasTranscript
  ) {
    return null;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-primary/15 bg-primary/[0.035] shadow-sm shadow-primary/5">
      <div className="space-y-1.5 border-b border-primary/10 px-3 py-2.5">
        {latestUserText ? (
          <Response className="text-[15px] font-medium leading-snug text-foreground">
            {latestUserText}
          </Response>
        ) : (
          <span className="block text-sm text-muted-foreground">
            Contextual analysis activity
          </span>
        )}
      </div>

      {hasResponse && (
        <div className="border-t border-primary/10 bg-background/55 px-3 py-2.5">
          <p className="sr-only">AI Response</p>
          {ai.latestAssistantText ? (
            <Response className="text-sm leading-relaxed text-foreground/85">
              {ai.latestAssistantText}
            </Response>
          ) : (
            <output
              aria-label="Assistant is working"
              className="flex items-center gap-2 text-sm text-muted-foreground"
            >
              <span className="font-mono text-xs text-foreground">
                {streamingAnimationFrame}
              </span>
              <span>Streaming response</span>
            </output>
          )}
        </div>
      )}

      {shouldShowPromptError ? (
        <div className="border-t border-primary/10">
          <PromptErrorBanner message={ai.promptError} />
        </div>
      ) : null}

      {hasTranscript ? (
        <div className="border-t border-primary/10 px-3 py-1.5">
          {isTranscriptExpanded && (
            <div className="mb-2 space-y-2 rounded-lg border border-border/60 bg-background/70 p-2">
              {transcriptEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-md border border-border/50 bg-background px-3 py-2"
                >
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/70">
                    {entry.role}
                  </p>
                  <div className="space-y-2">
                    {entry.blocks.map((block) => (
                      <TranscriptBlockView key={block.key} block={block} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-xs text-muted-foreground"
            onClick={() => setIsTranscriptExpanded((prev) => !prev)}
          >
            {isTranscriptExpanded
              ? "Hide transcript"
              : `Show transcript (${transcriptEntries.length})`}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function TranscriptBlockView({ block }: { block: TranscriptMessageBlock }) {
  if (block.kind === "text") {
    return <Response className="text-sm">{block.text}</Response>;
  }

  if (block.kind === "sql-result") {
    return (
      <div className="overflow-hidden rounded-md border border-border bg-background">
        <SqlAnalysisDisplay data={block.data} showStageIndicator={false} />
      </div>
    );
  }

  return <TranscriptToolCall block={block} />;
}

function TranscriptToolCall({
  block,
}: {
  block: Extract<TranscriptMessageBlock, { kind: "tool-call" }>;
}) {
  return (
    <div className="rounded-md border border-dashed border-border/70 bg-muted/20 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/70">
        <span>Tool call</span>
        <code className="rounded-sm border border-border/50 bg-background px-1.5 py-0.5 font-mono text-[11px] normal-case text-foreground">
          {block.toolName}
        </code>
      </div>

      {block.summaryText ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {block.summaryText}
        </p>
      ) : null}

      {block.sql ? (
        <pre className="mt-2 overflow-x-auto rounded-md border border-border bg-background px-3 py-2 text-xs font-mono text-foreground">
          <code>{block.sql}</code>
        </pre>
      ) : null}

      {block.errorText ? (
        <div className="mt-2 rounded-md border border-destructive/15 bg-destructive/5 px-3 py-2 font-mono text-xs text-destructive">
          {block.errorText}
        </div>
      ) : null}

      {block.rawOutputJson ? (
        <Collapsible className="mt-2">
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-xs text-muted-foreground"
            >
              Show raw JSON
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <pre className="overflow-x-auto rounded-md border border-border bg-background px-3 py-2 text-xs font-mono text-foreground">
              <code>{block.rawOutputJson}</code>
            </pre>
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </div>
  );
}
