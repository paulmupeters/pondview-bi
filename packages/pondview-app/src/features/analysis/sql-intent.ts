const SQL_INTENT_PATTERNS = [
  /^\s*select\b[\s\S]*(\bfrom\b|\bwhere\b|\blimit\b|\bunion\b|\border\s+by\b|\bgroup\s+by\b)/i,
  /^\s*select\s+(\*|\d+|'[^']*'|"[^"]*"|true|false|null)\b/i,
  /^\s*with\b[\s\S]+\bas\s*\([\s\S]+\)\s*select\b/i,
  /^\s*insert\s+into\s+\S+/i,
  /^\s*update\s+\S+\s+set\b/i,
  /^\s*delete\s+from\s+\S+/i,
  /^\s*create\s+(or\s+replace\s+)?(table|view|schema|database|index|macro|sequence|function|type|temp(?:orary)?\s+(table|view))\b/i,
  /^\s*alter\s+(table|view|schema|database|index|sequence|type)\s+\S+/i,
  /^\s*drop\s+(table|view|schema|database|index|macro|sequence|function|type)\b/i,
  /^\s*explain\s+(analyze\s+)?(select|with|insert|update|delete|create|alter|drop)\b/i,
];

export function looksLikeSqlIntent(input: string): boolean {
  return SQL_INTENT_PATTERNS.some((pattern) => pattern.test(input));
}

export function getSqlIntentDraftSignature(input: string): string | null {
  const trimmedInput = input.trim();
  if (!trimmedInput || !looksLikeSqlIntent(input)) {
    return null;
  }

  return trimmedInput;
}

export function shouldShowSqlIntentPopover(input: {
  promptDraft: string;
  isChatMode: boolean;
  isAssistantThinking: boolean;
  dismissedDraftSignature: string | null;
}): boolean {
  const signature = getSqlIntentDraftSignature(input.promptDraft);
  return Boolean(
    input.isChatMode &&
      !input.isAssistantThinking &&
      signature &&
      !input.dismissedDraftSignature,
  );
}

export function createSqlIntentSwitchPatch(promptDraft: string): {
  promptText: "";
  sqlDraft: string;
} | null {
  if (!promptDraft.trim()) {
    return null;
  }

  return {
    promptText: "",
    sqlDraft: promptDraft,
  };
}
