export const DASHBOARD_MODE_QUERY_PARAM = "pondviewMode";
export const DASHBOARD_MODE_QUERY_VALUE = "dashboard";
export const DASHBOARD_PREVIEW_QUERY_VALUE = "dashboard-preview";
export const DASHBOARD_MODE_SESSION_KEY = "pondview:dashboard-mode";

type DashboardModeStorage = Pick<Storage, "getItem" | "setItem">;

export type DashboardModeState = {
  enabled: boolean;
  locked: boolean;
  preview: boolean;
};

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

export function searchEnablesDashboardPreview(search: string): boolean {
  return (
    new URLSearchParams(search).get(DASHBOARD_MODE_QUERY_PARAM) ===
    DASHBOARD_PREVIEW_QUERY_VALUE
  );
}

export function resolveDashboardModeState(
  search: string,
  storage: DashboardModeStorage | null = typeof window !== "undefined"
    ? window.sessionStorage
    : null,
): DashboardModeState {
  const enabledBySearch = searchEnablesDashboardMode(search);
  if (enabledBySearch) {
    persistStorageValue(storage, true);
    return { enabled: true, locked: true, preview: false };
  }

  const locked = readStorageValue(storage);
  if (locked) {
    return { enabled: true, locked: true, preview: false };
  }

  const preview = searchEnablesDashboardPreview(search);
  return { enabled: preview, locked: false, preview };
}

export function resolveDashboardMode(
  search: string,
  storage: DashboardModeStorage | null = typeof window !== "undefined"
    ? window.sessionStorage
    : null,
): boolean {
  return resolveDashboardModeState(search, storage).enabled;
}
