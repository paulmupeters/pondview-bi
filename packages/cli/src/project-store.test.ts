import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BridgeProjectStore } from "./project-store";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("BridgeProjectStore", () => {
  test("uses the package-manager launch directory before process cwd", () => {
    const projectDir = createTempDir();
    const previousInitCwd = process.env.INIT_CWD;
    const previousPwd = process.env.PWD;

    delete process.env.INIT_CWD;
    process.env.PWD = projectDir;

    try {
      const store = new BridgeProjectStore();
      expect(store.rootPath).toBe(projectDir);
    } finally {
      restoreEnv("INIT_CWD", previousInitCwd);
      restoreEnv("PWD", previousPwd);
    }
  });

  test("prefers an explicit project dir", () => {
    const projectDir = createTempDir();
    const pwdDir = createTempDir();
    const previousPwd = process.env.PWD;

    process.env.PWD = pwdDir;

    try {
      const store = new BridgeProjectStore({ rootPath: projectDir });
      expect(store.rootPath).toBe(projectDir);
    } finally {
      restoreEnv("PWD", previousPwd);
    }
  });
});

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "pondview-project-store-"));
  tempDirs.push(dir);
  return dir;
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
