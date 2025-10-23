import { useCallback, useState } from "react";

export function useChatHistory() {
  const [chats, setChats] = useState<
    { id: string; title: string | null; updatedAt: number }[]
  >([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadChats = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/chats", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as {
          chats: { id: string; title: string | null; updatedAt: number }[];
        };
        setChats(data.chats ?? []);
      }
    } catch (error) {
      console.error("Failed to load chats:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { chats, isLoading, loadChats };
}
