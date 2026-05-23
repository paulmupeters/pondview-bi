import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BridgeSecretStore } from "./secrets";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("BridgeSecretStore", () => {
  test("returns empty defaults when the file does not exist", () => {
    const store = new BridgeSecretStore(join(createTempDir(), "secrets.json"));

    expect(store.read()).toEqual({ version: 1, sources: {} });
    expect(store.status()).toMatchObject({
      sources: [],
      ai: { configured: false },
      s3Backup: { configured: false },
    });
  });

  test("stores secrets with redacted status and strict permissions", () => {
    const dir = createTempDir();
    const path = join(dir, "pondview", "secrets.json");
    const store = new BridgeSecretStore(path);

    store.saveSource("pg:warehouse", {
      type: "postgres",
      identifier: "host=db.example.test password=secret dbname=main",
      alias: "warehouse",
      readonly: true,
      duckdbExtension: "postgres",
    });
    store.saveAi({
      provider: "openai",
      model: "gpt-test",
      apiKey: "sk-secret",
    });

    expect(store.getSource("pg:warehouse")?.identifier).toContain(
      "password=secret",
    );
    expect(JSON.stringify(store.status())).not.toContain("password=secret");
    expect(JSON.stringify(store.status())).not.toContain("sk-secret");
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(statSync(join(dir, "pondview")).mode & 0o777).toBe(0o700);
  });
});

function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "pondview-secrets-"));
  tempDirs.push(dir);
  return dir;
}
