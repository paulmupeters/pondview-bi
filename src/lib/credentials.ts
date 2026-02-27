/**
 * Server-side credential management.
 *
 * Credentials are stored in `.env.local` keyed by a random connection ID.
 * Each credential is written as `CONNECTION_<id>=<value>`.
 *
 * We parse the file at runtime (rather than relying on `process.env`) because
 * Next.js only loads `.env.local` at startup, so connections added after boot
 * would not be visible through `process.env`.
 */

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ENV_FILE_NAME = ".env.local";
const CONNECTION_KEY_PREFIX = "CONNECTION_";

/** Generate a unique connection ID (16 hex characters). */
export function generateConnectionId(): string {
  return randomBytes(8).toString("hex");
}

/** Derive the `.env.local` key for a given connection ID. */
function envKeyFor(connectionId: string): string {
  return `${CONNECTION_KEY_PREFIX}${connectionId}`;
}

/** Return the absolute path to `.env.local` in the project root. */
function envFilePath(): string {
  return join(process.cwd(), ENV_FILE_NAME);
}

// ---------------------------------------------------------------------------
// Lightweight .env parser
// ---------------------------------------------------------------------------

interface EnvEntry {
  key: string;
  value: string;
  /** The raw line (for reconstruction). */
  raw: string;
}

/**
 * Parse a `.env`-style file into an ordered list of entries.
 * Handles comments, blank lines, and optional quoting of values.
 */
function parseEnvFile(content: string): {
  entries: EnvEntry[];
  lines: string[];
} {
  const lines = content.split("\n");
  const entries: EnvEntry[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const equalSignIndex = trimmed.indexOf("=");
    if (equalSignIndex === -1) continue;

    const key = trimmed.slice(0, equalSignIndex).trim();
    let value = trimmed.slice(equalSignIndex + 1);

    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    entries.push({ key, value, raw: line });
  }

  return { entries, lines };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Persist a credential string in `.env.local` under `CONNECTION_<id>`.
 *
 * If an entry for the given ID already exists it is updated in-place.
 * Otherwise a new line is appended.
 */
export function storeCredential(
  connectionId: string,
  credential: string,
): void {
  const filePath = envFilePath();
  const envKey = envKeyFor(connectionId);

  // Wrap value in double quotes to handle special characters safely
  const newLine = `${envKey}="${credential.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

  if (!existsSync(filePath)) {
    writeFileSync(filePath, `${newLine}\n`, "utf-8");
    return;
  }

  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  let replaced = false;

  const updatedLines = lines.map((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith(`${envKey}=`)) {
      replaced = true;
      return newLine;
    }
    return line;
  });

  if (replaced) {
    writeFileSync(filePath, updatedLines.join("\n"), "utf-8");
  } else {
    // Ensure file ends with a newline before appending
    const separator = content.endsWith("\n") ? "" : "\n";
    writeFileSync(filePath, `${content}${separator}${newLine}\n`, "utf-8");
  }
}

/**
 * Read the credential for a given connection ID.
 *
 * Checks `process.env` first (for values loaded at startup), then falls
 * back to parsing `.env.local` on disk for connections added at runtime.
 *
 * Returns `null` if no credential is found.
 */
export function resolveCredential(connectionId: string): string | null {
  const envKey = envKeyFor(connectionId);

  // Fast path: already in process.env (loaded at Next.js startup)
  const fromEnv = process.env[envKey];
  if (fromEnv !== undefined) return fromEnv;

  // Slow path: parse the file for runtime-added connections
  const filePath = envFilePath();
  if (!existsSync(filePath)) return null;

  try {
    const content = readFileSync(filePath, "utf-8");
    const { entries } = parseEnvFile(content);
    const match = entries.find((entry) => entry.key === envKey);
    return match?.value ?? null;
  } catch {
    return null;
  }
}

/**
 * Remove the credential for a given connection ID from `.env.local`.
 */
export function removeCredential(connectionId: string): void {
  const filePath = envFilePath();
  if (!existsSync(filePath)) return;

  const envKey = envKeyFor(connectionId);
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  const filteredLines = lines.filter((line) => {
    const trimmed = line.trim();
    return !trimmed.startsWith(`${envKey}=`);
  });

  writeFileSync(filePath, filteredLines.join("\n"), "utf-8");
}

/**
 * List all stored connection IDs (without their credential values).
 */
export function listConnectionIds(): string[] {
  const filePath = envFilePath();
  if (!existsSync(filePath)) return [];

  try {
    const content = readFileSync(filePath, "utf-8");
    const { entries } = parseEnvFile(content);
    return entries
      .filter((entry) => entry.key.startsWith(CONNECTION_KEY_PREFIX))
      .map((entry) => entry.key.slice(CONNECTION_KEY_PREFIX.length));
  } catch {
    return [];
  }
}
