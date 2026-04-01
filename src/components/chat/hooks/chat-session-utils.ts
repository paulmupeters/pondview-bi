import type { UIMessage } from "@ai-sdk/react";
import { getSelectedAiProviderDisplayName } from "@/ai/gateway-model";
import type { DbMessageRow } from "@/lib/workspace/chat-repo";

const SUPPORTED_TOOL_NAMES = new Set([
  "execute_exploratory_sql",
  "execute_final_sql",
  "execute_sql",
  "get_table_schema",
  "list_tables",
  "run_preview",
  "read_skills_md",
]);

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function sanitizeUiMessageParts(parts: UIMessage["parts"]): UIMessage["parts"] {
  return parts.filter((part) => {
    if (!part.type.startsWith("tool-")) {
      return true;
    }

    const toolName = part.type.slice("tool-".length);
    return SUPPORTED_TOOL_NAMES.has(toolName);
  });
}

export function parsePartsOrFallback(
  partsJson: string | null | undefined,
  content: string,
): UIMessage["parts"] {
  const parsed = partsJson ? safeJsonParse(partsJson) : undefined;

  if (Array.isArray(parsed) && parsed.length > 0) {
    return sanitizeUiMessageParts(parsed as UIMessage["parts"]);
  }

  if (parsed && typeof parsed === "object") {
    const maybeParts = (parsed as { parts?: unknown }).parts;
    if (Array.isArray(maybeParts) && maybeParts.length > 0) {
      return sanitizeUiMessageParts(maybeParts as UIMessage["parts"]);
    }
  }

  return [{ type: "text", text: content }] as UIMessage["parts"];
}

export function toUiMessages(rows: DbMessageRow[]): UIMessage[] {
  return rows.map((row) => ({
    id: row.id,
    role: row.role as UIMessage["role"],
    parts: parsePartsOrFallback(row.parts, row.content),
  }));
}

export function deriveTitleFromInput(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  return trimmed.length > 20 ? `${trimmed.slice(0, 20)}...` : trimmed;
}

export function toPromptErrorMessage(error: Error): string {
  const message = error.message?.trim() || "Unknown AI chat error.";
  const normalized = message.toLowerCase();
  const providerName = getSelectedAiProviderDisplayName();

  if (normalized.includes("missing ")) {
    return "Missing AI configuration. Open Settings and configure provider, API key, and model.";
  }

  if (
    normalized.includes("header ‘user-agent’ is not allowed") ||
    normalized.includes("header 'user-agent' is not allowed") ||
    (normalized.includes("cors") && normalized.includes("user-agent"))
  ) {
    return "Browser request blocked by CORS (user-agent header). Refresh and retry; if it persists, update to the latest app build.";
  }

  if (
    normalized.includes("networkerror when attempting to fetch resource") ||
    normalized.includes("failed to fetch") ||
    normalized.includes("load failed") ||
    normalized.includes("network request failed")
  ) {
    return `Cannot reach ${providerName} from browser. Check network, ad blocker/proxy, and provider settings.`;
  }

  if (normalized.includes("authentication")) {
    return `${providerName} authentication failed. Verify provider API settings in Settings.`;
  }

  if (normalized.includes("gateway request failed")) {
    return `${providerName} request failed. Check network access and provider settings.`;
  }

  return message;
}
