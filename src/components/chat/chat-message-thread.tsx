import type { UIMessage } from "@ai-sdk/react";
import { TrashIcon } from "@heroicons/react/24/outline";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import { Response } from "@/components/ai-elements/response";
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
};

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
}: ChatMessageThreadProps) {
  const isConversationEmpty = messages.length === 0;

  return (
    <Conversation className={conversationClassName}>
      <ConversationContent
        className={cn("max-w-full mx-auto w-full", contentSpacingClassName)}
      >
        {isConversationEmpty && (
          <Message from="assistant" key="assistant-ready">
            <MessageContent>
              <Response key="assistant-ready-response">
                Ready to help...
              </Response>
            </MessageContent>
          </Message>
        )}
        {messages.map((message, messageIndex) => {
          const isLastMessage = messageIndex === messages.length - 1;
          const isEmptyAssistantMessage =
            isLastMessage &&
            message.role === "assistant" &&
            (status === "streaming" || status === "submitted") &&
            (!message.parts ||
              message.parts.length === 0 ||
              message.parts.every(
                (part) =>
                  (part.type === "text" &&
                    (!(part as { text?: string }).text ||
                      (part as { text?: string }).text?.trim() === "")) ||
                  (part.type === executeSqlArtifactType &&
                    !(part as { data?: unknown }).data),
              ));
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

          const sqlArtifactParts = extractSqlArtifactParts(
            message.parts,
            executeSqlArtifactType,
          );
          const sqlArtifactsByTopLevelPartIndex = new Map<
            number,
            Array<{
              partIndex: number;
              data: {
                id?: string;
                status?: string;
                progress?: number;
                error?: string;
                payload?: SqlAnalysisData;
              };
            }>
          >();

          sqlArtifactParts.forEach(({ partIndex, artifactData }) => {
            const topLevelPartIndex = getTopLevelPartIndex(partIndex);
            const existing =
              sqlArtifactsByTopLevelPartIndex.get(topLevelPartIndex);
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
                onSelectVisualization={onSelectVisualization}
                isSelected={activeVisualizationId === visualizationId}
              />
            );
          };

          if (isEmptyAssistantMessage) {
            return (
              <Message from="assistant" key={message.id}>
                <MessageContent className="relative w-full group-[.is-assistant]:bg-sidebar group-[.is-assistant]:border border-border rounded-lg group-[.is-assistant]:shadow-sm p-4">
                  <span>
                    {animationFrame} {verbAiIsThinking}
                  </span>
                </MessageContent>
              </Message>
            );
          }

          return (
            <Message from={message.role} key={message.id}>
              <MessageContent
                className={cn(
                  "relative w-full group-[.is-user]:bg-card group-[.is-assistant]:bg-sidebar group-[.is-assistant]:border border-border rounded-lg group-[.is-assistant]:shadow-sm",
                  messagePaddingClassName,
                  isSelectableMessage && "cursor-pointer",
                  isSelectedMessage &&
                    "group-[.is-assistant]:border-primary/60 group-[.is-assistant]:bg-accent/20",
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
                  if (status === "submitted") {
                    return (
                      <span key={`${message.id}-part-${partIndex}-submitted`}>
                        {animationFrame}
                      </span>
                    );
                  }
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

                  if (part.type === "tool-getTableSchema") {
                    return (
                      <span key={`${message.id}-part-${partIndex}`}>
                        Getting table schema
                      </span>
                    );
                  }

                  if (part.type === "tool-generateChartConfig") {
                    return (
                      <span key={`${message.id}-part-${partIndex}`}>
                        Generating chart config...
                        {animationFrame}
                      </span>
                    );
                  }

                  if (part.type === "tool-executeSql") {
                    const entriesForPart =
                      sqlArtifactsByTopLevelPartIndex.get(partIndex) ?? [];
                    if (entriesForPart.length > 0) {
                      return entriesForPart.map((entry) =>
                        renderSqlBlock({
                          artifactData: entry.data,
                          partIndex: entry.partIndex,
                        }),
                      );
                    }

                    const executeSqlPart = part as { state?: string };
                    if (
                      executeSqlPart.state === "output-available" ||
                      executeSqlPart.state === "output-error"
                    ) {
                      return null;
                    }

                    return (
                      <span key={`${message.id}-part-${partIndex}`}>
                        Processing...
                      </span>
                    );
                  }

                  return null;
                })}
              </MessageContent>
            </Message>
          );
        })}

        {status === "streaming" &&
          !(
            messages.length > 0 &&
            messages[messages.length - 1]?.role === "assistant" &&
            (!messages[messages.length - 1]?.parts ||
              messages[messages.length - 1]?.parts.length === 0 ||
              messages[messages.length - 1]?.parts.every(
                (part) =>
                  (part.type === "text" &&
                    (!(part as { text?: string }).text ||
                      (part as { text?: string }).text?.trim() === "")) ||
                  (part.type === executeSqlArtifactType &&
                    !(part as { data?: unknown }).data),
              ))
          ) && (
            <Message from="assistant" key="assistant-streaming">
              <MessageContent className="relative w-full group-[.is-assistant]:bg-sidebar group-[.is-assistant]:border border-border rounded-lg group-[.is-assistant]:shadow-sm p-4">
                <span>
                  {animationFrame} {verbAiIsThinking}
                </span>
              </MessageContent>
            </Message>
          )}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
}
