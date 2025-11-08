import type { UIMessage } from "ai";
import Chat from "@/components/chat";
import type { DbMessageRow } from "@/lib/repositories/chat";
import { listMessagesByChatId } from "@/lib/repositories/chat";

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

async function getInitialMessages(chatId: string): Promise<UIMessage[]> {
  try {
    const rows = await listMessagesByChatId(chatId);

    const uiMessages: UIMessage[] = rows.map((row: DbMessageRow) => {
      const parsedParts = row.parts ? safeJsonParse(row.parts) : undefined;
      return {
        id: row.id,
        role: row.role as UIMessage["role"],
        parts: (Array.isArray(parsedParts) && parsedParts.length > 0
          ? parsedParts
          : [{ type: "text", text: row.content }]) as UIMessage["parts"],
      } satisfies UIMessage;
    });
    return uiMessages;
  } catch (err) {
    console.error("Error loading initial messages:", err);
    return [] as UIMessage[];
  }
}

export default async function ChatPage({
  params,
}: {
  params: Promise<{ chatId: string }>;
}) {
  const { chatId } = await params;
  const initialMessages = await getInitialMessages(chatId);
  return (
    <div className="font-sans h-screen overflow-hidden">
      <Chat chatId={chatId} initialMessages={initialMessages} />
    </div>
  );
}
