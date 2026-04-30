import { afterEach, describe, expect, test } from "bun:test";
import {
  clearS3BackupConfigInStorage,
  EMPTY_S3_BACKUP_CONFIG,
  isS3BackupConfigComplete,
  readS3BackupConfigFromStorage,
  S3_BACKUP_ACCESS_KEY_ID_SESSION_STORAGE_KEY,
  S3_BACKUP_CONFIG_STORAGE_KEY,
  S3_BACKUP_SECRET_ACCESS_KEY_SESSION_STORAGE_KEY,
  saveS3BackupConfigToStorage,
} from "./s3-backup-storage";

type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

function createStorage(): StorageLike {
  const store = new Map<string, string>();

  return {
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
    removeItem(key: string) {
      store.delete(key);
    },
  };
}

function setBrowserStorage(
  localStorage: StorageLike,
  sessionStorage: StorageLike,
) {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    writable: true,
    value: {
      localStorage,
      sessionStorage,
    },
  });
}

const originalWindow = (globalThis as { window?: unknown }).window;

afterEach(() => {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    writable: true,
    value: originalWindow,
  });
});

describe("s3 backup storage", () => {
  test("stores bucket config persistently and credentials in session storage", () => {
    const localStorage = createStorage();
    const sessionStorage = createStorage();
    setBrowserStorage(localStorage, sessionStorage);

    saveS3BackupConfigToStorage({
      endpoint: " https://account.r2.cloudflarestorage.com/ ",
      region: "auto",
      bucket: "pondview-backups",
      accessKeyId: "access-session",
      secretAccessKey: "secret-session",
      prefix: "/pondview",
      forcePathStyle: true,
    });

    expect(
      sessionStorage.getItem(S3_BACKUP_ACCESS_KEY_ID_SESSION_STORAGE_KEY),
    ).toBe("access-session");
    expect(
      sessionStorage.getItem(S3_BACKUP_SECRET_ACCESS_KEY_SESSION_STORAGE_KEY),
    ).toBe("secret-session");
    expect(localStorage.getItem(S3_BACKUP_CONFIG_STORAGE_KEY)).not.toContain(
      "secret-session",
    );
    expect(readS3BackupConfigFromStorage()).toEqual({
      endpoint: "https://account.r2.cloudflarestorage.com",
      region: "auto",
      bucket: "pondview-backups",
      accessKeyId: "access-session",
      secretAccessKey: "secret-session",
      prefix: "pondview/",
      forcePathStyle: true,
    });

    const nextSessionStorage = createStorage();
    setBrowserStorage(localStorage, nextSessionStorage);
    expect(readS3BackupConfigFromStorage()).toEqual({
      endpoint: "https://account.r2.cloudflarestorage.com",
      region: "auto",
      bucket: "pondview-backups",
      accessKeyId: "",
      secretAccessKey: "",
      prefix: "pondview/",
      forcePathStyle: true,
    });
  });

  test("complete config requires session credentials", () => {
    expect(isS3BackupConfigComplete(EMPTY_S3_BACKUP_CONFIG)).toBe(false);
    expect(
      isS3BackupConfigComplete({
        endpoint: "https://account.r2.cloudflarestorage.com",
        region: "auto",
        bucket: "pondview-backups",
        accessKeyId: "",
        secretAccessKey: "",
        prefix: "pondview/",
        forcePathStyle: false,
      }),
    ).toBe(false);
    expect(
      isS3BackupConfigComplete({
        endpoint: "https://account.r2.cloudflarestorage.com",
        region: "auto",
        bucket: "pondview-backups",
        accessKeyId: "access-session",
        secretAccessKey: "secret-session",
        prefix: "pondview/",
        forcePathStyle: false,
      }),
    ).toBe(true);
  });

  test("clears bucket config and session credentials", () => {
    const localStorage = createStorage();
    const sessionStorage = createStorage();
    setBrowserStorage(localStorage, sessionStorage);
    saveS3BackupConfigToStorage({
      endpoint: "https://account.r2.cloudflarestorage.com",
      region: "auto",
      bucket: "pondview-backups",
      accessKeyId: "access-session",
      secretAccessKey: "secret-session",
      prefix: "pondview/",
      forcePathStyle: false,
    });

    clearS3BackupConfigInStorage();

    expect(localStorage.getItem(S3_BACKUP_CONFIG_STORAGE_KEY)).toBe(null);
    expect(
      sessionStorage.getItem(S3_BACKUP_ACCESS_KEY_ID_SESSION_STORAGE_KEY),
    ).toBe(null);
    expect(
      sessionStorage.getItem(S3_BACKUP_SECRET_ACCESS_KEY_SESSION_STORAGE_KEY),
    ).toBe(null);
  });
});
