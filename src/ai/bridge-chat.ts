import { type ChatTransport, DefaultChatTransport, type UIMessage } from "ai";
import {
  getBridgeAuthHeaders,
  getBridgeRequestBaseUrl,
  getBridgeSecretsStatus,
  getBridgeSession,
} from "@/lib/bridge/pondview-bridge";
import type { ConnectedTable } from "@/lib/connected-tables";

export type BridgeAiMode = "analysis" | "sql-editor";

function shouldDebugBridgeAi(): boolean {
  return (
    typeof window !== "undefined" &&
    window.localStorage.getItem("pondview.debug.bridgeAi") === "1"
  );
}

function debugBridgeAi(message: string, details?: Record<string, unknown>) {
  if (!shouldDebugBridgeAi()) {
    return;
  }

  console.info("[pondview:bridge-ai]", message, details ?? {});
}

export async function canUseBridgeAi(): Promise<boolean> {
  try {
    const [session, status] = await Promise.all([
      getBridgeSession(),
      getBridgeSecretsStatus(),
    ]);
    const available = session.isQueryReady && status.ai?.configured === true;
    debugBridgeAi("availability checked", {
      available,
      isQueryReady: session.isQueryReady,
      requiresAuth: session.requiresAuth,
      hasSecret: session.hasSecret,
      aiConfigured: status.ai?.configured === true,
      provider: status.ai?.provider,
      model: status.ai?.model,
    });
    return available;
  } catch {
    debugBridgeAi("availability check failed");
    return false;
  }
}

export function createBridgeChatTransport(
  connectedTables: ConnectedTable[],
  mode: BridgeAiMode,
): ChatTransport<UIMessage> {
  const api = `${getBridgeRequestBaseUrl()}/ai/chat`;
  debugBridgeAi("creating bridge chat transport", { api, mode });

  return new DefaultChatTransport<UIMessage>({
    api,
    credentials: "same-origin",
    headers: getBridgeAuthHeaders(),
    body: {
      connectedTables: connectedTables.map(({ databasePath, ...rest }) => rest),
      mode,
    },
  }) as ChatTransport<UIMessage>;
}
