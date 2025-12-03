import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { chats, messages } from "@/lib/db/schema";

export type DbMessageRow = typeof messages.$inferSelect;

export async function listMessagesByChatId(chatId: string) {
  const db = getDb();
  return db
    .select()
    .from(messages)
    .where(eq(messages.chatId, chatId))
    .orderBy(asc(messages.createdAt));
}

export async function ensureChat(
  chatId: string,
  title: string | null,
  now = Date.now(),
) {
  const db = getDb();
  await db
    .insert(chats)
    .values({
      id: chatId,
      title,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();
}

export async function insertMessage(input: {
  id: string;
  chatId: string;
  role: "user" | "assistant";
  content: string;
  parts?: string;
  createdAt: number;
}) {
  const db = getDb();
  await db
    .insert(messages)
    .values({
      id: input.id,
      chatId: input.chatId,
      role: input.role,
      content: input.content,
      parts: input.parts,
      createdAt: input.createdAt,
    })
    .onConflictDoNothing();
}

export async function touchChatUpdatedAt(chatId: string, now = Date.now()) {
  const db = getDb();
  await db.update(chats).set({ updatedAt: now }).where(eq(chats.id, chatId));
}

export async function appendUserMessageTx(args: {
  chatId: string;
  messageId: string;
  content: string;
  partsJson?: string;
  titleForNewChat: string | null;
  now?: number;
}) {
  const now = args.now ?? Date.now();
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx
      .insert(chats)
      .values({
        id: args.chatId,
        title: args.titleForNewChat,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing();

    await tx
      .insert(messages)
      .values({
        id: args.messageId,
        chatId: args.chatId,
        role: "user",
        content: args.content,
        parts: args.partsJson,
        createdAt: now,
      })
      .onConflictDoNothing();

    await tx
      .update(chats)
      .set({ updatedAt: now })
      .where(eq(chats.id, args.chatId));
  });
}

export async function appendAssistantMessage(
  chatId: string,
  messageId: string,
  content: string,
  partsJson?: string,
  now = Date.now(),
) {
  const db = getDb();
  await db
    .insert(messages)
    .values({
      id: messageId,
      chatId,
      role: "assistant",
      content,
      parts: partsJson,
      createdAt: now,
    })
    .onConflictDoNothing();

  await db
    .update(chats)
    .set({ updatedAt: now })
    .where(eq(chats.id, chatId));
}

export async function deleteChat(chatId: string) {
  const db = getDb();
  await db.delete(chats).where(eq(chats.id, chatId));
}

// Function to delete a single message and update chat timestamp
export async function deleteMessageFromChat(chatId: string, messageId: string, now = Date.now()) {
  const db = getDb();
  await db
    .delete(messages)
    .where(eq(messages.id, messageId));
  
  // Update chat's updatedAt timestamp
  await db
    .update(chats)
    .set({ updatedAt: now })
    .where(eq(chats.id, chatId));
}

// Function to update message parts (e.g., for updating artifact config)
export async function updateMessageParts(
  chatId: string,
  messageId: string,
  partsJson: string,
  now = Date.now(),
) {
  const db = getDb();
  await db
    .update(messages)
    .set({ parts: partsJson })
    .where(eq(messages.id, messageId));

  // Update chat's updatedAt timestamp
  await db
    .update(chats)
    .set({ updatedAt: now })
    .where(eq(chats.id, chatId));
}

// Function to get a single message by ID
export async function getMessageById(messageId: string) {
  const db = getDb();
  const result = await db
    .select()
    .from(messages)
    .where(eq(messages.id, messageId))
    .limit(1);
  return result[0] ?? null;
}

