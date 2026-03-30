import { type UIMessage, useChat } from "@ai-sdk/react";
import type { ChatStatus, ChatTransport } from "ai";
import { DirectChatTransport } from "ai";
import { nanoid } from "nanoid";
import type { KeyboardEventHandler, MutableRefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPondviewAgent } from "@/ai/client/agent";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import { useInlineTextEdit } from "@/components/hooks/use-inline-text-edit";
import { useConnectedTables } from "@/hooks/use-connected-tables";
import {
  getRandomVerbAiIsThinking,
  showRandomAnimation,
} from "@/lib/animations";
import {
  appendAssistantMessage,
  appendUserMessageTx,
  deleteMessageFromChat,
  getChatTitleById,
  listMessagesByChatId,
  updateChatTitle,
} from "@/lib/workspace/chat-repo";
import {
  deriveTitleFromInput,
  toPromptErrorMessage,
  toUiMessages,
} from "./chat-session-utils";

const EMPTY_INITIAL_MESSAGES: UIMessage[] = [];

type TitleField = "title";

export type ChatTitleBarModel = {
  title: string | null;
  isEditing: boolean;
  draftValue: string;
  inputRef: MutableRefObject<HTMLInputElement | null>;
  setDraftValue: (value: string) => void;
  beginEditing: () => void;
  handleBlur: () => void;
  handleKeyDown: KeyboardEventHandler<HTMLInputElement>;
};

export type ChatSessionController = {
  thread: {
    messages: UIMessage[];
    setMessages: ReturnType<typeof useChat<UIMessage>>["setMessages"];
    status: ChatStatus;
    animationFrame: string;
    verbAiIsThinking: string;
    removeMessage: (messageId: string) => Promise<void>;
  };
  composer: {
    promptError: string | null;
    status: ChatStatus;
    pendingMode: "ai" | null;
    submitPrompt: (message: PromptInputMessage) => Promise<void>;
  };
  titleBar: ChatTitleBarModel;
  artifactProvider: {
    chatId: string;
    messages: UIMessage[];
    setMessages: ReturnType<typeof useChat<UIMessage>>["setMessages"];
    executeSqlArtifactType: string;
  };
};

export function useChatSession({
  chatId,
  initialMessages,
  executeSqlArtifactType,
}: {
  chatId: string;
  initialMessages?: UIMessage[];
  executeSqlArtifactType: string;
}): ChatSessionController {
  const connectedTables = useConnectedTables();
  const resolvedInitialMessages = initialMessages ?? EMPTY_INITIAL_MESSAGES;
  const [promptError, setPromptError] = useState<string | null>(null);
  const [chatTitle, setChatTitle] = useState<string | null>(null);
  const hydratedChatIdRef = useRef<string | null>(
    resolvedInitialMessages.length > 0 ? chatId : null,
  );

  const agent = useMemo(() => {
    try {
      return createPondviewAgent(connectedTables);
    } catch (error) {
      console.error("Failed to initialize AI agent:", error);
      setPromptError(
        error instanceof Error
          ? toPromptErrorMessage(error)
          : "Missing AI configuration. Open Settings and configure provider, API key, and model.",
      );
      return null;
    }
  }, [connectedTables]);

  const directTransport = useMemo<ChatTransport<UIMessage> | null>(() => {
    if (!agent) {
      return null;
    }

    return new DirectChatTransport({
      agent,
      sendReasoning: false,
      sendSources: false,
    }) as unknown as ChatTransport<UIMessage>;
  }, [agent]);

  const { messages, setMessages, sendMessage, status } = useChat<UIMessage>({
    id: chatId,
    messages: resolvedInitialMessages,
    transport: directTransport ?? undefined,
    onError: (error) => {
      console.error("AI chat error:", error);
      setPromptError(toPromptErrorMessage(error));
    },
    onFinish: ({ message, isAbort, isError }) => {
      if (isAbort || isError || message.role !== "assistant") {
        return;
      }

      const textPart = Array.isArray(message.parts)
        ? message.parts.find((part) => part.type === "text")
        : undefined;
      const text =
        textPart && "text" in textPart && typeof textPart.text === "string"
          ? textPart.text
          : "";

      void appendAssistantMessage(
        chatId,
        message.id || nanoid(),
        text,
        JSON.stringify(message.parts ?? [{ type: "text", text }]),
      );
    },
  });

  useEffect(() => {
    let cancelled = false;

    const loadChatTitle = async () => {
      try {
        const title = await getChatTitleById(chatId);
        if (!cancelled) {
          setChatTitle(title);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load chat title:", error);
        }
      }
    };

    void loadChatTitle();

    return () => {
      cancelled = true;
    };
  }, [chatId]);

  useEffect(() => {
    if (hydratedChatIdRef.current === chatId) {
      return;
    }

    if (resolvedInitialMessages.length > 0) {
      setMessages(resolvedInitialMessages);
      hydratedChatIdRef.current = chatId;
      return;
    }

    let cancelled = false;

    const loadMessages = async () => {
      try {
        const rows = await listMessagesByChatId(chatId);
        if (!cancelled) {
          setMessages(toUiMessages(rows));
          hydratedChatIdRef.current = chatId;
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load chat messages:", error);
        }
      }
    };

    void loadMessages();

    return () => {
      cancelled = true;
    };
  }, [chatId, resolvedInitialMessages, setMessages]);

  const commitChatTitle = useCallback(
    (nextValue: string) => {
      const previousTitle = chatTitle;
      const nextTitle = nextValue.trim() || null;

      if (nextTitle === previousTitle) {
        return;
      }

      setChatTitle(nextTitle);
      void updateChatTitle(chatId, nextTitle).catch((error) => {
        console.error("Failed to update chat title:", error);
        setChatTitle(previousTitle);
      });
    },
    [chatId, chatTitle],
  );

  const {
    editingField,
    draftValue,
    setDraftValue,
    inputRef,
    startEditing,
    handleInputBlur,
    handleInputKeyDown,
  } = useInlineTextEdit<TitleField>({
    getValue: () => chatTitle ?? "",
    onCommit: (_field, value) => {
      commitChatTitle(value);
    },
  });

  const beginEditing = useCallback(() => {
    startEditing("title");
  }, [startEditing]);

  const submitPrompt = useCallback(
    async (message: PromptInputMessage) => {
      const text = message.text?.trim() ?? "";
      const files = message.files;

      if (!text && (!files || files.length === 0)) {
        return;
      }

      if (!directTransport) {
        setPromptError(
          "Missing AI configuration. Open Settings and configure provider, API key, and model.",
        );
        return;
      }

      setPromptError(null);

      const now = Date.now();
      const messageId = nanoid();
      const userParts: UIMessage["parts"] = [];

      if (text) {
        userParts.push({ type: "text", text });
      }

      if (files && files.length > 0) {
        userParts.push(...(files as unknown as UIMessage["parts"][number][]));
      }

      const persistedContent =
        text || files?.[0]?.filename || "Attachment message";

      await appendUserMessageTx({
        chatId,
        messageId,
        content: persistedContent,
        partsJson: JSON.stringify(userParts),
        titleForNewChat: deriveTitleFromInput(text),
        now,
      });

      const inferredTitle = deriveTitleFromInput(text);
      if (inferredTitle) {
        setChatTitle((previous) => previous || inferredTitle);
      }

      setMessages((previous) => {
        if (
          previous.some((existingMessage) => existingMessage.id === messageId)
        ) {
          return previous;
        }

        return [
          ...previous,
          {
            id: messageId,
            role: "user",
            parts: userParts,
          },
        ];
      });

      if (text) {
        await sendMessage({ text, files, messageId });
        return;
      }

      await sendMessage({
        files: files ?? [],
        messageId,
      });
    },
    [chatId, directTransport, sendMessage, setMessages],
  );

  const removeMessage = useCallback(
    async (messageId: string) => {
      setMessages((previous) =>
        previous.filter((message) => message.id !== messageId),
      );
      try {
        await deleteMessageFromChat(chatId, messageId);
      } catch (error) {
        console.error("Failed to delete message:", error);
      }
    },
    [chatId, setMessages],
  );

  const [animationFrame, setAnimationFrame] = useState("");
  const [verbAiIsThinking, setVerbAiIsThinking] = useState("is thinking");

  useEffect(() => {
    if (status === "streaming" || status === "submitted") {
      const animation = showRandomAnimation(
        undefined,
        Number.POSITIVE_INFINITY,
        (frame) => setAnimationFrame(frame),
      );
      return () => animation.stop();
    }

    setAnimationFrame("");
  }, [status]);

  useEffect(() => {
    setVerbAiIsThinking(getRandomVerbAiIsThinking());
  }, []);

  return {
    thread: {
      messages,
      setMessages,
      status,
      animationFrame,
      verbAiIsThinking,
      removeMessage,
    },
    composer: {
      promptError,
      status,
      pendingMode:
        status === "submitted" || status === "streaming" ? "ai" : null,
      submitPrompt,
    },
    titleBar: {
      title: chatTitle,
      isEditing: editingField === "title",
      draftValue,
      inputRef,
      setDraftValue,
      beginEditing,
      handleBlur: handleInputBlur,
      handleKeyDown: handleInputKeyDown,
    },
    artifactProvider: {
      chatId,
      messages,
      setMessages,
      executeSqlArtifactType,
    },
  };
}
