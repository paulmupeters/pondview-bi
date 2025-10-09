import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { setContext } from "@/ai/context";
import { tools } from "@/ai/tools";
import { db } from "@/lib/db/client";
import { chats, messages } from "@/lib/db/schema";

export const runtime = "nodejs";

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function GET(
  _req: Request,
  { params }: { params: { chatId: string } },
) {
  const chatId = params.chatId;

  const rows = await db.query.messages.findMany({
    where: (m, { eq }) => eq(m.chatId, chatId),
    orderBy: (m, { asc }) => [asc(m.createdAt)],
  });

  const uiMessages: UIMessage[] = rows.map((r) => {
    const parsedParts = r.parts ? safeJsonParse(r.parts) : undefined;
    return {
      id: r.id,
      role: r.role as UIMessage["role"],
      parts:
        (Array.isArray(parsedParts) && parsedParts.length > 0
          ? parsedParts
          : [{ type: "text", text: r.content }]) as UIMessage["parts"],
    } satisfies UIMessage;
  });

  return Response.json({ messages: uiMessages });
}

export async function POST(
  req: Request,
  { params }: { params: { chatId: string } },
) {
  const { messages: uiMessages }: { messages: UIMessage[] } = await req.json();
  const chatId = params.chatId;

  // Ensure chat exists
  await db
    .insert(chats)
    .values({
      id: chatId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    .onConflictDoNothing();

  // Persist last user message if present
  const last = uiMessages[uiMessages.length - 1];
  if (last && last.role === "user") {
    const textPart = Array.isArray(last.parts)
      ? last.parts.find((p) => (p as { type?: string })?.type === "text")
      : undefined;
    const text = (textPart as { text?: string } | undefined)?.text ?? "";

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

  const stream = createUIMessageStream<UIMessage>({
    onFinish: async ({ responseMessage }) => {
      // Persist assistant message when stream finishes
      const textPart = Array.isArray(responseMessage.parts)
        ? responseMessage.parts.find(
            (p) => (p as { type?: string })?.type === "text",
          )
        : undefined;
      const text = (textPart as { text?: string } | undefined)?.text ?? "";

      await db.insert(messages).values({
        id: responseMessage.id || nanoid(),
        chatId,
        role: "assistant",
        content: text,
        parts: JSON.stringify(
          responseMessage.parts ?? [{ type: "text", text }],
        ),
        createdAt: Date.now(),
      }).onConflictDoNothing();

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
        system: `You are a helpful financial analysis assistant and an expert in postgres and duckdb.
        dont use more than 4 sentences to answer questions

  When users ask about burn rate analysis, financial health, runway calculations, or expense tracking, use the analyzeBurnRateTool to create interactive charts and insights.
  When users ask about unicorn companies, use the executeSqlTool to execute a sql query and return the results. Use it when for example the user asks how many unicorn companies are there in the world. You can then do a count of the results to answer the question.
  Before writing a SQL query, use the getTableSchemaTool to understand the table structure and available columns.

  Always use the tool when users provide financial data or ask for burn rate analysis.

  `,
        messages: convertToModelMessages(uiMessages),
        tools,
        stopWhen: stepCountIs(10),
      });

      writer.merge(result.toUIMessageStream());
    },
  });

  return createUIMessageStreamResponse({ stream });
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}


