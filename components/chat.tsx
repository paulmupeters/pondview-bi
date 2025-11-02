"use client";

import { useChat } from "@ai-sdk-tools/store";
import type { UIMessage } from "ai";
import { DefaultChatTransport } from "ai";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ExecuteSqlArtifact } from "@/ai/artifacts/execute-sql";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import { Response } from "@/components/ai-elements/response";
import { PromptInputWrapper } from "@/components/prompt-input-wrapper";
import {
  type SqlAnalysisData,
  SqlAnalysisDisplay,
  type SqlAnalysisStage,
} from "@/components/sql-analysis-display";
import type { ArtifactStatus } from "@/hooks/types";
import { useConnectedTables } from "@/hooks/use-connected-tables";
import {
  getRandomVerbAiIsThinking,
  showRandomAnimation,
} from "@/lib/animations";

const AUTO_SENT_FLAG_PREFIX = "autoSent:";
const AUTO_SENT_STALE_MS = 5 * 60 * 1000;
const AUTO_SENT_CLEANUP_DELAY_MS = 3_000;

export default function Chat({
  chatId,
  initialMessages = [],
}: {
  chatId: string;
  initialMessages?: UIMessage[];
}) {
  const connectedTables = useConnectedTables();

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `/${"api/chat"}/${chatId}`,
        fetch: (() => {
          const customFetch = (async (
            url: RequestInfo | URL,
            options?: RequestInit,
          ) => {
            // Add connected tables to the request body
            if (options?.body) {
              const body = JSON.parse(options.body as string);
              return fetch(url, {
                ...options,
                body: JSON.stringify({
                  ...body,
                  connectedTables,
                }),
              });
            }
            return fetch(url, options);
          }) as typeof fetch;
          // Preserve Next.js augmented fetch.preconnect to satisfy typeof fetch
          (customFetch as any).preconnect =
            (fetch as any).preconnect?.bind(fetch) ?? (() => { });
          return customFetch;
        })(),
      }),
    [chatId, connectedTables],
  );
  const router = useRouter();
  const searchParams = useSearchParams();
  const { messages, sendMessage, status } = useChat({
    id: chatId,
    storeId: chatId,
    messages: initialMessages.length > 0 ? initialMessages : undefined,
    transport,
  });
  const [autoSentFromQuery, setAutoSentFromQuery] = useState(false);
  const [animationFrame, setAnimationFrame] = useState("");
  const [verbAiIsThinking, setVerbAiIsThinking] = useState("is thinking");
  const executeSqlArtifactType = `data-artifact-${ExecuteSqlArtifact.id}`;

  const handleSubmit = (message: PromptInputMessage) => {
    const hasText = Boolean(message.text);

    if (!hasText) {
      return;
    }
    sendMessage({
      text: message.text ?? "",
    });
  };

  // Cleanup any stale auto-send markers that may be leftover from previous sessions
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const now = Date.now();
    const keysToRemove: string[] = [];

    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key?.startsWith(AUTO_SENT_FLAG_PREFIX)) {
        continue;
      }

      const rawValue = window.localStorage.getItem(key);
      if (!rawValue) {
        keysToRemove.push(key);
        continue;
      }

      try {
        const parsed = JSON.parse(rawValue) as { timestamp?: number };
        if (
          typeof parsed.timestamp !== "number" ||
          now - parsed.timestamp > AUTO_SENT_STALE_MS
        ) {
          keysToRemove.push(key);
        }
      } catch {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => {
      window.localStorage.removeItem(key);
    });
  }, []);

  // Auto-send initial message from ?q= when opening a fresh chat URL
  useEffect(() => {
    const q = searchParams?.get("q") || "";
    if (q.trim().length > 0 && !autoSentFromQuery) {
      if (typeof window === "undefined") return;
      const sanitizedQuery = q.trim();
      const flagKey = `${AUTO_SENT_FLAG_PREFIX}${chatId}`;
      const rawFlagValue = window.localStorage.getItem(flagKey);

      if (rawFlagValue) {
        const now = Date.now();
        let shouldSkipAutoSend = false;

        try {
          const parsed = JSON.parse(rawFlagValue) as { timestamp?: number };
          if (
            typeof parsed.timestamp === "number" &&
            now - parsed.timestamp <= AUTO_SENT_STALE_MS
          ) {
            shouldSkipAutoSend = true;
          } else {
            window.localStorage.removeItem(flagKey);
          }
        } catch {
          window.localStorage.removeItem(flagKey);
        }

        if (shouldSkipAutoSend) {
          setAutoSentFromQuery(true);
          return;
        }
      }

      // Drop the query param to avoid duplicate sends on remounts
      router.replace(`/${chatId}`);
      window.localStorage.setItem(
        flagKey,
        JSON.stringify({ timestamp: Date.now() }),
      );
      setAutoSentFromQuery(true);
      sendMessage({ text: sanitizedQuery });
    }
  }, [chatId, searchParams, autoSentFromQuery, router, sendMessage]);

  // Remove the auto-send marker after it served its purpose to avoid storage build-up
  useEffect(() => {
    if (!autoSentFromQuery || typeof window === "undefined") {
      return;
    }

    const flagKey = `${AUTO_SENT_FLAG_PREFIX}${chatId}`;
    const timeoutId = window.setTimeout(() => {
      try {
        window.localStorage.removeItem(flagKey);
      } catch {
        // no-op
      }
    }, AUTO_SENT_CLEANUP_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [autoSentFromQuery, chatId]);

  // Animation effect for streaming status
  useEffect(() => {
    if (status === "streaming" || status === "submitted") {
      const animation = showRandomAnimation(
        undefined,
        Number.POSITIVE_INFINITY, // Run indefinitely
        (frame) => setAnimationFrame(frame),
      );
      return () => animation.stop();
    }
    setAnimationFrame("");
  }, [status]);

  useEffect(() => {
    setVerbAiIsThinking(getRandomVerbAiIsThinking());
  }, []);

  const isConversationEmpty = messages.length === 0;


  return (
    <>
      <div
        className={`chat-container flex h-screen ${isConversationEmpty
          ? "flex-col items-center justify-center"
          : "flex-col"
        }`}
      >
        <div className="flex h-full w-full flex-col">
          <div className="flex-1 overflow-y-auto bg-background">
            <div className="mx-auto flex h-full w-full flex-col space-y-6">
              <Conversation>
                <ConversationContent className="max-w-6xl mx-auto w-full">
                  {isConversationEmpty && (
                    <Message from="assistant" key="assistant-ready">
                      <MessageContent>
                        <Response key="assistant-ready-response">
                          Ready to help...
                        </Response>
                      </MessageContent>
                    </Message>
                  )}

                  {messages.map((message) => (
                    <Message from={message.role} key={message.id}>
                      <MessageContent className="w-full">
                        {message.parts?.map((part, partIndex) => {
                          if (part.type === "text") {
                            return (
                              <Response key={`${message.id}-part-${partIndex}`}>
                                {part.text}
                              </Response>
                            );
                          }

                          if (part.type === executeSqlArtifactType) {
                            const artifactPart = part as {
                              data?: {
                                status?: ArtifactStatus;
                                progress?: number;
                                error?: string;
                                payload?: SqlAnalysisData;
                              };
                            };
                            const artifactData = artifactPart.data;

                            if (!artifactData) {
                              return null;
                            }

                            if (artifactData.status === "error") {
                              return (
                                <div
                                  key={`${message.id}-part-${partIndex}`}
                                  className="mt-4 max-w-3xl text-sm text-red-500"
                                >
                                  {artifactData.error ?? "SQL analysis failed."}
                                </div>
                              );
                            }

                            const payload = (artifactData.payload ??
                              null) as SqlAnalysisData | null;
                            const artifactStatus = artifactData.status;
                            const derivedStage = (payload?.stage ??
                              (artifactStatus === "complete"
                                ? "complete"
                                : "loading")) as SqlAnalysisStage;
                            const progressValue =
                              typeof artifactData.progress === "number"
                                ? artifactData.progress
                                : (payload?.progress ?? 0);

                            const shouldShowStageIndicator =
                              artifactStatus !== "complete" &&
                              derivedStage !== "complete";

                            return (
                              <div
                                key={`${message.id}-part-${partIndex}`}
                                className="mt-4 w-full"
                              >
                                <SqlAnalysisDisplay
                                  data={payload}
                                  stage={derivedStage}
                                  progress={progressValue}
                                  showStageIndicator={shouldShowStageIndicator}
                                  className="max-w-3xl w-full"
                                />
                              </div>
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
                                Generating chart config...{animationFrame}
                              </span>
                            );
                          }

                          if (part.type === "tool-executeSql") {
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
                  ))}
                  {status === "submitted" && (
                    <span key="assistant-submitted-div">{animationFrame}</span>
                  )}
                  {status === "streaming" && (
                    <span key="assistant-streaming-div">
                      {animationFrame} {verbAiIsThinking}
                    </span>
                  )}
                </ConversationContent>
                <ConversationScrollButton />
              </Conversation>
            </div>
          </div>
          <div className="p-1 max-w-6xl w-full mx-auto">
            <PromptInputWrapper
              onSubmit={handleSubmit}
              className=""
              status={status}
            />
          </div>
        </div>
      </div>
      {/* <AIDevtools /> */}
    </>
  );
}
