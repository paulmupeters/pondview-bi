import Chat from "@/components/chat";
import { asc, eq } from "drizzle-orm";
import type { UIMessage } from "ai";
import { getDb } from "@/lib/db/client";
import { messages } from "@/lib/db/schema";

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

async function getInitialMessages(chatId: string): Promise<UIMessage[]> {
  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(messages)
      .where(eq(messages.chatId, chatId))
      .orderBy(asc(messages.createdAt));

    const uiMessages: UIMessage[] = rows.map((row: typeof messages.$inferSelect) => {
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

export default async function ChatPage({ params }: { params: Promise<{ chatId: string }> }) {
  const { chatId } = await params;
  const initialMessages = await getInitialMessages(chatId);
  return (
    <div className="font-sans h-screen overflow-hidden">
      <Chat chatId={chatId} initialMessages={initialMessages} />
    </div>
  );
}