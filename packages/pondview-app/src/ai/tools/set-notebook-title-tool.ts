import { tool } from "ai";
import { z } from "zod";

export function normalizeNotebookTitle(title: string): string {
  return title
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^["'`]+|["'`]+$/g, "")
    .slice(0, 80)
    .trim();
}

export const setNotebookTitleTool = tool({
  description:
    "Set a short title for the current analysis notebook. Use this once near the start of a new notebook.",
  inputSchema: z.object({
    title: z
      .string()
      .min(1)
      .max(80)
      .describe("A concise notebook title, ideally 3 to 6 words."),
  }),
  execute: async ({ title }) => {
    return {
      title: normalizeNotebookTitle(title),
    };
  },
});
