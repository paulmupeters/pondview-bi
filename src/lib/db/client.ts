import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema";
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';

let cachedDb: BunSQLiteDatabase<typeof schema> | undefined;

export function getDb(): BunSQLiteDatabase<typeof schema> {
  if (cachedDb) return cachedDb as BunSQLiteDatabase<typeof schema>;

  // Only import bun:sqlite at runtime under Bun; avoid during Next build
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Database } = require("bun:sqlite");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { drizzle } = require("drizzle-orm/bun-sqlite");

  const filePath = process.env.DATABASE_PATH || "./sqlite.db";
  const sqlite = new Database(filePath);

  

  // Ensure foreign key constraints are enforced (for ON DELETE CASCADE)
  sqlite.run(`PRAGMA foreign_keys = ON;`);

  // Lightweight bootstrap to ensure tables exist in dev environments
  sqlite.run(`
CREATE TABLE IF NOT EXISTS chats (
  id TEXT PRIMARY KEY,
  title TEXT,
  user_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  parts TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS dashboards (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS dashboard_charts (
  id TEXT PRIMARY KEY,
  dashboard_id TEXT NOT NULL,
  title TEXT,
  description TEXT,
  sql TEXT NOT NULL,
  db_identifier TEXT,
  chart_config_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (dashboard_id) REFERENCES dashboards(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS messages_chat_idx ON messages(chat_id, created_at);
CREATE INDEX IF NOT EXISTS chats_updated_idx ON chats(updated_at);
CREATE INDEX IF NOT EXISTS dashboards_updated_idx ON dashboards(updated_at);
CREATE INDEX IF NOT EXISTS dashboard_charts_dashboard_idx ON dashboard_charts(dashboard_id, updated_at);
`);

  cachedDb = drizzle(sqlite, { schema });
  migrate(cachedDb as BunSQLiteDatabase<typeof schema>, { migrationsFolder: './drizzle' });

  return cachedDb as BunSQLiteDatabase<typeof schema>;
}
