import { useCallback, useEffect, useState } from "react";
import type { ChatHistoryEntry } from "@/lib/chat-history";
import { listRecentChats } from "@/lib/workspace/chat-repo";

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
        const chatList = await listRecentChats();
        setChats(chatList);
        return chatList;
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
