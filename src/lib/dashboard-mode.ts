export const DASHBOARD_MODE_QUERY_PARAM = "pondviewMode";
export const DASHBOARD_MODE_QUERY_VALUE = "dashboard";
export const DASHBOARD_MODE_SESSION_KEY = "pondview:dashboard-mode";

type DashboardModeStorage = Pick<Storage, "getItem" | "setItem">;

function readStorageValue(storage: DashboardModeStorage | null): boolean {
  if (!storage) {
    return false;
  }

  try {
    return storage.getItem(DASHBOARD_MODE_SESSION_KEY) === "true";
  } catch {
    return false;
  }
}

function persistStorageValue(
  storage: DashboardModeStorage | null,
  enabled: boolean,
): void {
  if (!storage) {
    return;
  }

  try {
    storage.setItem(DASHBOARD_MODE_SESSION_KEY, enabled ? "true" : "false");
  } catch {
    // Session storage may be unavailable in private or locked-down contexts.
  }
}

export function searchEnablesDashboardMode(search: string): boolean {
  return (
    new URLSearchParams(search).get(DASHBOARD_MODE_QUERY_PARAM) ===
    DASHBOARD_MODE_QUERY_VALUE
  );
}

export function resolveDashboardMode(
  search: string,
  storage: DashboardModeStorage | null = typeof window !== "undefined"
    ? window.sessionStorage
    : null,
): boolean {
  const enabledBySearch = searchEnablesDashboardMode(search);
  if (enabledBySearch) {
    persistStorageValue(storage, true);
    return true;
  }

  return readStorageValue(storage);
}
