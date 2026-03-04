import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import { setContext } from "@/ai/context";
import { LEGACY_CHAT_MODEL } from "@/ai/models";
import { analysisPrompt } from "@/ai/prompts";
import { tools } from "@/ai/tools/server";
import type { ConnectedTable } from "@/lib/connected-tables";

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

// Deprecated compatibility route:
// Primary UI chat flow now uses client-side DirectChatTransport.
// Keep this endpoint for legacy callers and transition period support.
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
    execute: async ({ writer }) => {
      // Set up typed context with user information
      setContext({
        writer,
        userId: "123",
        fullName: "John Doe",
      });

      const result = streamText({
        model: LEGACY_CHAT_MODEL,
        system: analysisPrompt.replace(
          "{connectedTables}",
          JSON.stringify(
            connectedTables.map(({ databasePath, ...rest }) => rest),
          ),
        ),
        messages: await convertToModelMessages(messages),
        tools,
        stopWhen: stepCountIs(5),
      });

      writer.merge(result.toUIMessageStream());
    },
  });

  return createUIMessageStreamResponse({ stream });
}
