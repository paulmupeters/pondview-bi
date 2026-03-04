import { stepCountIs, ToolLoopAgent } from "ai";
import { resolveGatewayModel } from "@/ai/gateway-model";
import { CHAT_MODEL } from "@/ai/models";
import { analysisPrompt } from "@/ai/prompts";
import { tools } from "@/ai/tools";
import type { ConnectedTable } from "@/lib/connected-tables";

function buildInstructions(connectedTables: ConnectedTable[]): string {
  return analysisPrompt.replace(
    "{connectedTables}",
    JSON.stringify(connectedTables.map(({ databasePath, ...rest }) => rest)),
  );
}

export function createPondviewAgent(connectedTables: ConnectedTable[]) {
  return new ToolLoopAgent({
    model: resolveGatewayModel(CHAT_MODEL),
    instructions: buildInstructions(connectedTables),
    tools,
    stopWhen: stepCountIs(5),
  });
}
