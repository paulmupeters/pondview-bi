const SQL_INTENT_PATTERN =
  /^\s*(select|with|insert|update|delete|create|alter|drop|explain)\b/i;

export function looksLikeSqlIntent(input: string): boolean {
  return SQL_INTENT_PATTERN.test(input);
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
      input.dismissedDraftSignature !== signature,
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
