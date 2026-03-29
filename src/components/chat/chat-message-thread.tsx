import type { UIMessage } from "@ai-sdk/react";
import { TrashIcon } from "@heroicons/react/24/outline";
import type { ReactNode } from "react";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
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
import {
  extractSqlArtifactParts,
  getTopLevelPartIndex,
  getVisualizationIdForArtifact,
} from "@/components/chat/sql-artifact-utils";
import type { SqlAnalysisData } from "@/components/sql-analysis-display.types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ChatMessageThreadProps = {
  messages: UIMessage[];
  status: string;
  animationFrame: string;
  verbAiIsThinking: string;
  executeSqlArtifactType: string;
  activeVisualizationId: string | null;
  getLastSelectableVisualizationIdForMessage: (
    message: UIMessage,
  ) => string | null;
  onSelectVisualization: (visualizationId: string) => void;
  onRemoveMessage: (messageId: string) => Promise<void>;
  conversationClassName: string;
  contentSpacingClassName: string;
  messagePaddingClassName: string;
  userResponsePaddingClassName: string;
  showToolCalls: boolean;
  showExecuteSqlRawOutput: boolean;
};

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
  activeVisualizationId,
  getLastSelectableVisualizationIdForMessage,
  onSelectVisualization,
  onRemoveMessage,
  conversationClassName,
  contentSpacingClassName,
  messagePaddingClassName,
  userResponsePaddingClassName,
  showToolCalls,
  showExecuteSqlRawOutput,
}: ChatMessageThreadProps) {
  const isConversationEmpty = messages.length === 0;
  const isAssistantThinking = status === "streaming" || status === "submitted";
  const lastMessage = messages[messages.length - 1];
  const lastMessageSqlArtifacts = getSqlArtifactsByTopLevelPartIndex(
    lastMessage?.parts,
    executeSqlArtifactType,
  );
  const hasInlineThinkingPlaceholder =
    isAssistantThinking &&
    Boolean(
      lastMessage &&
        lastMessage.role === "assistant" &&
        !hasRenderableAssistantContent(
          lastMessage,
          executeSqlArtifactType,
          showToolCalls,
          lastMessageSqlArtifacts,
        ),
    );

  const renderThinkingMessage = (key: string) => (
    <Message from="assistant" key={key}>
      <MessageContent className="relative w-full rounded-lg border border-border bg-sidebar p-4 shadow-sm">
        <span className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-opacity duration-200 ease-out">
          <span className="inline-block w-4 text-center">
            {animationFrame || "."}
          </span>
          <span>{verbAiIsThinking}</span>
        </span>
      </MessageContent>
    </Message>
  );

  return (
    <Conversation className={conversationClassName}>
      <ConversationContent
        className={cn("max-w-full mx-auto w-full", contentSpacingClassName)}
      >
        {isConversationEmpty && (
          <Message from="assistant" key="assistant-ready">
            <MessageContent>
              <Response key="assistant-ready-response">Ready</Response>
            </MessageContent>
          </Message>
        )}
        {messages.map((message, messageIndex) => {
          const isLastMessage = messageIndex === messages.length - 1;
          const isEmptyAssistantMessage =
            isLastMessage &&
            message.role === "assistant" &&
            isAssistantThinking &&
            !hasRenderableAssistantContent(
              message,
              executeSqlArtifactType,
              showToolCalls,
              getSqlArtifactsByTopLevelPartIndex(
                message.parts,
                executeSqlArtifactType,
              ),
            );
          const messageVisualizationId =
            getLastSelectableVisualizationIdForMessage(message);
          const isSelectableMessage =
            message.role === "assistant" && Boolean(messageVisualizationId);
          const isSelectedMessage =
            isSelectableMessage &&
            activeVisualizationId === messageVisualizationId;

          const handleMessageSelection = () => {
            if (messageVisualizationId) {
              onSelectVisualization(messageVisualizationId);
            }
          };

          const sqlArtifactsByTopLevelPartIndex =
            getSqlArtifactsByTopLevelPartIndex(
              message.parts,
              executeSqlArtifactType,
            );
          const hasRenderableMessageContent =
            message.role !== "assistant" ||
            hasRenderableAssistantContent(
              message,
              executeSqlArtifactType,
              showToolCalls,
              sqlArtifactsByTopLevelPartIndex,
            );

          const renderSqlBlock = ({
            artifactData,
            partIndex,
          }: {
            artifactData: {
              id?: string;
              status?: string;
              progress?: number;
              error?: string;
              payload?: SqlAnalysisData;
            };
            partIndex: number;
          }) => {
            if (artifactData.status === "error") {
              return (
                <div
                  key={`${message.id}-part-${partIndex}-error`}
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
              messageId: message.id,
              partIndex,
            });

            return (
              <GeneratedSqlBlock
                key={`${message.id}-part-${partIndex}`}
                query={payload.query}
                executionTimeMs={executionTimeMs}
                rowCount={rowCount}
                queryType={queryType}
                visualizationId={visualizationId}
                artifactId={artifactData.id}
                dbIdentifier={payload.dbIdentifier}
                payload={payload}
                onSelectVisualization={onSelectVisualization}
                isSelected={activeVisualizationId === visualizationId}
              />
            );
          };

          if (isEmptyAssistantMessage) {
            return renderThinkingMessage(message.id);
          }

          if (!hasRenderableMessageContent) {
            return null;
          }

          return (
            <Message from={message.role} key={message.id}>
              <MessageContent
                className={cn(
                  "relative w-full group-[.is-user]:bg-card group-[.is-assistant]:bg-sidebar group-[.is-assistant]:border border-border rounded-lg group-[.is-assistant]:shadow-sm",
                  messagePaddingClassName,
                  isSelectableMessage && "cursor-pointer",
                  isSelectedMessage &&
                    "group-[.is-assistant]:border-primary/60 group-[.is-assistant]:bg-accent/10",
                )}
                onClick={
                  isSelectableMessage ? handleMessageSelection : undefined
                }
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
                {message.parts?.map((part, partIndex) => {
                  if (part.type === "text") {
                    return (
                      <Response
                        key={`${message.id}-part-${partIndex}`}
                        className={cn(
                          "rounded-lg group-[.is-user]:bg-primary/60 group-[.is-user]:shadow-md",
                          userResponsePaddingClassName,
                        )}
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
                      }),
                    );
                  }

                  if (isToolMessagePart(part)) {
                    const toolState = deriveToolState(part);
                    const toolOutput = getToolOutput(part);
                    const toolErrorText = getToolErrorText(part);
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
                        }),
                      );
                    }

                    if (!showToolCalls) {
                      if (toolErrorText) {
                        return (
                          <div
                            key={`${message.id}-part-${partIndex}-error`}
                            className="mt-4 max-w-full text-sm text-destructive"
                          >
                            {toolErrorText}
                          </div>
                        );
                      }

                      return executeSqlBlocks;
                    }

                    return (
                      <div
                        key={`${message.id}-part-${partIndex}`}
                        className="w-full"
                      >
                        <Tool defaultOpen={false}>
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
              </MessageContent>
            </Message>
          );
        })}

        {isAssistantThinking &&
          !hasInlineThinkingPlaceholder &&
          renderThinkingMessage("assistant-streaming")}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
}
