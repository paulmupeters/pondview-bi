import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import { asc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { setContext } from "@/ai/context";
import { tools } from "@/ai/tools";
import { db } from "@/lib/db/client";
import { chats, messages } from "@/lib/db/schema";
import { analysisPrompt } from "@/ai/prompts";

export const runtime = "nodejs";

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function GET(_req: Request, { params }: { params: { chatId: string } }) {
  const chatId = params.chatId;
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.chatId, chatId))
    .orderBy(asc(messages.createdAt));

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

export async function POST(req: Request, { params }: { params: { chatId: string } }) {
  const { messages: uiMessages }: { messages: UIMessage[] } = await req.json();
  const chatId = params.chatId;

  // We only create the chat upon first user message below

  // Persist last user message if present
  const last = uiMessages[uiMessages.length - 1];
  if (last && last.role === "user") {
    const textPart = Array.isArray(last.parts)
      ? last.parts.find((p) => (p as { type?: string })?.type === "text")
      : undefined;
    const text = (textPart as { text?: string } | undefined)?.text ?? "";

    // Create chat now (first time we receive a user message for this id)
    await db
      .insert(chats)
      .values({
        id: chatId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      .onConflictDoNothing();

    await db
      .insert(messages)
      .values({
        id: last.id || nanoid(),
        chatId,
        role: "user",
        content: text,
        parts: JSON.stringify(last.parts ?? [{ type: "text", text }]),
        createdAt: Date.now(),
      })
      .onConflictDoNothing();

    await db
      .update(chats)
      .set({ updatedAt: Date.now() })
      .where(eq(chats.id, chatId));
  }
  const connectedTables = [
    {
      type: "duckdb",
      databasePath: "bla.db",
      table: "main.unicorns",
      description: "all unicorn companies valued above 1 billion dollars",
    },
  ];
  const stream = createUIMessageStream<UIMessage>({
    onFinish: async ({ responseMessage }) => {
      // Persist assistant message when stream finishes
      const textPart = Array.isArray(responseMessage.parts)
        ? responseMessage.parts.find(
            (p) => (p as { type?: string })?.type === "text"
          )
        : undefined;
      const text = (textPart as { text?: string } | undefined)?.text ?? "";

      await db
        .insert(messages)
        .values({
          id: responseMessage.id || nanoid(),
          chatId,
          role: "assistant",
          content: text,
          parts: JSON.stringify(
            responseMessage.parts ?? [{ type: "text", text }]
          ),
          createdAt: Date.now(),
        })
        .onConflictDoNothing();

      await db
        .update(chats)
        .set({ updatedAt: Date.now() })
        .where(eq(chats.id, chatId));
    },
    execute: ({ writer }) => {
      // Set up typed context with user information
      setContext({
        writer,
        userId: "123",
        fullName: "John Doe",
      });

      const result = streamText({
        model: "openai/gpt-5-nano",
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
  _req: Request,
  { params }: { params: { chatId: string } }
) {
  const chatId = params.chatId;
  await db.delete(chats).where(eq(chats.id, chatId));
  return new Response(null, { status: 204 });
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}


