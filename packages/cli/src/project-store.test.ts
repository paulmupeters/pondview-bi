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
  test("uses Bun's preserved launch directory before rewritten cwd values", () => {
    const projectDir = createTempDir();
    const initCwd = createTempDir();
    const pwdDir = createTempDir();
    const previousInitCwd = process.env.INIT_CWD;
    const previousLocalPrefix = process.env.npm_config_local_prefix;
    const previousPwd = process.env.PWD;

    process.env.INIT_CWD = initCwd;
    process.env.npm_config_local_prefix = projectDir;
    process.env.PWD = pwdDir;

    try {
      const store = new BridgeProjectStore();
      expect(store.rootPath).toBe(projectDir);
    } finally {
      restoreEnv("INIT_CWD", previousInitCwd);
      restoreEnv("npm_config_local_prefix", previousLocalPrefix);
      restoreEnv("PWD", previousPwd);
    }
  });

  test("falls back to the shell launch directory", () => {
    const projectDir = createTempDir();
    const previousInitCwd = process.env.INIT_CWD;
    const previousLocalPrefix = process.env.npm_config_local_prefix;
    const previousPwd = process.env.PWD;

    delete process.env.INIT_CWD;
    delete process.env.npm_config_local_prefix;
    process.env.PWD = projectDir;

    try {
      const store = new BridgeProjectStore();
      expect(store.rootPath).toBe(projectDir);
    } finally {
      restoreEnv("INIT_CWD", previousInitCwd);
      restoreEnv("npm_config_local_prefix", previousLocalPrefix);
      restoreEnv("PWD", previousPwd);
    }
  });

  test("resolves a relative explicit project dir from the preserved launch directory", () => {
    const launchDir = createTempDir();
    const previousInitCwd = process.env.INIT_CWD;
    const previousLocalPrefix = process.env.npm_config_local_prefix;
    const previousPwd = process.env.PWD;

    process.env.INIT_CWD = createTempDir();
    process.env.npm_config_local_prefix = launchDir;
    process.env.PWD = createTempDir();

    try {
      const store = new BridgeProjectStore({ rootPath: "./example" });
      expect(store.rootPath).toBe(join(launchDir, "example"));
    } finally {
      restoreEnv("INIT_CWD", previousInitCwd);
      restoreEnv("npm_config_local_prefix", previousLocalPrefix);
      restoreEnv("PWD", previousPwd);
    }
  });

  test("prefers an absolute explicit project dir", () => {
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
