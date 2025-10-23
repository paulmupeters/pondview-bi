"use client";

import { useChat } from "@ai-sdk-tools/store";
import type { UIMessage } from "ai";
import { DefaultChatTransport } from "ai";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { SqlAnalysisPanel } from "@/components/sql-analysis-panel";
import {
  getRandomVerbAiIsThinking,
  showRandomAnimation,
} from "@/lib/animations";

export default function Chat({
  chatId,
  initialMessages = [],
}: {
  chatId: string;
  initialMessages?: UIMessage[];
}) {
  const transport = useMemo(
    () => new DefaultChatTransport({ api: `/${"api/chat"}/${chatId}` }),
    [chatId],
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

  const [rightPanelWidth, setRightPanelWidth] = useState(67); // percentage - 2/3 of screen
  const [isResizing, setIsResizing] = useState(false);
  const [verbAiIsThinking, setVerbAiIsThinking] = useState("is thinking");

  const handleMouseDown = useCallback(() => {
    setIsResizing(true);
  }, []);

  const handleMouseMove = useCallback(
    (e: Event) => {
      if (!isResizing) return;
      const mouseEvent = e as MouseEvent;
      const container = document.querySelector(".chat-container");
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const newWidth = ((rect.right - mouseEvent.clientX) / rect.width) * 100;
      const clampedWidth = Math.max(20, Math.min(80, newWidth));
      setRightPanelWidth(clampedWidth);
    },
    [isResizing],
  );

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  const handleSubmit = (message: PromptInputMessage) => {
    const hasText = Boolean(message.text);

    if (!hasText) {
      return;
    }
    sendMessage({
      text: message.text ?? "",
    });
  };

  useEffect(() => {
    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isResizing, handleMouseMove, handleMouseUp]);

  // Auto-send initial message from ?q= when opening a fresh chat URL
  useEffect(() => {
    const q = searchParams?.get("q") || "";
    if (q.trim().length > 0 && !autoSentFromQuery) {
      if (typeof window === "undefined") return;
      const flagKey = `autoSent:${chatId}`;
      if (window.localStorage.getItem(flagKey)) {
        setAutoSentFromQuery(true);
        return;
      }
      if (q.trim().length > 0) {
        // Drop the query param to avoid duplicate sends on remounts
        router.replace(`/${chatId}`);
        window.localStorage.setItem(flagKey, "1");
        setAutoSentFromQuery(true);
        sendMessage({ text: q });
      }
    }
  }, [chatId, searchParams, autoSentFromQuery, router, sendMessage]);

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

  // Derive whether we have any SQL artifact from chat messages (more stable than artifacts store)
  const hasSqlData = useMemo(() => {
    return messages.some((m) =>
      Array.isArray(m.parts)
        ? m.parts.some(
          // parts emitted by executeSqlTool
          (p: any) => p?.type === `data-artifact-${ExecuteSqlArtifact.id}`,
        )
        : false,
    );
  }, [messages]);

  // Determine the latest execute-sql artifact id from messages to force remount on new analyses
  const latestArtifactId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const parts = (messages[i]?.parts as any[]) || [];
      for (let j = parts.length - 1; j >= 0; j--) {
        const p: any = parts[j];
        if (p?.type === `data-artifact-${ExecuteSqlArtifact.id}`) {
          return p?.data?.id ?? p?.id ?? null;
        }
      }
    }
    return null;
  }, [messages]);

  return (
    <>
      <div
        className={`chat-container h-screen flex ${hasSqlData ? "flex-row" : "flex-col items-center justify-center"
        }`}
      >
        {/* Left Panel - Chat */}
        <div
          className={`${hasSqlData ? "" : "w-full"} flex flex-col h-full`}
          style={hasSqlData ? { width: `${100 - rightPanelWidth}%` } : {}}
        >
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-8 space-y-6 flex flex-col items-start mx-auto bg-background">
            <Conversation>
              <ConversationContent>
                {messages.length === 0 && !hasSqlData && (
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
                    <MessageContent>
                      {message.parts.map((part, partIndex) => {
                        if (part.type === "text") {
                          return (
                            <Response key={`${message.id}-part-${partIndex}`}>
                              {part.text}
                            </Response>
                          );
                        } else if (part.type === "tool-getTableSchema")
                          return (
                            <span key={`${message.id}-part-${partIndex}`}>
                              Getting table schema
                            </span>
                          );
                        else if (part.type === "tool-generateChartConfig")
                          return (
                            <span key={`${message.id}-part-${partIndex}`}>
                              Generating chart config...{animationFrame}
                            </span>
                          );
                        else if (part.type === "tool-executeSql")
                          return (
                            <span key={`${message.id}-part-${partIndex}`}>
                              Processing...
                            </span>
                          );
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
          {/* Input Form */}
          <div className="p-4 border-t border-border mx-12 mb-8">
            <PromptInputWrapper
              onSubmit={handleSubmit}
              className="mt-4"
              status={status}
            />
          </div>
        </div>

        {/* Right Panel - Analysis */}
        {hasSqlData && (
          // biome-ignore lint/a11y/noStaticElementInteractions: needed for resizing
          <div
            className="w-2 cursor-col-resize hover:bg-primary/50 active:bg-primary transition-colors"
            onMouseDown={handleMouseDown}
          />
        )}
        {hasSqlData && (
          <div
            className="border-l border-border flex flex-col h-full"
            style={{ width: `${rightPanelWidth}%` }}
          >
            {/* Analysis Header */}
            <div className="flex items-center justify-between p-0 mx-2">
              <h2 className="text-md font-semibold text-foreground ml-1">
                Analysis
              </h2>
            </div>

            {/* Analysis Content */}
            <div className="flex-1 overflow-y-auto">
              {hasSqlData ? (
                <SqlAnalysisPanel
                  key={latestArtifactId ?? "none"}
                  storeId={chatId}
                />
                // <div>SqlAnalysisPanel</div>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <p className="text-gray-500">No analysis data available</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      {/* <AIDevtools /> */}
    </>
  );
}
