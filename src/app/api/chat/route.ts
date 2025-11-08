import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import { setContext } from "@/ai/context";
import { analysisPrompt } from "@/ai/prompts";
import { tools } from "@/ai/tools";
import type { ConnectedTable } from "@/lib/connected-tables";

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

// This route is kept for backward compatibility. The new per-chat route is at `app/api/chat/[chatId]/route.ts`.
export async function POST(req: Request) {
  const body = await req.json();
  const { messages }: { messages: UIMessage[] } = body;
  const {
    connectedTables = [],
  }: { messages: UIMessage[]; connectedTables?: ConnectedTable[] } = body as {
    messages: UIMessage[];
    connectedTables?: ConnectedTable[];
  };

  const stream = createUIMessageStream({
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
        messages: convertToModelMessages(messages),
        tools,
        stopWhen: stepCountIs(5),
      });

      writer.merge(result.toUIMessageStream());
    },
  });

  return createUIMessageStreamResponse({ stream });
}
