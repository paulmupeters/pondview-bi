import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";
import type { ChatHistoryEntry } from "@/lib/chat-history";

type LoadChatsOptions = {
  showLoading?: boolean;
};

export function useChatHistory(initialChats: ChatHistoryEntry[] = []) {
  const [chats, setChats] = useState<ChatHistoryEntry[]>(initialChats);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setChats(initialChats);
  }, [initialChats]);

  const loadChats = useCallback(
    async (options: LoadChatsOptions = {}): Promise<ChatHistoryEntry[]> => {
      const { showLoading = false } = options;
      if (showLoading) {
        setIsLoading(true);
      }

      try {
        const res = await apiFetch("/api/chats", { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as { chats: ChatHistoryEntry[] };
          const chatList = data.chats ?? [];
          setChats(chatList);
          return chatList;
        }
      } catch (error) {
        console.error("Failed to load chats:", error);
      } finally {
        if (showLoading) {
          setIsLoading(false);
        }
      }

      return [];
    },
    [],
  );

  return { chats, isLoading, loadChats };
}
