import type { UIMessage } from "@ai-sdk/react";
import { TrashIcon } from "@heroicons/react/24/outline";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Response } from "@/components/ai-elements/response";
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
import { GeneratedSqlBlock } from "@/components/chat/generated-sql-block";
import type { VisualizationEntry } from "@/components/chat/hooks/use-visualization-selection";
import {
  extractSqlArtifactParts,
  getTopLevelPartIndex,
  getVisualizationIdForArtifact,
} from "@/components/chat/sql-artifact-utils";
import { SqlAnalysisDisplay } from "@/components/sql-analysis-display";
import type { SqlAnalysisData } from "@/components/sql-analysis-display.types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ChatMessageThreadProps = {
  messages: UIMessage[];
  status: string;
  animationFrame: string;
  verbAiIsThinking: string;
  executeSqlArtifactType: string;
  visualizationMap: Map<string, VisualizationEntry>;
  onRemoveMessage: (messageId: string) => Promise<void>;
  conversationClassName: string;
  contentSpacingClassName: string;
  messagePaddingClassName: string;
  userResponsePaddingClassName: string;
  showToolCalls: boolean;
  showExecuteSqlRawOutput: boolean;
  footerContent?: ReactNode;
};

export type NotebookCell = {
  id: string;
  userMessage: UIMessage | null;
  assistantMessages: UIMessage[];
};

export function groupMessagesIntoCells(messages: UIMessage[]): NotebookCell[] {
  const cells: NotebookCell[] = [];
  let current: NotebookCell | null = null;

  for (const message of messages) {
    if (message.role === "user") {
      current = {
        id: message.id,
        userMessage: message,
        assistantMessages: [],
      };
      cells.push(current);
    } else {
      if (!current) {
        current = {
          id: message.id,
          userMessage: null,
          assistantMessages: [],
        };
        cells.push(current);
      }
      current.assistantMessages.push(message);
    }
  }

  return cells;
}

type ToolMessagePart = UIMessage["parts"][number] & {
  type: `tool-${string}`;
  state?: ToolState;
  input?: ToolInputValue;
  output?: ToolOutputValue;
  result?: ToolOutputValue;
  errorText?: ToolErrorText;
  error?: unknown;
};

type SqlArtifactEntry = {
  partIndex: number;
  data: {
    id?: string;
    status?: string;
    progress?: number;
    error?: string;
    payload?: SqlAnalysisData;
  };
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

  if (
    "data" in part &&
    part.data &&
    typeof part.data === "object" &&
    "id" in part.data &&
    typeof part.data.id === "string"
  ) {
    return `${messageId}-${part.type}-${part.data.id}`;
  }

  return `${messageId}-${part.type}-${partIndex}`;
}

export function getTrailingAssistantMessageIds(
  messages: UIMessage[],
): string[] {
  const trailingAssistantMessageIds: string[] = [];

  for (
    let messageIndex = messages.length - 1;
    messageIndex >= 0;
    messageIndex -= 1
  ) {
    const message = messages[messageIndex];

    if (message?.role !== "assistant") {
      break;
    }

    trailingAssistantMessageIds.push(message.id);
  }

  return trailingAssistantMessageIds.reverse();
}

export function getCollapsedAssistantMessageIds({
  messages,
  isExpanded,
}: {
  messages: UIMessage[];
  isExpanded: boolean;
}): string[] {
  if (isExpanded) {
    return [];
  }

  const trailingAssistantMessageIds = getTrailingAssistantMessageIds(messages);
  return trailingAssistantMessageIds.slice(0, -1);
}

function isRenderableTextPart(part: UIMessage["parts"][number]): boolean {
  return part.type === "text" && Boolean(part.text?.trim());
}

export function getLatestAssistantPreviewPartIndex({
  parts,
  executeSqlArtifactType,
  isAssistantThinking,
}: {
  parts: UIMessage["parts"] | undefined;
  executeSqlArtifactType: string;
  isAssistantThinking: boolean;
}): number | null {
  if (!parts?.length) {
    return null;
  }

  if (!isAssistantThinking) {
    for (let partIndex = parts.length - 1; partIndex >= 0; partIndex -= 1) {
      const part = parts[partIndex];

      if (isRenderableTextPart(part)) {
        return partIndex;
      }
    }

    return null;
  }

  for (let partIndex = parts.length - 1; partIndex >= 0; partIndex -= 1) {
    const part = parts[partIndex];

    if (part.type === executeSqlArtifactType) {
      continue;
    }

    if (isRenderableTextPart(part) || isToolMessagePart(part)) {
      return partIndex;
    }
  }

  return null;
}

export function getCollapsedAssistantPartIndexes({
  message,
  executeSqlArtifactType,
  isAssistantThinking,
  isExpanded,
}: {
  message: UIMessage;
  executeSqlArtifactType: string;
  isAssistantThinking: boolean;
  isExpanded: boolean;
}): number[] {
  if (message.role !== "assistant" || isExpanded) {
    return [];
  }

  const previewPartIndex = getLatestAssistantPreviewPartIndex({
    parts: message.parts,
    executeSqlArtifactType,
    isAssistantThinking,
  });
  const hiddenPartIndexes: number[] = [];

  message.parts?.forEach((part, partIndex) => {
    if (part.type === executeSqlArtifactType) {
      return;
    }

    if (isRenderableTextPart(part) || isToolMessagePart(part)) {
      if (partIndex !== previewPartIndex) {
        hiddenPartIndexes.push(partIndex);
      }
    }
  });

  return hiddenPartIndexes;
}

function getSqlArtifactsByTopLevelPartIndex(
  parts: UIMessage["parts"] | undefined,
  executeSqlArtifactType: string,
): Map<number, SqlArtifactEntry[]> {
  const sqlArtifactParts = extractSqlArtifactParts(
    parts,
    executeSqlArtifactType,
  );
  const sqlArtifactsByTopLevelPartIndex = new Map<number, SqlArtifactEntry[]>();

  sqlArtifactParts.forEach(({ partIndex, artifactData }) => {
    const topLevelPartIndex = getTopLevelPartIndex(partIndex);
    const existing = sqlArtifactsByTopLevelPartIndex.get(topLevelPartIndex);
    const nextEntry = {
      partIndex,
      data: artifactData,
    };
    if (existing) {
      existing.push(nextEntry);
      return;
    }
    sqlArtifactsByTopLevelPartIndex.set(topLevelPartIndex, [nextEntry]);
  });

  return sqlArtifactsByTopLevelPartIndex;
}

function hasRenderableAssistantContent(
  message: UIMessage,
  executeSqlArtifactType: string,
  showToolCalls: boolean,
  sqlArtifactsByTopLevelPartIndex: Map<number, SqlArtifactEntry[]>,
): boolean {
  if (!message.parts || message.parts.length === 0) {
    return false;
  }

  return message.parts.some((part, partIndex) => {
    if (part.type === "text") {
      const text = (part as { text?: string }).text;
      return Boolean(text?.trim());
    }

    if (part.type === executeSqlArtifactType) {
      return Boolean((part as { data?: unknown }).data);
    }

    if (isToolMessagePart(part)) {
      if (showToolCalls) {
        return true;
      }

      return (
        part.type === "tool-execute_sql" &&
        ((sqlArtifactsByTopLevelPartIndex.get(partIndex)?.length ?? 0) > 0 ||
          Boolean(getToolErrorText(part)))
      );
    }

    return false;
  });
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

export function ChatMessageThread({
  messages,
  status,
  animationFrame,
  verbAiIsThinking,
  executeSqlArtifactType,
  visualizationMap,
  onRemoveMessage,
  conversationClassName,
  contentSpacingClassName,
  messagePaddingClassName,
  userResponsePaddingClassName,
  showToolCalls,
  showExecuteSqlRawOutput,
  footerContent,
}: ChatMessageThreadProps) {
  const isConversationEmpty = messages.length === 0;
  const isAssistantThinking = status === "streaming" || status === "submitted";
  const lastMessage = messages[messages.length - 1];
  const trailingAssistantMessageIds = getTrailingAssistantMessageIds(messages);
  const trailingAssistantMessageIdSet = new Set(trailingAssistantMessageIds);
  const latestAssistantMessageId =
    trailingAssistantMessageIds[trailingAssistantMessageIds.length - 1] ?? null;
  const [expandedAssistantMessages, setExpandedAssistantMessages] = useState<
    Record<string, boolean>
  >({});

  useEffect(() => {
    setExpandedAssistantMessages((previous) => {
      if (!latestAssistantMessageId) {
        return Object.keys(previous).length === 0 ? previous : {};
      }

      const nextExpanded = previous[latestAssistantMessageId] ?? false;
      const previousKeys = Object.keys(previous);

      if (
        previousKeys.length === 1 &&
        previousKeys[0] === latestAssistantMessageId &&
        previous[latestAssistantMessageId] === nextExpanded
      ) {
        return previous;
      }

      return {
        [latestAssistantMessageId]: nextExpanded,
      };
    });
  }, [latestAssistantMessageId]);

  const lastMessageSqlArtifacts = getSqlArtifactsByTopLevelPartIndex(
    lastMessage?.parts,
    executeSqlArtifactType,
  );
  const lastMessageIsExpanded = latestAssistantMessageId
    ? Boolean(expandedAssistantMessages[latestAssistantMessageId])
    : false;
  const collapsedAssistantMessageIdSet = new Set(
    getCollapsedAssistantMessageIds({
      messages,
      isExpanded: lastMessageIsExpanded,
    }),
  );
  const lastMessagePreviewPartIndex =
    lastMessage?.role === "assistant" && !lastMessageIsExpanded
      ? getLatestAssistantPreviewPartIndex({
          parts: lastMessage.parts,
          executeSqlArtifactType,
          isAssistantThinking,
        })
      : null;
  const lastMessageHasRenderableAssistantContent = Boolean(
    lastMessage &&
      lastMessage.role === "assistant" &&
      (hasRenderableAssistantContent(
        lastMessage,
        executeSqlArtifactType,
        showToolCalls,
        lastMessageSqlArtifacts,
      ) ||
        lastMessagePreviewPartIndex !== null),
  );
  const hasInlineThinkingPlaceholder =
    isAssistantThinking &&
    Boolean(
      lastMessage &&
        lastMessage.role === "assistant" &&
        !lastMessageHasRenderableAssistantContent,
    );

  const cells = useMemo(
    () => groupMessagesIntoCells(messages),
    [messages],
  );

  const renderThinkingIndicator = () => (
    <div className="p-3">
      <span className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-opacity duration-200 ease-out">
        <span className="inline-block w-4 text-center">
          {animationFrame || "."}
        </span>
        <span>{verbAiIsThinking}</span>
      </span>
    </div>
  );

  const renderSqlBlock = ({
    artifactData,
    partIndex,
    messageId,
  }: {
    artifactData: {
      id?: string;
      status?: string;
      progress?: number;
      error?: string;
      payload?: SqlAnalysisData;
    };
    partIndex: number;
    messageId: string;
  }) => {
    if (artifactData.status === "error") {
      return (
        <div
          key={`${messageId}-part-${partIndex}-error`}
          className="mt-4 max-w-full text-sm text-red-500"
        >
          {artifactData.error ?? "SQL analysis failed."}
        </div>
      );
    }

    const payload = (artifactData.payload ??
      null) as SqlAnalysisData | null;

    if (!payload?.query) {
      return null;
    }

    const executionTimeMs =
      payload.summary?.executionTimeMs ?? payload.executionTime;
    const rowCount =
      payload.summary?.totalRows ??
      payload.rowCount ??
      payload.rows?.length;
    const queryType = payload.summary?.queryType;
    const visualizationId = getVisualizationIdForArtifact({
      artifactId: artifactData.id,
      messageId,
      partIndex,
    });
    const vizEntry = visualizationMap.get(visualizationId);

    return (
      <div
        key={`${messageId}-part-${partIndex}`}
        className="space-y-2"
      >
        <GeneratedSqlBlock
          query={payload.query}
          executionTimeMs={executionTimeMs}
          rowCount={rowCount}
          queryType={queryType}
          artifactId={artifactData.id}
          dbIdentifier={payload.dbIdentifier}
          payload={payload}
        />
        {vizEntry && (
          <div className="w-full overflow-hidden rounded-lg border border-border bg-background shadow-sm">
            <SqlAnalysisDisplay
              key={vizEntry.id}
              data={vizEntry.data}
              stage={vizEntry.stage}
              progress={vizEntry.progress}
              showStageIndicator={true}
              className="w-full"
              artifactId={vizEntry.artifactId}
              canAddToChat={vizEntry.canAddToChat}
              onConfigChange={vizEntry.onConfigChange}
              onVisualTypeChange={vizEntry.onVisualTypeChange}
            />
          </div>
        )}
      </div>
    );
  };

  const renderAssistantMessage = (message: UIMessage) => {
    const isLatestAssistantMessage =
      message.id === latestAssistantMessageId;
    const isAssistantRunMessage = trailingAssistantMessageIdSet.has(
      message.id,
    );
    const isAssistantMessageExpanded = Boolean(
      isLatestAssistantMessage && expandedAssistantMessages[message.id],
    );
    const isCollapsedAssistantMessage =
      collapsedAssistantMessageIdSet.has(message.id);
    const latestAssistantPreviewPartIndex =
      isLatestAssistantMessage && !isAssistantMessageExpanded
        ? getLatestAssistantPreviewPartIndex({
            parts: message.parts,
            executeSqlArtifactType,
            isAssistantThinking,
          })
        : null;
    const collapsedAssistantPartIndexSet = new Set(
      isLatestAssistantMessage
        ? getCollapsedAssistantPartIndexes({
            message,
            executeSqlArtifactType,
            isAssistantThinking,
            isExpanded: isAssistantMessageExpanded,
          })
        : [],
    );
    const sqlArtifactsByTopLevelPartIndex =
      getSqlArtifactsByTopLevelPartIndex(
        message.parts,
        executeSqlArtifactType,
      );
    const isLastMessageInThread =
      message.id === lastMessage?.id;
    const isEmptyAssistantMessage =
      isLastMessageInThread &&
      isAssistantThinking &&
      !(
        hasRenderableAssistantContent(
          message,
          executeSqlArtifactType,
          showToolCalls,
          sqlArtifactsByTopLevelPartIndex,
        ) || latestAssistantPreviewPartIndex !== null
      );
    const showToolCallsForMessage =
      isAssistantRunMessage && lastMessageIsExpanded
        ? true
        : isLatestAssistantMessage
          ? false
          : showToolCalls;
    const hasRenderableContent =
      hasRenderableAssistantContent(
        message,
        executeSqlArtifactType,
        showToolCallsForMessage,
        sqlArtifactsByTopLevelPartIndex,
      ) || latestAssistantPreviewPartIndex !== null;

    if (isEmptyAssistantMessage) {
      return (
        <div key={message.id}>
          {renderThinkingIndicator()}
        </div>
      );
    }

    if (isCollapsedAssistantMessage) {
      const visibleParts: ReactNode[] = [];

      message.parts?.forEach((part, partIndex) => {
        if (part.type === executeSqlArtifactType) {
          const entriesForPart =
            sqlArtifactsByTopLevelPartIndex.get(partIndex) ?? [];
          visibleParts.push(
            ...entriesForPart.map((entry) =>
              renderSqlBlock({
                artifactData: entry.data,
                partIndex: entry.partIndex,
                messageId: message.id,
              }),
            ),
          );
          return;
        }

        if (!isToolMessagePart(part)) {
          return;
        }

        const toolErrorText = getToolErrorText(part);
        if (toolErrorText) {
          visibleParts.push(
            <div
              key={`${getMessagePartKey({
                messageId: message.id,
                part,
                partIndex,
              })}-error`}
              className="mt-4 max-w-full text-sm text-destructive"
            >
              {toolErrorText}
            </div>,
          );
        }

        if (part.type === "tool-execute_sql") {
          const entriesForPart =
            sqlArtifactsByTopLevelPartIndex.get(partIndex) ?? [];
          visibleParts.push(
            ...entriesForPart.map((entry) =>
              renderSqlBlock({
                artifactData: entry.data,
                partIndex: entry.partIndex,
                messageId: message.id,
              }),
            ),
          );
        }
      });

      if (visibleParts.length === 0) {
        return null;
      }

      return (
        <div key={message.id} className={cn("relative", messagePaddingClassName)}>
          {visibleParts}
        </div>
      );
    }

    if (!hasRenderableContent) {
      return null;
    }

    return (
      <div key={message.id} className={cn("relative", messagePaddingClassName)}>
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
        {message.parts?.map((part, partIndex) => {
          if (part.type === "text") {
            if (collapsedAssistantPartIndexSet.has(partIndex)) {
              return null;
            }

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

          if (part.type === executeSqlArtifactType) {
            const entriesForPart =
              sqlArtifactsByTopLevelPartIndex.get(partIndex) ?? [];

            if (entriesForPart.length === 0) {
              return null;
            }

            return entriesForPart.map((entry) =>
              renderSqlBlock({
                artifactData: entry.data,
                partIndex: entry.partIndex,
                messageId: message.id,
              }),
            );
          }

          if (isToolMessagePart(part)) {
            const toolState = deriveToolState(part);
            const toolOutput = getToolOutput(part);
            const toolErrorText = getToolErrorText(part);
            const isLatestPreviewPart =
              latestAssistantPreviewPartIndex === partIndex;
            const showToolOutput =
              part.type !== "tool-execute_sql" ||
              showExecuteSqlRawOutput ||
              Boolean(toolErrorText);

            let executeSqlBlocks: ReactNode = null;
            if (part.type === "tool-execute_sql") {
              const entriesForPart =
                sqlArtifactsByTopLevelPartIndex.get(partIndex) ?? [];
              executeSqlBlocks = entriesForPart.map((entry) =>
                renderSqlBlock({
                  artifactData: entry.data,
                  partIndex: entry.partIndex,
                  messageId: message.id,
                }),
              );
            }

            const shouldRenderToolDetail =
              showToolCallsForMessage || isLatestPreviewPart;

            if (!shouldRenderToolDetail) {
              if (toolErrorText) {
                return null;
              }

              return executeSqlBlocks;
            }

            return (
              <div
                key={getMessagePartKey({
                  messageId: message.id,
                  part,
                  partIndex,
                })}
                className="w-full"
              >
                <Tool
                  defaultOpen={
                    isLatestPreviewPart || Boolean(toolErrorText)
                  }
                >
                  <ToolHeader state={toolState} type={part.type} />
                  <ToolContent>
                    {typeof part.input !== "undefined" ? (
                      <ToolInput input={part.input} />
                    ) : null}
                    {showToolOutput ? (
                      <ToolOutput
                        errorText={toolErrorText}
                        output={toolOutput}
                      />
                    ) : null}
                  </ToolContent>
                </Tool>
                {executeSqlBlocks}
              </div>
            );
          }

          return null;
        })}
        {isLatestAssistantMessage &&
        (collapsedAssistantMessageIdSet.size > 0 ||
          collapsedAssistantPartIndexSet.size > 0) &&
        !isAssistantThinking ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2 w-fit"
            onClick={(event) => {
              event.stopPropagation();
              setExpandedAssistantMessages((previous) => ({
                ...previous,
                [message.id]: !previous[message.id],
              }));
            }}
          >
            {isAssistantMessageExpanded
              ? "Hide assistant output"
              : "Show assistant output"}
          </Button>
        ) : null}
      </div>
    );
  };

  return (
    <Conversation className={conversationClassName}>
      <ConversationContent
        className={cn("max-w-full mx-auto w-full", contentSpacingClassName)}
      >
        {isConversationEmpty && (
          <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground shadow-sm">
            Ready
          </div>
        )}
        {cells.map((cell) => (
          <div
            key={cell.id}
            className="group rounded-lg border border-border bg-card shadow-sm overflow-hidden"
          >
            {cell.userMessage && (
              <div className="relative border-b border-border bg-muted/30 px-4 py-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute top-2 right-2 h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100 z-30"
                  onClick={(event) => {
                    event.stopPropagation();
                    void onRemoveMessage(cell.userMessage!.id);
                  }}
                  aria-label="Remove message"
                >
                  <TrashIcon className="h-4 w-4" />
                </Button>
                {cell.userMessage.parts?.map((part, partIndex) => {
                  if (part.type === "text") {
                    return (
                      <Response
                        key={getMessagePartKey({
                          messageId: cell.userMessage!.id,
                          part,
                          partIndex,
                        })}
                      >
                        {part.text}
                      </Response>
                    );
                  }
                  return null;
                })}
              </div>
            )}
            {cell.assistantMessages.length > 0 && (
              <div className="flex flex-col gap-2">
                {cell.assistantMessages.map((assistantMessage) =>
                  renderAssistantMessage(assistantMessage),
                )}
              </div>
            )}
          </div>
        ))}

        {isAssistantThinking &&
          !hasInlineThinkingPlaceholder && (
            <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
              {renderThinkingIndicator()}
            </div>
          )}

        {footerContent}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
}
