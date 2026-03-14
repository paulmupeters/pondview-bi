import { useSyncExternalStore } from "react";

const SHOW_TOOL_CALLS_KEY = "bi.chat.tool-calls.show";
const SHOW_TOOL_CALLS_EVENT = "bi:chat-tool-calls-change";
const SHOW_EXECUTE_SQL_RAW_OUTPUT_KEY = "bi.chat.execute-sql.show-raw-output";
const SHOW_EXECUTE_SQL_RAW_OUTPUT_EVENT =
  "bi:chat-execute-sql-raw-output-change";

function isBrowser(): boolean {
  return (
    typeof window !== "undefined" && typeof window.localStorage !== "undefined"
  );
}

function notifyPreferenceChange(eventName: string): void {
  if (!isBrowser()) {
    return;
  }

  window.dispatchEvent(new Event(eventName));
}

function getBooleanPreference(key: string, defaultValue: boolean): boolean {
  if (!isBrowser()) {
    return defaultValue;
  }

  const value = window.localStorage.getItem(key);
  if (value === null) {
    return defaultValue;
  }

  return value === "true";
}

function setBooleanPreference(key: string, value: boolean, eventName: string): void {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.setItem(key, value ? "true" : "false");
  notifyPreferenceChange(eventName);
}

function subscribeBooleanPreference(
  key: string,
  eventName: string,
  listener: () => void,
): () => void {
  if (!isBrowser()) {
    return () => {};
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key !== key) {
      return;
    }

    listener();
  };

  const onPreferenceChange = () => {
    listener();
  };

  window.addEventListener("storage", onStorage);
  window.addEventListener(eventName, onPreferenceChange);

  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(eventName, onPreferenceChange);
  };
}

export function getShowToolCallsPreference(): boolean {
  return getBooleanPreference(SHOW_TOOL_CALLS_KEY, true);
}

export function setShowToolCallsPreference(value: boolean): void {
  setBooleanPreference(SHOW_TOOL_CALLS_KEY, value, SHOW_TOOL_CALLS_EVENT);
}

export function subscribeShowToolCallsPreference(
  listener: () => void,
): () => void {
  return subscribeBooleanPreference(
    SHOW_TOOL_CALLS_KEY,
    SHOW_TOOL_CALLS_EVENT,
    listener,
  );
}

export function useShowToolCallsPreference(): boolean {
  return useSyncExternalStore(
    subscribeShowToolCallsPreference,
    getShowToolCallsPreference,
    () => true,
  );
}

export function getExecuteSqlRawOutputPreference(): boolean {
  return getBooleanPreference(SHOW_EXECUTE_SQL_RAW_OUTPUT_KEY, false);
}

export function setExecuteSqlRawOutputPreference(value: boolean): void {
  setBooleanPreference(
    SHOW_EXECUTE_SQL_RAW_OUTPUT_KEY,
    value,
    SHOW_EXECUTE_SQL_RAW_OUTPUT_EVENT,
  );
}

export function subscribeExecuteSqlRawOutputPreference(
  listener: () => void,
): () => void {
  return subscribeBooleanPreference(
    SHOW_EXECUTE_SQL_RAW_OUTPUT_KEY,
    SHOW_EXECUTE_SQL_RAW_OUTPUT_EVENT,
    listener,
  );
}

export function useExecuteSqlRawOutputPreference(): boolean {
  return useSyncExternalStore(
    subscribeExecuteSqlRawOutputPreference,
    getExecuteSqlRawOutputPreference,
    () => false,
  );
}
