import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import { nanoid } from "nanoid";
import type { NextRequest } from "next/server";
import { setContext } from "@/ai/context";
import { analysisPrompt } from "@/ai/prompts";
import { tools } from "@/ai/tools";
import type { ConnectedTable } from "@/lib/connected-tables";
import type { messages } from "@/lib/db/schema";
import {
  appendAssistantMessage,
  appendUserMessageTx,
  deleteChat,
  listMessagesByChatId,
} from "@/lib/repositories/chat";

export const runtime = "nodejs";
// export const dynamic = "force-dynamic";

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const { chatId } = await params;
  const rows = await listMessagesByChatId(chatId);

  const uiMessages: UIMessage[] = rows.map(
    (row: typeof messages.$inferSelect) => {
      const parsedParts = row.parts ? safeJsonParse(row.parts) : undefined;
      return {
        id: row.id,
        role: row.role as UIMessage["role"],
        parts: (Array.isArray(parsedParts) && parsedParts.length > 0
          ? parsedParts
          : [{ type: "text", text: row.content }]) as UIMessage["parts"],
      } satisfies UIMessage;
    }
  );

  return Response.json({ messages: uiMessages });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const body = await req.json();
  const {
    messages: uiMessages,
    connectedTables = [],
  }: { messages: UIMessage[]; connectedTables?: ConnectedTable[] } = body;
  const { chatId } = await params;

  // We only create the chat upon first user message below

  // Persist last user message if present
  const last = uiMessages[uiMessages.length - 1];
  if (last && last.role === "user") {
    const textPart = Array.isArray(last.parts)
      ? last.parts.find((p) => (p as { type?: string })?.type === "text")
      : undefined;
    const text = (textPart as { text?: string } | undefined)?.text ?? "";

    const deriveTitleFrom = (input: string): string | null => {
      const trimmed = input.trim();
      if (!trimmed) return null;
      return trimmed.length > 20 ? `${trimmed.slice(0, 20)}...` : trimmed;
    };

    await appendUserMessageTx({
      chatId,
      messageId: last.id || nanoid(),
      content: text,
      partsJson: JSON.stringify(last.parts ?? [{ type: "text", text }]),
      titleForNewChat: deriveTitleFrom(text),
    });
  }

  const stream = createUIMessageStream<UIMessage>({
    onFinish: async ({ responseMessage }) => {
      // Persist assistant message when stream finishes
      const textPart = Array.isArray(responseMessage.parts)
        ? responseMessage.parts.find(
            (p) => (p as { type?: string })?.type === "text"
          )
        : undefined;
      const text = (textPart as { text?: string } | undefined)?.text ?? "";

      await appendAssistantMessage(
        chatId,
        responseMessage.id || nanoid(),
        text,
        JSON.stringify(responseMessage.parts ?? [{ type: "text", text }])
      );
    },
    execute: ({ writer }) => {
      // Set up typed context with user information
      setContext({
        writer,
        userId: "123",
        fullName: "John Doe",
      });

      const result = streamText({
        model: "xai/grok-4-fast-reasoning",
        system: analysisPrompt.replace(
          "{connectedTables}",
          JSON.stringify(connectedTables)
        ),
        messages: convertToModelMessages(uiMessages),
        tools,
        stopWhen: stepCountIs(5),
      });

      writer.merge(result.toUIMessageStream());
    },
  });

  return createUIMessageStreamResponse({ stream });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ chatId: string }> }
) {
  const { chatId } = await params;
  await deleteChat(chatId);
  return new Response(null, { status: 204 });
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}
