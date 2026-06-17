import { stepCountIs, ToolLoopAgent } from "ai";
import { resolveGatewayModel } from "@/ai/gateway-model";
import { CHAT_MODEL } from "@/ai/models";
import { analysisPrompt } from "@/ai/prompts";
import { loadAiSettingsFromStorage } from "@/ai/settings";
import { tools } from "@/ai/tools";
import type { ConnectedTable } from "@/lib/connected-tables";

function buildInstructions(connectedTables: ConnectedTable[]): string {
  const baseInstructions = analysisPrompt.replace(
    "{connectedTables}",
    JSON.stringify(connectedTables.map(({ databasePath, ...rest }) => rest)),
  );
  const customSystemPrompt =
    loadAiSettingsFromStorage().customSystemPrompt.trim();

  if (!customSystemPrompt) {
    return baseInstructions;
  }

  return `${baseInstructions}

# User system prompt
${customSystemPrompt}
`;
}

export function createPondviewAgent(connectedTables: ConnectedTable[]) {
  return new ToolLoopAgent({
    model: resolveGatewayModel(CHAT_MODEL),
    instructions: buildInstructions(connectedTables),
    tools,
    stopWhen: stepCountIs(8),
  });
}

function buildSqlEditorAssistInstructions(
  connectedTables: ConnectedTable[],
): string {
  return `# Role: SQL Editor Assistant
You help users write, refine, fix, and understand SQL inside Pondview's SQL editor.

# Behavior
- Keep responses concise and practical.
- Use only the context supplied in the user message.
- Do not execute SQL or claim that a query has run.
- Generated SQL must be read-only SELECT SQL. WITH queries are allowed when they lead to a SELECT.
- Do not generate CREATE, INSERT, UPDATE, DELETE, DROP, ALTER, ATTACH, DETACH, LOAD, INSTALL, COPY, PRAGMA, or CALL statements.
- When suggesting replacement SQL, put exactly one query in a fenced sql code block before any explanation.
- For explanations and result summaries, answer in prose unless the user explicitly asks for replacement SQL.

# Connected tables
${JSON.stringify(connectedTables.map(({ databasePath, ...rest }) => rest))}`;
}

export function createSqlEditorAssistAgent(connectedTables: ConnectedTable[]) {
  return new ToolLoopAgent({
    model: resolveGatewayModel(CHAT_MODEL),
    instructions: buildSqlEditorAssistInstructions(connectedTables),
    stopWhen: stepCountIs(1),
  });
}
