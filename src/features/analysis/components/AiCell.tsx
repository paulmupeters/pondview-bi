import { ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Response } from "@/components/ai-elements/response";
import { PromptErrorBanner } from "@/components/chat/prompt-error-banner";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import { getMessageText } from "@/features/analysis/ai-cell-message-utils";
import type { AnalysisCellState } from "@/features/analysis/analysis-reducer";
import { useAnalysisCellAi } from "@/features/analysis/use-analysis-cell-ai";
import type { NotebookSession } from "@/hooks/use-notebook-session";
import type { WorkspaceAnalysisCellEntry } from "@/lib/workspace/workspace-db";

type AiCellProps = {
  cell: AnalysisCellState;
  bootstrapPrompt?: string | null;
  entries: WorkspaceAnalysisCellEntry[];
  notebookSession: Pick<
    NotebookSession,
    "appendCellEntry" | "refreshUpdatedAt" | "updateCell"
  >;
  aiEnabled: boolean;
  onToggleAi: () => void;
  onBootstrapConsumed?: () => void;
};

export function AiCell({
  cell,
  bootstrapPrompt = null,
  entries,
  notebookSession,
  aiEnabled,
  onToggleAi,
  onBootstrapConsumed,
}: AiCellProps) {
  const {
    promptDraft,
    setPromptDraft,
    promptError,
    latestAssistantText,
    transcriptMessages,
    isAssistantThinking,
    submitPrompt,
  } = useAnalysisCellAi({
    cell,
    entries,
    notebookSession,
  });
  const [isTranscriptExpanded, setIsTranscriptExpanded] = useState(false);
  const consumedBootstrapKeyRef = useRef<string | null>(null);
  const transcriptTextEntries: Array<{
    id: string;
    role: "assistant" | "system" | "user";
    text: string;
  }> = [];
  for (const message of transcriptMessages) {
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

  useEffect(() => {
    if (!bootstrapPrompt) {
      consumedBootstrapKeyRef.current = null;
      return;
    }

    const bootstrapKey = `${cell.id}:${bootstrapPrompt}`;
    if (consumedBootstrapKeyRef.current === bootstrapKey) {
      return;
    }
    consumedBootstrapKeyRef.current = bootstrapKey;

    void submitPrompt(bootstrapPrompt).finally(() => {
      onBootstrapConsumed?.();
    });
  }, [bootstrapPrompt, cell.id, onBootstrapConsumed, submitPrompt]);

  if (!aiEnabled) {
    return (
      <div className="border bg-background">
        <button
          type="button"
          className="flex w-full items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Expand AI input"
          onClick={onToggleAi}
        >
          <ChevronDown className="h-4 w-4" />
          <Sparkles className="h-3.5 w-3.5" />
          AI
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {latestAssistantText || isAssistantThinking ? (
        <div className="rounded-lg border bg-background/80 px-3 py-2">
          {latestAssistantText ? (
            <Response className="text-sm">{latestAssistantText}</Response>
          ) : (
            <p className="text-sm text-muted-foreground">
              Assistant is working...
            </p>
          )}
        </div>
      ) : null}

      {promptError ? <PromptErrorBanner message={promptError} /> : null}

      {hasTranscript ? (
        <div className="my-2 bg-card">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground"
            onClick={() => setIsTranscriptExpanded((previous) => !previous)}
          >
            {isTranscriptExpanded
              ? "Hide transcript"
              : `Show transcript (${transcriptTextEntries.length})`}
          </Button>
          {isTranscriptExpanded ? (
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
          ) : null}
        </div>
      ) : null}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submitPrompt();
        }}
      >
        <div className="rounded-lg border">
          <div className="flex items-center border-b px-3 py-1.5 rounded-lg dark:bg-background">
            <button
              type="button"
              className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Collapse AI input"
              onClick={onToggleAi}
            >
              <ChevronUp className="h-4 w-4" />
              <Sparkles className="h-3.5 w-3.5" />
              AI
            </button>
          </div>
          <InputGroup className="border-0 shadow-none bg-transparent dark:bg-background items-end">
            <InputGroupTextarea
              value={promptDraft}
              onChange={(event) => setPromptDraft(event.target.value)}
              placeholder="Ask AI to refine this cell..."
              rows={2}
              disabled={isAssistantThinking}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                type="submit"
                size="sm"
                className="dark:bg-background"
                disabled={isAssistantThinking || !promptDraft.trim()}
              >
                {isAssistantThinking ? "Running..." : "Ask AI"}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </div>
      </form>
    </div>
  );
}
