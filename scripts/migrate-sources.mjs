#!/usr/bin/env node
/**
 * One-shot migration script: replaces raw credentials in sources.yml with
 * connectionId references and stores the credentials in .env.local.
 *
 * Usage:  node scripts/migrate-sources.mjs
 *
 * Safe to run multiple times — idempotent.  Delete after migration.
 */

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";

const PROJECT_ROOT = process.cwd();
const ENV_FILE = join(PROJECT_ROOT, ".env.local");
const SOURCES_FILE = join(
  PROJECT_ROOT,
  "semantic-layer",
  "models",
  "sources.yml",
);
const CONNECTION_KEY_PREFIX = "CONNECTION_";

// ---------------------------------------------------------------------------
// Helpers (duplicated from src/lib/credentials.ts to avoid TS compilation)
// ---------------------------------------------------------------------------

function generateConnectionId() {
  return randomBytes(8).toString("hex");
}

function storeCredential(connectionId, credential) {
  const envKey = `${CONNECTION_KEY_PREFIX}${connectionId}`;
  const escaped = credential.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const newLine = `${envKey}="${escaped}"`;

  if (!existsSync(ENV_FILE)) {
    writeFileSync(ENV_FILE, `${newLine}\n`, "utf-8");
    return;
  }

  const content = readFileSync(ENV_FILE, "utf-8");
  const lines = content.split("\n");
  let replaced = false;

  const updatedLines = lines.map((line) => {
    if (line.trim().startsWith(`${envKey}=`)) {
      replaced = true;
      return newLine;
    }
    return line;
  });

  if (replaced) {
    writeFileSync(ENV_FILE, updatedLines.join("\n"), "utf-8");
  } else {
    const separator = content.endsWith("\n") ? "" : "\n";
    writeFileSync(ENV_FILE, `${content}${separator}${newLine}\n`, "utf-8");
  }
}

/** Derive a clean alias from the credential string. */
function deriveAlias(type, identifier) {
  if (type === "motherduck") {
    // "md:my_db?motherduck_token=..." -> "my_db"
    const match = identifier.match(/^md:([^?]+)/);
    return match ? match[1] : "motherduck";
  }
  if (type === "postgres") {
    // "host=... dbname=main" -> "main"
    const match = identifier.match(/dbname=(\S+)/);
    return match ? match[1] : "postgres";
  }
  if (type === "mysql") {
    const match = identifier.match(/database=(\S+)/i);
    return match ? match[1] : "mysql";
  }
  return identifier;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

if (!existsSync(SOURCES_FILE)) {
  console.log("No sources.yml found at", SOURCES_FILE, "— nothing to migrate.");
  process.exit(0);
}

const sourcesContent = readFileSync(SOURCES_FILE, "utf-8");
const sourcesYaml = yaml.load(sourcesContent);

if (!sourcesYaml?.sources?.length) {
  console.log("sources.yml has no sources — nothing to migrate.");
  process.exit(0);
}

// De-duplicate credentials: same identifier string -> same connectionId
const credentialToConnectionId = new Map();
let migratedCount = 0;
let skippedCount = 0;

for (const source of sourcesYaml.sources) {
  if (!source.connection) continue;

  // Already migrated?
  if (source.connection.connectionId && !source.connection.identifier) {
    skippedCount++;
    continue;
  }

  const rawIdentifier = source.connection.identifier;
  if (!rawIdentifier) {
    skippedCount++;
    continue;
  }

  let connectionId;
  if (credentialToConnectionId.has(rawIdentifier)) {
    connectionId = credentialToConnectionId.get(rawIdentifier);
  } else {
    connectionId = generateConnectionId();
    credentialToConnectionId.set(rawIdentifier, connectionId);
    storeCredential(connectionId, rawIdentifier);
    console.log(
      `  Stored credential for ${source.connection.type} -> CONNECTION_${connectionId}`,
    );
  }

  // Rewrite this source entry
  const cleanAlias = deriveAlias(source.connection.type, rawIdentifier);
  source.connection.connectionId = connectionId;
  source.connection.alias = cleanAlias;
  delete source.connection.identifier;

  migratedCount++;
}

// Write back
const newYaml = yaml.dump(sourcesYaml, {
  indent: 2,
  lineWidth: -1,
  noRefs: true,
  sortKeys: false,
});

writeFileSync(SOURCES_FILE, newYaml, "utf-8");

console.log(`\nMigration complete:`);
console.log(`  ${migratedCount} source(s) migrated`);
console.log(
  `  ${skippedCount} source(s) skipped (already migrated or no identifier)`,
);
console.log(
  `  ${credentialToConnectionId.size} unique credential(s) stored in .env.local`,
);
console.log(`\nPlease verify:`);
console.log(`  - ${SOURCES_FILE}`);
console.log(`  - ${ENV_FILE}`);
