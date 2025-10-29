import { generateObject } from "ai";
import { cardConfigSchema, type Result } from "@/lib/types";

export const generateCardConfig = async (
  value: string | number | boolean | Date,
  columnName: string,
  userQuery: string
) => {
  "use server";

  const { object: config } = await generateObject({
    model: "openai/gpt-5-nano",
    system: "You are a data visualization expert specializing in KPI cards and metrics.",
    prompt: `Given a single value from a SQL query result, generate a card configuration that best presents this value to answer the user's query.

      The card should:
      - Have a clear, concise title that describes what the value represents
      - Include a description explaining what this value shows in context
      - Optionally include a key takeaway if the value is particularly meaningful

      Column Name: ${columnName}
      Value: ${value}
      Value Type: ${typeof value}${value instanceof Date ? " (Date)" : ""}

      User Query:
      ${userQuery}

      Generate a card configuration that helps the user understand this value in the context of their query.`,
    schema: cardConfigSchema,
  });

  return { config };
};

