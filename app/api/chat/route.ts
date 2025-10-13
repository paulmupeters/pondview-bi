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

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

// This route is kept for backward compatibility. The new per-chat route is at `app/api/chat/[chatId]/route.ts`.
export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();
  const connectedTables = [
    {
      type: "duckdb",
      databasePath: "bla.db",
      table: "main.unicorns",
      description: "all unicorn companies valued above 1 billion dollars",
    },
  ];

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
