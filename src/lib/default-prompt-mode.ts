import { useSyncExternalStore } from "react";

export type DefaultPromptMode = "ai" | "manual";

const DEFAULT_PROMPT_MODE_KEY = "bi.prompt-mode.default";
const DEFAULT_PROMPT_MODE_EVENT = "bi:default-prompt-mode-change";

function isBrowser(): boolean {
  return (
    typeof window !== "undefined" && typeof window.localStorage !== "undefined"
  );
}

function isPromptMode(value: string | null): value is DefaultPromptMode {
  return value === "ai" || value === "manual";
}

function notifyPreferenceChange(): void {
  if (!isBrowser()) {
    return;
  }

  window.dispatchEvent(new Event(DEFAULT_PROMPT_MODE_EVENT));
}

export function getDefaultPromptModePreference(): DefaultPromptMode {
  if (!isBrowser()) {
    return "ai";
  }

  const value = window.localStorage.getItem(DEFAULT_PROMPT_MODE_KEY);
  return isPromptMode(value) ? value : "ai";
}

export function setDefaultPromptModePreference(value: DefaultPromptMode): void {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.setItem(DEFAULT_PROMPT_MODE_KEY, value);
  notifyPreferenceChange();
}

export function subscribeDefaultPromptModePreference(
  listener: () => void,
): () => void {
  if (!isBrowser()) {
    return () => {};
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key !== DEFAULT_PROMPT_MODE_KEY) {
      return;
    }

    listener();
  };

  window.addEventListener("storage", onStorage);
  window.addEventListener(DEFAULT_PROMPT_MODE_EVENT, listener);

  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(DEFAULT_PROMPT_MODE_EVENT, listener);
  };
}

export function useDefaultPromptModePreference(): DefaultPromptMode {
  return useSyncExternalStore(
    subscribeDefaultPromptModePreference,
    getDefaultPromptModePreference,
    () => "ai",
  );
}

export function resolvePromptModePreference(
  modeParam: string | null | undefined,
  fallback: DefaultPromptMode = "ai",
): DefaultPromptMode {
  if (modeParam === "manual") {
    return "manual";
  }

  if (modeParam === "ai") {
    return "ai";
  }

  return fallback;
}
