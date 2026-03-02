import { deleteMessageFromChat } from "@/lib/repositories/chat";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function DELETE(
  req: Request,
  context: { params: Promise<{ chatId: string; messageId: string }> },
) {
  try {
    const { chatId, messageId } = await context.params;

    if (!messageId || !chatId) {
      return Response.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    // Delete the message from the database
    await deleteMessageFromChat(chatId, messageId);

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error deleting message:", error);
    return Response.json(
      { error: "Failed to delete message" },
      { status: 500 },
    );
  }
}

