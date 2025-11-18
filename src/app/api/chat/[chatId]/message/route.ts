import { appendAssistantMessage } from "@/lib/repositories/chat";
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

    // Serialize parts to JSON string if provided
    const partsJson = parts ? JSON.stringify(parts) : undefined;

    // Save the assistant message to the database
    await appendAssistantMessage(
      chatId,
      messageId,
      content || "",
      partsJson,
      createdAt || Date.now(),
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
