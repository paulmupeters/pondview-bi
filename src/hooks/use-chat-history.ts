import { useCallback, useEffect, useState } from "react";
import type { ChatHistoryEntry } from "@/lib/chat-history";
import { listRecentAnalysisNotebooks } from "@/lib/workspace/analysis-notebook-repo";

type LoadChatsOptions = {
  showLoading?: boolean;
};

export function useChatHistory(initialChats: ChatHistoryEntry[] = []) {
  const [chats, setChats] = useState<ChatHistoryEntry[]>(initialChats);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setChats(initialChats);
  }, [initialChats]);

  const loadChats = useCallback(
    async (options: LoadChatsOptions = {}): Promise<ChatHistoryEntry[]> => {
      const { showLoading = false } = options;
      if (showLoading) {
        setIsLoading(true);
      }
      setError(null);

      try {
        const chatList = await listRecentAnalysisNotebooks();
        setChats(chatList);
        return chatList;
      } catch (error) {
        console.error("Failed to load chats:", error);
        setError(
          error instanceof Error ? error.message : "Failed to load chats.",
        );
      } finally {
        if (showLoading) {
          setIsLoading(false);
        }
      }

      return [];
    },
    [],
  );

  return { chats, isLoading, error, loadChats };
}
