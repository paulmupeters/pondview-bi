import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  type UIMessage,
} from "ai";
import { setContext } from "@/ai/context";
import { tools } from "@/ai/tools";

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();
  const connectedTables =	[{"type":"duckdb","databasePath":"bla.db","table":"main.unicorns","description":"all unicorn companies valued above 1 billion dollars"}]

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
        system: `You are a helpful financial analysis assistant and an expert in postgres and duckdb. 
        dont use more than 4 sentences to answer questions

  When users ask about burn rate analysis, financial health, runway calculations, or expense tracking, use the analyzeBurnRateTool to create interactive charts and insights.
  When users ask about unicorn companies, use the executeSqlTool to execute a sql query and return the results. Use it when for example the user asks how many unicorn companies are there in the world. You can then do a count of the results to answer the question.
  You have access to the following tables: ${JSON.stringify(connectedTables)}.

  Key capabilities:
  - Analyze monthly financial data (revenue, expenses, cash balance)
  - Calculate burn rate and runway metrics
  - Generate trend analysis (improving, stable, declining)
  - Provide alerts and recommendations
  - Create interactive visualizations
  - Execute sql queries on postgres and duckdb

  Always use the tool when users provide financial data or ask for burn rate analysis.
  
  `,
        messages: convertToModelMessages(messages),
        tools,
      });

      writer.merge(result.toUIMessageStream());
    },
  });

  return createUIMessageStreamResponse({ stream });
}