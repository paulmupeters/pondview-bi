import type { UIMessage } from "@ai-sdk/react";
import { TrashIcon } from "@heroicons/react/24/outline";
import { type ReactNode, useMemo, useState } from "react";
import {
  Response,
} from "@/components/ai-elements/response";
import {
  Tool,
  ToolContent,
  type ToolErrorText,
  ToolHeader,
  ToolInput,
  type ToolInputValue,
  ToolOutput,
  type ToolOutputValue,
  type ToolState,
} from "@/components/ai-elements/tool";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ToolMessagePart = UIMessage["parts"][number] & {
  type: `tool-${string}`;
  state?: ToolState;
  input?: ToolInputValue;
  output?: ToolOutputValue;
  result?: ToolOutputValue;
  errorText?: ToolErrorText;
  error?: unknown;
};

type NotebookCellTranscriptProps = {
  messages: UIMessage[];
  isAssistantThinking: boolean;
  showToolCalls: boolean;
  showExecuteSqlRawOutput: boolean;
  onRemoveMessage: (messageId: string) => Promise<void>;
  className?: string;
};

function getMessagePartKey({
  messageId,
  part,
  partIndex,
}: {
  messageId: string;
  part: UIMessage["parts"][number];
  partIndex: number;
}): string {
  if (part.type === "text") {
    const textKey = typeof part.text === "string" ? part.text : "text";
    return `${messageId}-text-${textKey}`;
  }

  if (isToolMessagePart(part)) {
    const toolCallId =
      "toolCallId" in part && typeof part.toolCallId === "string"
        ? part.toolCallId
        : `${part.type}-${partIndex}`;
    return `${messageId}-${toolCallId}`;
  }

  return `${messageId}-${part.type}-${partIndex}`;
}

function isToolMessagePart(
  part: UIMessage["parts"][number],
): part is ToolMessagePart {
  return part.type.startsWith("tool-");
}

function deriveToolState(part: ToolMessagePart): ToolState {
  if (part.state) {
    return part.state;
  }

  if (part.errorText || typeof part.error === "string") {
    return "output-error";
  }

  if (
    typeof part.output !== "undefined" ||
    typeof part.result !== "undefined"
  ) {
    return "output-available";
  }

  if (typeof part.input !== "undefined") {
    return "input-available";
  }

  return "input-streaming";
}

function getToolOutput(part: ToolMessagePart): ToolOutputValue | undefined {
  if (typeof part.output !== "undefined") {
    return part.output;
  }

  return part.result;
}

function getToolErrorText(part: ToolMessagePart): ToolErrorText {
  if (typeof part.errorText === "string" && part.errorText.trim()) {
    return part.errorText;
  }

  if (typeof part.error === "string" && part.error.trim()) {
    return part.error;
  }

  return undefined;
}

function messageHasToolError(message: UIMessage): boolean {
  return (message.parts ?? []).some((part) => {
    if (!isToolMessagePart(part)) {
      return false;
    }

    return Boolean(getToolErrorText(part));
  });
}

function hasRenderableMessageContent(
  message: UIMessage,
  showToolCalls: boolean,
): boolean {
  return (message.parts ?? []).some((part) => {
    if (part.type === "text") {
      return Boolean(part.text?.trim());
    }

    if (isToolMessagePart(part)) {
      return showToolCalls || Boolean(getToolErrorText(part));
    }

    return false;
  });
}

function renderToolPart(params: {
  messageId: string;
  part: ToolMessagePart;
  partIndex: number;
  showExecuteSqlRawOutput: boolean;
}): ReactNode {
  const { messageId, part, partIndex, showExecuteSqlRawOutput } = params;
  const toolState = deriveToolState(part);
  const toolOutput = getToolOutput(part);
  const toolErrorText = getToolErrorText(part);
  const showToolOutput =
    showExecuteSqlRawOutput || Boolean(toolErrorText) || part.type !== "tool-execute_final_sql";

  return (
    <div
      key={getMessagePartKey({
        messageId,
        part,
        partIndex,
      })}
      className="w-full"
    >
      <Tool defaultOpen={Boolean(toolErrorText)}>
        <ToolHeader state={toolState} type={part.type} />
        <ToolContent>
          {typeof part.input !== "undefined" ? (
            <ToolInput input={part.input} />
          ) : null}
          {showToolOutput ? (
            <ToolOutput errorText={toolErrorText} output={toolOutput} />
          ) : null}
        </ToolContent>
      </Tool>
    </div>
  );
}

function renderLatestRunningToolPreview(
  messages: UIMessage[],
  showExecuteSqlRawOutput: boolean,
): ReactNode {
  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = messages[messageIndex];

    for (
      let partIndex = (message.parts?.length ?? 0) - 1;
      partIndex >= 0;
      partIndex -= 1
    ) {
      const part = message.parts?.[partIndex];
      if (!part || !isToolMessagePart(part)) {
        continue;
      }

      return renderToolPart({
        messageId: message.id,
        part,
        partIndex,
        showExecuteSqlRawOutput,
      });
    }
  }

  const latestText = [...messages]
    .reverse()
    .flatMap((message) =>
      (message.parts ?? [])
        .filter((part): part is UIMessage["parts"][number] & { type: "text"; text: string } =>
          part.type === "text" && typeof part.text === "string" && Boolean(part.text.trim()),
        )
        .slice(-1)
        .map((part) => ({ messageId: message.id, part })),
    )[0];

  if (!latestText) {
    return (
      <div className="px-4 py-3 text-sm text-muted-foreground">
        Assistant is working…
      </div>
    );
  }

  return (
    <div key={`${latestText.messageId}-running-text`} className="px-4 py-3">
      <Response>{latestText.part.text}</Response>
    </div>
  );
}

export function NotebookCellTranscript({
  messages,
  isAssistantThinking,
  showToolCalls,
  showExecuteSqlRawOutput,
  onRemoveMessage,
  className,
}: NotebookCellTranscriptProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const assistantMessages = useMemo(
    () =>
      messages.filter(
        (message) =>
          message.role === "assistant" &&
          hasRenderableMessageContent(message, showToolCalls),
      ),
    [messages, showToolCalls],
  );
  const hasAssistantOutput = assistantMessages.length > 0;
  const cellHasError = assistantMessages.some(messageHasToolError);
  const transcriptExpanded = isAssistantThinking || cellHasError || isExpanded;
  const transcriptButtonLabel = isAssistantThinking
    ? "Transcript open while running"
    : cellHasError
      ? "Transcript open on error"
      : transcriptExpanded
        ? "Hide transcript"
        : "Show transcript";
  const canToggleTranscript = !isAssistantThinking && !cellHasError;

  return (
    <div className={cn("rounded-lg border border-border/70 bg-muted/20", className)}>
      <div className="flex items-center justify-between px-4 py-2">
        <span className="text-xs font-mono text-muted-foreground">
          Transcript
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground font-mono"
          disabled={!canToggleTranscript}
          onClick={() => setIsExpanded((previous) => !previous)}
        >
          {transcriptButtonLabel}
        </Button>
      </div>

      {transcriptExpanded ? (
        <div className="border-t border-border/60">
          {isAssistantThinking
            ? renderLatestRunningToolPreview(
                assistantMessages,
                showExecuteSqlRawOutput,
              )
            : assistantMessages.map((message) => (
                <div
                  key={message.id}
                  className="group relative border-b border-border/50 px-4 py-3 last:border-b-0"
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2 h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100 z-30"
                    onClick={(event) => {
                      event.stopPropagation();
                      void onRemoveMessage(message.id);
                    }}
                    aria-label="Remove message"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </Button>
                  <div className="flex flex-col gap-3 pr-8">
                    {message.parts?.map((part, partIndex) => {
                      if (
                        part.type === "text" &&
                        typeof part.text === "string" &&
                        part.text.trim()
                      ) {
                        return (
                          <Response
                            key={getMessagePartKey({
                              messageId: message.id,
                              part,
                              partIndex,
                            })}
                          >
                            {part.text}
                          </Response>
                        );
                      }

                      if (isToolMessagePart(part)) {
                        const toolErrorText = getToolErrorText(part);
                        if (!showToolCalls && !toolErrorText) {
                          return null;
                        }

                        return renderToolPart({
                          messageId: message.id,
                          part,
                          partIndex,
                          showExecuteSqlRawOutput,
                        });
                      }

                      return null;
                    })}
                  </div>
                </div>
              ))}
        </div>
      ) : null}
    </div>
  );
}
