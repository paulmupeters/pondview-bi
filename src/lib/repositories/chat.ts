import type { ChatHistoryEntry } from "@/lib/chat-history";
import { promises as fs } from "node:fs";
import {
  readJsonFile,
  resolveSidecarPath,
  writeJsonFileAtomic,
} from "@/lib/sidecar/json-store";

type ChatIndexEntry = {
  id: string;
  title: string | null;
  userId: string | null;
  createdAt: number;
  updatedAt: number;
};

type ChatsIndexFile = {
  version: 1;
  chats: ChatIndexEntry[];
};

type ChatFile = {
  version: 1;
  chat: ChatIndexEntry;
  messages: DbMessageRow[];
};

export type DbMessageRow = {
  id: string;
  chatId: string;
  role: "user" | "assistant";
  content: string;
  parts: string | null;
  createdAt: number;
};

const CHATS_INDEX_PATH = resolveSidecarPath("state", "chats", "index.json");

function chatFilePath(chatId: string): string {
  return resolveSidecarPath(
    "state",
    "chats",
    `${encodeURIComponent(chatId)}.json`,
  );
}

async function loadChatsIndex(): Promise<ChatsIndexFile> {
  return readJsonFile(CHATS_INDEX_PATH, { version: 1, chats: [] });
}

async function saveChatsIndex(index: ChatsIndexFile): Promise<void> {
  await writeJsonFileAtomic(CHATS_INDEX_PATH, index);
}

async function loadChatFile(chatId: string): Promise<ChatFile | null> {
  const filePath = chatFilePath(chatId);
  const fallback = null as ChatFile | null;
  return readJsonFile(filePath, fallback);
}

async function saveChatFile(chat: ChatFile): Promise<void> {
  await writeJsonFileAtomic(chatFilePath(chat.chat.id), chat);
}

async function upsertChatIndexEntry(entry: ChatIndexEntry): Promise<void> {
  const index = await loadChatsIndex();
  const existingIndex = index.chats.findIndex((item) => item.id === entry.id);
  if (existingIndex >= 0) {
    index.chats[existingIndex] = entry;
  } else {
    index.chats.push(entry);
  }
  await saveChatsIndex(index);
}

export async function listRecentChats(limit = 12): Promise<ChatHistoryEntry[]> {
  const index = await loadChatsIndex();
  return [...index.chats]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, Math.max(0, limit))
    .map((item) => ({
      id: item.id,
      title: item.title,
      updatedAt: item.updatedAt,
    }));
}

export async function listMessagesByChatId(chatId: string) {
  const chat = await loadChatFile(chatId);
  if (!chat) {
    return [];
  }
  return [...chat.messages].sort((a, b) => a.createdAt - b.createdAt);
}

export async function ensureChat(
  chatId: string,
  title: string | null,
  now = Date.now(),
) {
  const existing = await loadChatFile(chatId);
  if (existing) {
    return;
  }
  const chatEntry: ChatIndexEntry = {
    id: chatId,
    title,
    userId: null,
    createdAt: now,
    updatedAt: now,
  };
  await saveChatFile({
    version: 1,
    chat: chatEntry,
    messages: [],
  });
  await upsertChatIndexEntry(chatEntry);
}

export async function insertMessage(input: {
  id: string;
  chatId: string;
  role: "user" | "assistant";
  content: string;
  parts?: string;
  createdAt: number;
}) {
  const chat = await loadChatFile(input.chatId);
  if (!chat) {
    return;
  }
  if (chat.messages.some((message) => message.id === input.id)) {
    return;
  }
  chat.messages.push({
    id: input.id,
    chatId: input.chatId,
    role: input.role,
    content: input.content,
    parts: input.parts ?? null,
    createdAt: input.createdAt,
  });
  await saveChatFile(chat);
}

export async function touchChatUpdatedAt(chatId: string, now = Date.now()) {
  const chat = await loadChatFile(chatId);
  if (!chat) {
    return;
  }
  chat.chat.updatedAt = now;
  await saveChatFile(chat);
  await upsertChatIndexEntry(chat.chat);
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
  await ensureChat(args.chatId, args.titleForNewChat, now);
  const chat = await loadChatFile(args.chatId);
  if (!chat) {
    return;
  }
  if (!chat.messages.some((message) => message.id === args.messageId)) {
    chat.messages.push({
      id: args.messageId,
      chatId: args.chatId,
      role: "user",
      content: args.content,
      parts: args.partsJson ?? null,
      createdAt: now,
    });
  }
  chat.chat.updatedAt = now;
  if (!chat.chat.title && args.titleForNewChat) {
    chat.chat.title = args.titleForNewChat;
  }
  await saveChatFile(chat);
  await upsertChatIndexEntry(chat.chat);
}

export async function appendAssistantMessage(
  chatId: string,
  messageId: string,
  content: string,
  partsJson?: string,
  now = Date.now(),
) {
  const chat = await loadChatFile(chatId);
  if (!chat) {
    return;
  }
  if (!chat.messages.some((message) => message.id === messageId)) {
    chat.messages.push({
      id: messageId,
      chatId,
      role: "assistant",
      content,
      parts: partsJson ?? null,
      createdAt: now,
    });
  }
  chat.chat.updatedAt = now;
  await saveChatFile(chat);
  await upsertChatIndexEntry(chat.chat);
}

export async function deleteChat(chatId: string) {
  const index = await loadChatsIndex();
  index.chats = index.chats.filter((chat) => chat.id !== chatId);
  await saveChatsIndex(index);

  try {
    await fs.unlink(chatFilePath(chatId));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      throw error;
    }
  }
}

export async function deleteMessageFromChat(
  chatId: string,
  messageId: string,
  now = Date.now(),
) {
  const chat = await loadChatFile(chatId);
  if (!chat) {
    return;
  }
  chat.messages = chat.messages.filter((message) => message.id !== messageId);
  chat.chat.updatedAt = now;
  await saveChatFile(chat);
  await upsertChatIndexEntry(chat.chat);
}

export async function updateMessageParts(
  chatId: string,
  messageId: string,
  partsJson: string,
  now = Date.now(),
) {
  const chat = await loadChatFile(chatId);
  if (!chat) {
    return;
  }
  const message = chat.messages.find((item) => item.id === messageId);
  if (!message) {
    return;
  }
  message.parts = partsJson;
  chat.chat.updatedAt = now;
  await saveChatFile(chat);
  await upsertChatIndexEntry(chat.chat);
}

export async function getMessageById(messageId: string) {
  const index = await loadChatsIndex();
  for (const chat of index.chats) {
    const chatFile = await loadChatFile(chat.id);
    const found = chatFile?.messages.find((message) => message.id === messageId);
    if (found) {
      return found;
    }
  }
  return null;
}
