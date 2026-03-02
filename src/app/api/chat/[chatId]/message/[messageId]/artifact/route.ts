import { getMessageById, updateMessageParts } from "@/lib/repositories/chat";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function PUT(
  req: Request,
  context: { params: Promise<{ chatId: string; messageId: string }> },
) {
  try {
    const { chatId, messageId } = await context.params;
    const body = await req.json();
    console.log("body--input", body.visualType);

    const { artifactId, payload } = body;

    if (!messageId || !chatId || !artifactId) {
      return Response.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    // Get the existing message
    const message = await getMessageById(messageId);
    if (!message) {
      return Response.json({ error: "Message not found" }, { status: 404 });
    }

    // Parse existing parts
    let parts: unknown[] = [];
    if (message.parts) {
      try {
        parts = JSON.parse(message.parts);
      } catch {
        parts = [];
      }
    }

    // Find and update the artifact part
    const updatedParts = parts.map((part) => {
      const typedPart = part as {
        type?: string;
        data?: { id?: string; payload?: unknown };
      };
      if (
        typedPart.type?.startsWith("data-artifact-") &&
        typedPart.data?.id === artifactId
      ) {
        return {
          ...typedPart,
          data: {
            ...typedPart.data,
            payload,
          },
        };
      }
      return part;
    });

    // Save updated parts
    await updateMessageParts(chatId, messageId, JSON.stringify(updatedParts));

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error updating artifact:", error);
    return Response.json(
      { error: "Failed to update artifact" },
      { status: 500 },
    );
  }
}
