import type { UIMessage } from "ai";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useState } from "react";
import { Response } from "@/components/ai-elements/response";
import { PromptErrorBanner } from "@/components/chat/prompt-error-banner";
import { Button } from "@/components/ui/button";
import { getMessageText } from "@/features/analysis/ai-cell-message-utils";
import { animations, getAnimationFrame } from "@/lib/animations";

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
};

const STREAMING_ANIMATION = "bars";

export function AiResponseBanner({ ai }: AiResponseBannerProps) {
  const [isResponseExpanded, setIsResponseExpanded] = useState(true);
  const [isTranscriptExpanded, setIsTranscriptExpanded] = useState(false);
  const [streamingAnimationFrame, setStreamingAnimationFrame] = useState(() =>
    getAnimationFrame(STREAMING_ANIMATION, 0),
  );

  const transcriptTextEntries: Array<{
    id: string;
    role: "assistant" | "system" | "user";
    text: string;
  }> = [];
  for (const message of ai.transcriptMessages) {
    const text = getMessageText(message);
    if (!text) {
      continue;
    }
    transcriptTextEntries.push({
      id: message.id,
      role: message.role,
      text,
    });
  }
  const hasTranscript = transcriptTextEntries.length > 0;
  const hasResponse = !!(ai.latestAssistantText || ai.isAssistantThinking);

  // Auto-expand when a new response arrives
  useEffect(() => {
    if (hasResponse) {
      setIsResponseExpanded(true);
    }
  }, [hasResponse]);

  useEffect(() => {
    if (!ai.isAssistantThinking || ai.latestAssistantText) {
      setStreamingAnimationFrame(getAnimationFrame(STREAMING_ANIMATION, 0));
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

  if (!hasResponse && !ai.promptError && !hasTranscript) {
    return null;
  }

  return (
    <div className="rounded-lg border bg-muted/30">
      {hasResponse && (
        <>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setIsResponseExpanded((prev) => !prev)}
          >
            {isResponseExpanded ? (
              <ChevronUp className="size-3.5" />
            ) : (
              <ChevronDown className="size-3.5" />
            )}
            <span>AI Response</span>
            {!isResponseExpanded && ai.latestAssistantText && (
              <span className="ml-1 min-w-0 truncate text-muted-foreground/60">
                — {ai.latestAssistantText.slice(0, 80)}...
              </span>
            )}
          </button>
          {isResponseExpanded && (
            <div className="border-t px-3 py-2">
              {ai.latestAssistantText ? (
                <Response className="text-sm">
                  {ai.latestAssistantText}
                </Response>
              ) : (
                <p
                  role="status"
                  aria-label="Assistant is working"
                  className="flex items-center gap-2 text-sm text-muted-foreground"
                >
                  <span className="font-mono text-foreground">
                    {streamingAnimationFrame}
                  </span>
                  <span>Streaming response</span>
                </p>
              )}
            </div>
          )}
        </>
      )}

      {ai.promptError ? (
        <div className="border-t">
          <PromptErrorBanner message={ai.promptError} />
        </div>
      ) : null}

      {hasTranscript ? (
        <div className="border-t px-3 py-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-xs text-muted-foreground"
            onClick={() => setIsTranscriptExpanded((prev) => !prev)}
          >
            {isTranscriptExpanded
              ? "Hide transcript"
              : `Show transcript (${transcriptTextEntries.length})`}
          </Button>
          {isTranscriptExpanded && (
            <div className="mt-2 space-y-2 rounded-lg border bg-background/80 p-2">
              {transcriptTextEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-md border bg-background px-3 py-2"
                >
                  <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {entry.role}
                  </p>
                  <Response className="text-sm">{entry.text}</Response>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
