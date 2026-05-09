import { type ChatTransport, DefaultChatTransport, type UIMessage } from "ai";
import {
  getBridgeAuthHeaders,
  getBridgeEndpoint,
  getBridgeSecretsStatus,
  getBridgeSession,
} from "@/lib/bridge/pondview-bridge";
import type { ConnectedTable } from "@/lib/connected-tables";

export type BridgeAiMode = "analysis" | "sql-editor";

export async function canUseBridgeAi(): Promise<boolean> {
  try {
    const [session, status] = await Promise.all([
      getBridgeSession(),
      getBridgeSecretsStatus(),
    ]);
    return session.isQueryReady && status.ai?.configured === true;
  } catch {
    return false;
  }
}

export function createBridgeChatTransport(
  connectedTables: ConnectedTable[],
  mode: BridgeAiMode,
): ChatTransport<UIMessage> {
  return new DefaultChatTransport<UIMessage>({
    api: `${getBridgeEndpoint() || ""}/ai/chat`,
    credentials: "same-origin",
    headers: getBridgeAuthHeaders(),
    body: {
      connectedTables: connectedTables.map(({ databasePath, ...rest }) => rest),
      mode,
    },
  }) as ChatTransport<UIMessage>;
}
