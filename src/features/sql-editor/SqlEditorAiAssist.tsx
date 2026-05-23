import { useChat } from "@ai-sdk/react";
import { type ChatTransport, DirectChatTransport, type UIMessage } from "ai";
import {
  BarChart3,
  BookOpen,
  Check,
  Code2,
  Loader2,
  MessageCircleQuestion,
  MessageSquarePlus,
  PencilLine,
  SendHorizonal,
  Sparkles,
  Wand2,
  Wrench,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { canUseBridgeAi, createBridgeChatTransport } from "@/ai/bridge-chat";
import { createSqlEditorAssistAgent } from "@/ai/client/agent";
import { createDelegatingChatTransport } from "@/ai/delegating-chat-transport";
import { Response } from "@/components/ai-elements/response";
import { toPromptErrorMessage } from "@/components/chat/hooks/chat-session-utils";
import { PromptErrorBanner } from "@/components/chat/prompt-error-banner";
import type { QueryNotice } from "@/components/sql-console";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useConnectedTables } from "@/hooks/use-connected-tables";
import {
  useBridgeRuntimeState,
  useSelectedSqlBackend,
} from "@/lib/sql/use-sql-backend";
import { cn } from "@/lib/utils";
import {
  buildSqlEditorAssistPrompt,
  buildSqlEditorResultContext,
  extractSqlSuggestion,
  getTextFromUiMessage,
  type SqlEditorAiAction,
  type SqlEditorResultPayload,
} from "./sql-editor-ai-assist";

type PendingSuggestion = {
  sql: string;
  assistantText: string;
};

type BridgeAiAvailability = "checking" | "available" | "unavailable";

export type SqlEditorAiAssistProps = {
  currentSql: string;
  selectedDb?: string;
  selectedCatalogContext?: string | null;
  queryNotice?: QueryNotice | null;
  result: SqlEditorResultPayload | null;
  onAcceptSql: (sql: string) => void;
};

const QUICK_ACTIONS: {
  action: SqlEditorAiAction;
  label: string;
  icon: React.ReactNode;
  revealInput?: boolean;
  needsPrompt?: boolean;
  needsSql?: boolean;
  needsResult?: boolean;
}[] = [
  {
    action: "custom",
    label: "Ask",
    icon: <MessageCircleQuestion className="h-3.5 w-3.5" />,
    revealInput: true,
  },
  {
    action: "write",
    label: "Write SQL",
    icon: <PencilLine className="h-3.5 w-3.5" />,
    revealInput: true,
    needsPrompt: true,
  },
  {
    action: "refine",
    label: "Refine",
    icon: <Wand2 className="h-3.5 w-3.5" />,
    needsSql: true,
  },
  {
    action: "fix",
    label: "Fix",
    icon: <Wrench className="h-3.5 w-3.5" />,
    needsSql: true,
  },
  {
    action: "explain",
    label: "Explain",
    icon: <BookOpen className="h-3.5 w-3.5" />,
    needsSql: true,
  },
  {
    action: "summarize",
    label: "Summarize",
    icon: <BarChart3 className="h-3.5 w-3.5" />,
    needsResult: true,
  },
];

export function SqlEditorAiAssist({
  currentSql,
  selectedDb,
  selectedCatalogContext,
  queryNotice,
  result,
  onAcceptSql,
}: SqlEditorAiAssistProps) {
  const connectedTables = useConnectedTables();
  const [promptDraft, setPromptDraft] = useState("");
  const [promptError, setPromptError] = useState<string | null>(null);
  const [assistantText, setAssistantText] = useState<string | null>(null);
  const [bridgeAiAvailability, setBridgeAiAvailability] =
    useState<BridgeAiAvailability>("checking");
  const [pendingSuggestion, setPendingSuggestion] =
    useState<PendingSuggestion | null>(null);
  const [showInput, setShowInput] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const bridgeRuntimeState = useBridgeRuntimeState();
  const selectedSqlBackend = useSelectedSqlBackend();
  const shouldUseBridgeRuntime =
    selectedSqlBackend === "bridge" || bridgeRuntimeState.isQueryReady;
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const agentResult = useMemo(() => {
    try {
      return {
        agent: createSqlEditorAssistAgent(connectedTables),
        error: null,
      };
    } catch (error) {
      return {
        agent: null,
        error:
          error instanceof Error
            ? error
            : new Error("Failed to initialize the AI assistant."),
      };
    }
  }, [connectedTables]);

  const selectedTransport = useMemo<ChatTransport<UIMessage> | null>(() => {
    if (shouldUseBridgeRuntime) {
      if (bridgeAiAvailability !== "available") {
        return null;
      }
      return createBridgeChatTransport(connectedTables, "sql-editor");
    }

    if (!agentResult.agent) {
      return null;
    }

    return new DirectChatTransport({
      agent: agentResult.agent,
      sendReasoning: false,
      sendSources: false,
    }) as unknown as ChatTransport<UIMessage>;
  }, [
    agentResult.agent,
    bridgeAiAvailability,
    connectedTables,
    shouldUseBridgeRuntime,
  ]);
  const selectedTransportRef = useRef<ChatTransport<UIMessage> | null>(null);
  selectedTransportRef.current = selectedTransport;
  const chatTransport = useMemo(
    () =>
      createDelegatingChatTransport(
        () => selectedTransportRef.current,
        () =>
          "Missing AI configuration. Open Settings and configure provider, API key, and model.",
      ),
    [],
  );

  useEffect(() => {
    if (!shouldUseBridgeRuntime) {
      setBridgeAiAvailability("unavailable");
      return;
    }

    let cancelled = false;
    setBridgeAiAvailability("checking");
    void canUseBridgeAi().then((available) => {
      if (!cancelled) {
        setBridgeAiAvailability(available ? "available" : "unavailable");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [shouldUseBridgeRuntime]);

  const { sendMessage, status } = useChat<UIMessage>({
    id: "sql-editor-ai-assist",
    messages: [],
    transport: chatTransport,
    onError: (error) => {
      setPromptError(toPromptErrorMessage(error));
    },
    onFinish: ({ message, isAbort, isError }) => {
      if (isAbort || isError || message.role !== "assistant") {
        return;
      }

      const text = getTextFromUiMessage(message);
      const sql = extractSqlSuggestion(text);
      setAssistantText(text || null);
      setPendingSuggestion(sql ? { sql, assistantText: text } : null);
    },
  });

  const isRunning = status === "submitted" || status === "streaming";
  const resultContext = useMemo(
    () => buildSqlEditorResultContext(result),
    [result],
  );

  async function submitAction(action: SqlEditorAiAction) {
    const actionConfig = QUICK_ACTIONS.find((a) => a.action === action);

    // If the action is meant to reveal the prompt input (e.g. Ask, Write SQL
    // with no prompt), show the input and focus it so the user can type.
    if (actionConfig?.revealInput && !promptDraft.trim()) {
      setShowInput(true);
      requestAnimationFrame(() => textareaRef.current?.focus());
      return;
    }

    if (!selectedTransport) {
      const error = agentResult.error;
      setPromptError(
        error
          ? toPromptErrorMessage(error)
          : "Missing AI configuration. Open Settings and configure provider, API key, and model.",
      );
      return;
    }

    setPromptError(null);
    setAssistantText(null);
    setPendingSuggestion(null);

    const prompt = buildSqlEditorAssistPrompt({
      action,
      customPrompt: promptDraft,
      currentSql,
      selectedDb,
      selectedCatalogContext,
      queryNotice,
      resultContext,
    });

    try {
      await sendMessage({
        text: prompt,
      });
    } catch (error) {
      setPromptError(
        error instanceof Error
          ? toPromptErrorMessage(error)
          : "Failed to send the AI request.",
      );
    }
  }

  const hasCurrentSql = currentSql.trim().length > 0;
  const hasResult = Boolean(resultContext);

  function handleOpenChange(open: boolean) {
    setPopoverOpen(open);
    if (!open) {
      setShowInput(false);
      setPromptDraft("");
    }
  }

  return (
    <Popover open={popoverOpen} onOpenChange={handleOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="group relative flex h-[26px] items-center gap-1.5 overflow-hidden rounded-md border border-primary/20 bg-primary/5 px-2.5 py-1.5 text-xs font-semibold text-primary shadow-sm transition-all hover:bg-primary/10 hover:shadow-md active:scale-[0.98]"
              aria-label="Open SQL AI assist"
            >
              <span className="absolute inset-0 bg-gradient-to-r from-primary/0 via-primary/5 to-primary/0 opacity-0 transition-opacity group-hover:opacity-100" />
              <Sparkles className="relative h-3.5 w-3.5 transition-transform group-hover:rotate-12" />
              <span className="relative">AI</span>
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>
          <p>SQL AI assist</p>
        </TooltipContent>
      </Tooltip>

      <PopoverContent
        align="end"
        className="w-[560px] overflow-hidden rounded-xl border border-border/60 bg-popover p-0 shadow-lg shadow-black/5"
        sideOffset={6}
      >
        {/* Header */}
        <div className="relative flex items-center gap-2.5 border-b border-border/50 bg-gradient-to-r from-primary/5 via-transparent to-transparent px-4 py-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
          </div>
          <div className="flex flex-1 flex-col">
            <p className="text-sm font-semibold leading-none">SQL AI Assist</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {isRunning
                ? "Thinking..."
                : "Ask me to write, fix, or explain SQL"}
            </p>
          </div>
          {isRunning && (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          )}
        </div>

        <div className="space-y-4 p-4">
          {/* Quick Actions */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              <MessageSquarePlus className="h-3 w-3" />
              Quick Actions
            </div>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_ACTIONS.map((item) => {
                const disabled =
                  isRunning ||
                  (item.needsSql && !hasCurrentSql) ||
                  (item.needsResult && !hasResult);

                return (
                  <Tooltip key={item.action} delayDuration={400}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => void submitAction(item.action)}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-all",
                          "hover:-translate-y-px hover:shadow-sm active:translate-y-0 active:scale-[0.97]",
                          disabled
                            ? "cursor-not-allowed border-transparent bg-muted/40 text-muted-foreground/50 opacity-60"
                            : "border-border/70 bg-background text-foreground hover:border-primary/30 hover:bg-primary/5 hover:text-primary",
                        )}
                      >
                        {item.icon}
                        {item.label}
                      </button>
                    </TooltipTrigger>
                    {disabled && (
                      <TooltipContent className="max-w-[200px] text-xs">
                        {item.needsResult && !hasResult
                          ? "Run a query first"
                          : item.needsSql && !hasCurrentSql
                            ? "Write some SQL first"
                            : "Unavailable"}
                      </TooltipContent>
                    )}
                  </Tooltip>
                );
              })}
            </div>
          </div>

          {/* Prompt Input */}
          {showInput && (
            <div className="animate-in fade-in slide-in-from-top-2 space-y-2 duration-200">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Custom prompt
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setShowInput(false);
                    setPromptDraft("");
                  }}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
              <div className="relative">
                <textarea
                  ref={textareaRef}
                  value={promptDraft}
                  onChange={(event) => setPromptDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" &&
                      !event.shiftKey &&
                      !event.nativeEvent.isComposing
                    ) {
                      event.preventDefault();
                      if (promptDraft.trim() && !isRunning) {
                        void submitAction("custom");
                      }
                    }
                  }}
                  placeholder="What would you like me to write?"
                  rows={2}
                  disabled={isRunning}
                  className={cn(
                    "w-full resize-none rounded-lg border bg-background px-3.5 py-2.5 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/60",
                    "transition-all duration-200",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary/40",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                    !promptDraft.trim() && "border-dashed",
                  )}
                />
                <div className="absolute bottom-2 right-2 flex items-center gap-1">
                  <kbd className="hidden rounded border bg-muted px-1 py-0.5 text-[10px] font-mono text-muted-foreground shadow-sm sm:inline-block">
                    ↵
                  </kbd>
                  <Button
                    type="button"
                    size="icon"
                    className={cn(
                      "h-7 w-7 rounded-md transition-all duration-200",
                      promptDraft.trim() && !isRunning
                        ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:shadow"
                        : "bg-muted text-muted-foreground",
                    )}
                    disabled={isRunning || !promptDraft.trim()}
                    onClick={() => void submitAction("custom")}
                  >
                    {isRunning ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <SendHorizonal className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {promptError ? (
            <div className="animate-in fade-in slide-in-from-top-1 duration-200">
              <PromptErrorBanner message={promptError} />
            </div>
          ) : null}

          {/* Pending Suggestion */}
          {pendingSuggestion ? (
            <div className="animate-in zoom-in-95 fade-in duration-200">
              <div className="overflow-hidden rounded-lg border border-primary/20 bg-primary/[0.03]">
                <div className="flex items-center gap-2 border-b border-primary/10 bg-primary/[0.04] px-3 py-2">
                  <Code2 className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs font-semibold text-primary">
                    Suggested SQL
                  </span>
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    Generated by AI
                  </span>
                </div>
                <div className="max-h-52 overflow-auto bg-background/50 p-3">
                  <pre className="text-xs leading-relaxed">
                    <code className="font-mono text-foreground">
                      {pendingSuggestion.sql}
                    </code>
                  </pre>
                </div>
                <div className="flex items-center justify-end gap-2 border-t border-primary/10 bg-primary/[0.02] px-3 py-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setPendingSuggestion(null)}
                  >
                    <X className="h-3 w-3" />
                    Decline
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 gap-1 bg-primary text-xs text-primary-foreground hover:bg-primary/90"
                    onClick={() => {
                      onAcceptSql(pendingSuggestion.sql);
                      setPendingSuggestion(null);
                    }}
                  >
                    <Check className="h-3 w-3" />
                    Accept
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          {/* Assistant Response */}
          {assistantText ? (
            <div
              className={cn(
                "animate-in zoom-in-95 fade-in duration-200",
                pendingSuggestion && "mt-2",
              )}
            >
              {pendingSuggestion && <Separator className="mb-4 bg-border/50" />}
              <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <div className="flex h-5 w-5 items-center justify-center rounded bg-primary/10">
                    <Sparkles className="h-3 w-3 text-primary" />
                  </div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Response
                  </span>
                </div>
                <div
                  className={cn(
                    "max-h-56 overflow-auto text-sm leading-relaxed",
                    pendingSuggestion && "text-xs",
                  )}
                >
                  <Response>{assistantText}</Response>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
