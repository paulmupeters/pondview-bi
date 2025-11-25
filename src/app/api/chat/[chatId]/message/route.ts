import { appendAssistantMessage, ensureChat } from "@/lib/repositories/chat";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(
  req: Request,
  context: { params: Promise<{ chatId: string }> },
) {
  try {
    const { chatId } = await context.params;
    const body = await req.json();

    const { messageId, content, parts, createdAt } = body;

    if (!messageId || !chatId) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    const now = createdAt || Date.now();

    // Ensure the chat exists before adding the message
    // This handles the case when adding SQL/Chart results from the home page
    await ensureChat(chatId, "SQL Query Results", now);

    // Serialize parts to JSON string if provided
    const partsJson = parts ? JSON.stringify(parts) : undefined;

    // Save the assistant message to the database
    await appendAssistantMessage(
      chatId,
      messageId,
      content || "",
      partsJson,
      now,
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error saving message:", error);
    return NextResponse.json(
      { error: "Failed to save message" },
      { status: 500 },
    );
  }
}
