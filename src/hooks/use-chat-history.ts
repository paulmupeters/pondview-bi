import { useCallback, useState } from "react";

type ChatHistoryEntry = {
  id: string;
  title: string | null;
  updatedAt: number;
};

export function useChatHistory() {
  const [chats, setChats] = useState<ChatHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadChats = useCallback(async (): Promise<ChatHistoryEntry[]> => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/chats", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as { chats: ChatHistoryEntry[] };
        const chatList = data.chats ?? [];
        setChats(chatList);
        return chatList;
      }
    } catch (error) {
      console.error("Failed to load chats:", error);
    } finally {
      setIsLoading(false);
    }

    return [];
  }, []);

  return { chats, isLoading, loadChats };
}
