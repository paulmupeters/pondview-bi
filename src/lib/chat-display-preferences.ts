import { useSyncExternalStore } from "react";

const SHOW_EXECUTE_SQL_RAW_OUTPUT_KEY = "bi.chat.execute-sql.show-raw-output";
const SHOW_EXECUTE_SQL_RAW_OUTPUT_EVENT =
  "bi:chat-execute-sql-raw-output-change";

function isBrowser(): boolean {
  return (
    typeof window !== "undefined" && typeof window.localStorage !== "undefined"
  );
}

function notifyPreferenceChange(): void {
  if (!isBrowser()) {
    return;
  }

  window.dispatchEvent(new Event(SHOW_EXECUTE_SQL_RAW_OUTPUT_EVENT));
}

export function getExecuteSqlRawOutputPreference(): boolean {
  if (!isBrowser()) {
    return false;
  }

  return (
    window.localStorage.getItem(SHOW_EXECUTE_SQL_RAW_OUTPUT_KEY) === "true"
  );
}

export function setExecuteSqlRawOutputPreference(value: boolean): void {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.setItem(
    SHOW_EXECUTE_SQL_RAW_OUTPUT_KEY,
    value ? "true" : "false",
  );
  notifyPreferenceChange();
}

export function subscribeExecuteSqlRawOutputPreference(
  listener: () => void,
): () => void {
  if (!isBrowser()) {
    return () => {};
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key !== SHOW_EXECUTE_SQL_RAW_OUTPUT_KEY) {
      return;
    }

    listener();
  };

  const onPreferenceChange = () => {
    listener();
  };

  window.addEventListener("storage", onStorage);
  window.addEventListener(
    SHOW_EXECUTE_SQL_RAW_OUTPUT_EVENT,
    onPreferenceChange,
  );

  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(
      SHOW_EXECUTE_SQL_RAW_OUTPUT_EVENT,
      onPreferenceChange,
    );
  };
}

export function useExecuteSqlRawOutputPreference(): boolean {
  return useSyncExternalStore(
    subscribeExecuteSqlRawOutputPreference,
    getExecuteSqlRawOutputPreference,
    () => false,
  );
}
