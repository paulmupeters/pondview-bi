import { useEffect, useState } from "react";
import { resolvePromptModePreference } from "@/lib/default-prompt-mode";
import type { ReadonlyURLSearchParams } from "@/vite/next-navigation";

const AUTO_SENT_FLAG_PREFIX = "autoSent:";
const AUTO_SENT_STALE_MS = 5 * 60 * 1000;
const AUTO_SENT_CLEANUP_DELAY_MS = 3_000;

type PromptMode = "ai" | "manual";

type UseChatUrlParamsArgs = {
  chatId: string;
  searchParams: ReadonlyURLSearchParams | null;
  sendMessage: (message: { text: string }) => void;
  router: { replace: (href: string) => void };
  normalizedPath?: string;
  handleAddVisual: () => void | Promise<void>;
  setPromptMode: (mode: PromptMode) => void;
  loadManualSql?: (payload: { sql: string; autorun: boolean }) => void;
};

export function useChatUrlParams({
  chatId,
  searchParams,
  sendMessage,
  router,
  normalizedPath = "/chat",
  handleAddVisual,
  setPromptMode,
  loadManualSql,
}: UseChatUrlParamsArgs) {
  const [autoSentFromQuery, setAutoSentFromQuery] = useState(false);
  const [manualVisualHandled, setManualVisualHandled] = useState(false);

  // Cleanup any stale auto-send markers that may be leftover from previous sessions.
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const now = Date.now();
    const keysToRemove: string[] = [];

    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key?.startsWith(AUTO_SENT_FLAG_PREFIX)) {
        continue;
      }

      const rawValue = window.localStorage.getItem(key);
      if (!rawValue) {
        keysToRemove.push(key);
        continue;
      }

      try {
        const parsed = JSON.parse(rawValue) as { timestamp?: number };
        if (
          typeof parsed.timestamp !== "number" ||
          now - parsed.timestamp > AUTO_SENT_STALE_MS
        ) {
          keysToRemove.push(key);
        }
      } catch {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => {
      window.localStorage.removeItem(key);
    });
  }, []);

  // Auto-send initial message from ?q= when opening a fresh chat URL.
  useEffect(() => {
    const q = searchParams?.get("q") || "";
    if (q.trim().length > 0 && !autoSentFromQuery) {
      if (typeof window === "undefined") {
        return;
      }
      const sanitizedQuery = q.trim();
      const flagKey = `${AUTO_SENT_FLAG_PREFIX}${chatId}`;
      const rawFlagValue = window.localStorage.getItem(flagKey);

      if (rawFlagValue) {
        const now = Date.now();
        let shouldSkipAutoSend = false;

        try {
          const parsed = JSON.parse(rawFlagValue) as { timestamp?: number };
          if (
            typeof parsed.timestamp === "number" &&
            now - parsed.timestamp <= AUTO_SENT_STALE_MS
          ) {
            shouldSkipAutoSend = true;
          } else {
            window.localStorage.removeItem(flagKey);
          }
        } catch {
          window.localStorage.removeItem(flagKey);
        }

        if (shouldSkipAutoSend) {
          setAutoSentFromQuery(true);
          return;
        }
      }

      // Drop the query param to avoid duplicate sends on remounts.
      router.replace(`${normalizedPath}?id=${encodeURIComponent(chatId)}`);
      window.localStorage.setItem(
        flagKey,
        JSON.stringify({ timestamp: Date.now() }),
      );
      setAutoSentFromQuery(true);
      sendMessage({ text: sanitizedQuery });
    }
  }, [
    autoSentFromQuery,
    chatId,
    normalizedPath,
    router,
    searchParams,
    sendMessage,
  ]);

  useEffect(() => {
    const manual = searchParams?.get("manual");
    if (manual === "1" && !manualVisualHandled) {
      void handleAddVisual();
      setManualVisualHandled(true);
      router.replace(`${normalizedPath}?id=${encodeURIComponent(chatId)}`);
    }
  }, [
    chatId,
    handleAddVisual,
    manualVisualHandled,
    normalizedPath,
    router,
    searchParams,
  ]);

  useEffect(() => {
    const modeParam = searchParams?.get("mode");
    const sqlParam = searchParams?.get("sql");
    const shouldAutorun = searchParams?.get("autorun") === "1";
    const hasExplicitMode = modeParam === "manual" || modeParam === "ai";

    if (!hasExplicitMode && !sqlParam?.trim()) {
      return;
    }

    if (sqlParam?.trim()) {
      setPromptMode("manual");
      loadManualSql?.({ sql: sqlParam, autorun: shouldAutorun });
      router.replace(`${normalizedPath}?id=${encodeURIComponent(chatId)}`);
      return;
    }

    const resolvedMode = resolvePromptModePreference(modeParam);
    if (hasExplicitMode) {
      setPromptMode(resolvedMode);
      router.replace(`${normalizedPath}?id=${encodeURIComponent(chatId)}`);
    }
  }, [
    chatId,
    loadManualSql,
    normalizedPath,
    router,
    searchParams,
    setPromptMode,
  ]);

  // Remove the auto-send marker after it served its purpose to avoid storage build-up.
  useEffect(() => {
    if (!autoSentFromQuery || typeof window === "undefined") {
      return;
    }

    const flagKey = `${AUTO_SENT_FLAG_PREFIX}${chatId}`;
    const timeoutId = window.setTimeout(() => {
      try {
        window.localStorage.removeItem(flagKey);
      } catch {
        // no-op
      }
    }, AUTO_SENT_CLEANUP_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [autoSentFromQuery, chatId]);
}
