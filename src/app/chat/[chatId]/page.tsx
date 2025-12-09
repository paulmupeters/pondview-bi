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

function parsePartsOrFallback(
  partsJson: string | null | undefined,
  content: string,
): UIMessage["parts"] {
  const parsed = partsJson ? safeJsonParse(partsJson) : undefined;

  if (Array.isArray(parsed) && parsed.length > 0) {
    return parsed as UIMessage["parts"];
  }

  if (parsed && typeof parsed === "object") {
    const maybeParts = (parsed as { parts?: unknown }).parts;
    if (Array.isArray(maybeParts) && maybeParts.length > 0) {
      return maybeParts as UIMessage["parts"];
    }
  }

  return [{ type: "text", text: content }] as UIMessage["parts"];
}

async function getInitialMessages(chatId: string): Promise<UIMessage[]> {
  try {
    const rows = await listMessagesByChatId(chatId);

    const uiMessages: UIMessage[] = rows.map((row: DbMessageRow) => {
      return {
        id: row.id,
        role: row.role as UIMessage["role"],
        parts: parsePartsOrFallback(row.parts, row.content),
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
