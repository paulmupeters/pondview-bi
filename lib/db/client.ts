import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";

import * as schema from "./schema";

const filePath = process.env.DATABASE_PATH || "./sqlite.db";
export const sqlite = new Database(filePath);

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

CREATE INDEX IF NOT EXISTS messages_chat_idx ON messages(chat_id, created_at);
`);

export const db = drizzle(sqlite, { schema });
