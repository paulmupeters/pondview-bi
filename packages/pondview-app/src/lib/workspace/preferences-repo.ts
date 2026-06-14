import {
  clearStore,
  getAllFromStore,
  getByKey,
  putOne,
  STORE_PREFERENCES,
  type WorkspacePreference,
} from "@/lib/workspace/workspace-db";

export async function setPreference<T>(key: string, value: T): Promise<void> {
  const now = Date.now();
  await putOne(STORE_PREFERENCES, {
    key,
    valueJson: JSON.stringify(value),
    updatedAt: now,
  } satisfies WorkspacePreference);
}

export async function getPreference<T>(key: string): Promise<T | undefined> {
  const row = await getByKey<WorkspacePreference>(STORE_PREFERENCES, key);
  if (!row) {
    return undefined;
  }

  try {
    return JSON.parse(row.valueJson) as T;
  } catch {
    return undefined;
  }
}

export async function removeAllPreferences(): Promise<void> {
  await clearStore(STORE_PREFERENCES);
}

export async function listPreferences(): Promise<WorkspacePreference[]> {
  return getAllFromStore<WorkspacePreference>(STORE_PREFERENCES);
}
