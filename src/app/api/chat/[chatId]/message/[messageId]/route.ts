import { deleteMessageFromChat } from "@/lib/repositories/chat";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function DELETE(
  req: Request,
  context: { params: Promise<{ chatId: string; messageId: string }> },
) {
  try {
    const { chatId, messageId } = await context.params;

    if (!messageId || !chatId) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    // Delete the message from the database
    await deleteMessageFromChat(chatId, messageId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting message:", error);
    return NextResponse.json(
      { error: "Failed to delete message" },
      { status: 500 },
    );
  }
}

