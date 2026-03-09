import type { ChatHistoryEntry } from "@/lib/chat-history";
import {
  deleteByKey,
  getAllFromStore,
  getByKey,
  putOne,
  STORE_CHATS,
  STORE_MESSAGES,
  type WorkspaceChat,
  type WorkspaceMessage,
} from "@/lib/workspace/workspace-db";

export type DbMessageRow = {
  id: string;
  chatId: string;
  role: "user" | "assistant";
  content: string;
  parts: string | null;
  createdAt: number;
};

function sortMessagesByCreatedAt(rows: WorkspaceMessage[]): WorkspaceMessage[] {
  return [...rows].sort((left, right) => left.createdAt - right.createdAt);
}

async function upsertChat(entry: WorkspaceChat): Promise<void> {
  await putOne(STORE_CHATS, entry);
}

async function putMessage(entry: WorkspaceMessage): Promise<void> {
  await putOne(STORE_MESSAGES, entry);
}

export async function listRecentChats(limit = 12): Promise<ChatHistoryEntry[]> {
  const chats = await getAllFromStore<WorkspaceChat>(STORE_CHATS);
  return chats
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, Math.max(0, limit))
    .map((item) => ({
      id: item.id,
      title: item.title,
      updatedAt: item.updatedAt,
    }));
}

export async function getChatTitleById(chatId: string): Promise<string | null> {
  const chat = await getByKey<WorkspaceChat>(STORE_CHATS, chatId);
  return chat?.title ?? null;
}

export async function updateChatTitle(
  chatId: string,
  title: string | null,
  now = Date.now(),
): Promise<void> {
  const normalizedTitle = title?.trim() ? title.trim() : null;
  const existing = await getByKey<WorkspaceChat>(STORE_CHATS, chatId);

  if (!existing) {
    await ensureChat(chatId, normalizedTitle, now);
    return;
  }

  await upsertChat({
    ...existing,
    title: normalizedTitle,
    updatedAt: now,
  });
}

export async function listMessagesByChatId(
  chatId: string,
): Promise<DbMessageRow[]> {
  const messages = await getAllFromStore<WorkspaceMessage>(STORE_MESSAGES);
  return sortMessagesByCreatedAt(
    messages.filter((message) => message.chatId === chatId),
  ).map((message) => ({
    id: message.id,
    chatId: message.chatId,
    role: message.role,
    content: message.content,
    parts: message.parts,
    createdAt: message.createdAt,
  }));
}

export async function ensureChat(
  chatId: string,
  title: string | null,
  now = Date.now(),
): Promise<void> {
  const existing = await getByKey<WorkspaceChat>(STORE_CHATS, chatId);
  if (existing) {
    return;
  }

  await upsertChat({
    id: chatId,
    title,
    userId: null,
    createdAt: now,
    updatedAt: now,
  });
}

export async function touchChatUpdatedAt(
  chatId: string,
  now = Date.now(),
): Promise<void> {
  const existing = await getByKey<WorkspaceChat>(STORE_CHATS, chatId);
  if (!existing) {
    return;
  }
  await upsertChat({
    ...existing,
    updatedAt: now,
  });
}

export async function insertMessage(input: {
  id: string;
  chatId: string;
  role: "user" | "assistant";
  content: string;
  parts?: string;
  createdAt: number;
}): Promise<void> {
  await ensureChat(input.chatId, null, input.createdAt);
  const existing = await getByKey<WorkspaceMessage>(STORE_MESSAGES, input.id);
  if (existing) {
    return;
  }

  await putMessage({
    id: input.id,
    chatId: input.chatId,
    role: input.role,
    content: input.content,
    parts: input.parts ?? null,
    createdAt: input.createdAt,
  });
}

export async function appendUserMessageTx(args: {
  chatId: string;
  messageId: string;
  content: string;
  partsJson?: string;
  titleForNewChat: string | null;
  now?: number;
}): Promise<void> {
  const now = args.now ?? Date.now();
  await ensureChat(args.chatId, args.titleForNewChat, now);

  const existingMessage = await getByKey<WorkspaceMessage>(
    STORE_MESSAGES,
    args.messageId,
  );
  if (!existingMessage) {
    await putMessage({
      id: args.messageId,
      chatId: args.chatId,
      role: "user",
      content: args.content,
      parts: args.partsJson ?? null,
      createdAt: now,
    });
  }

  const existingChat = await getByKey<WorkspaceChat>(STORE_CHATS, args.chatId);
  if (!existingChat) {
    return;
  }

  await upsertChat({
    ...existingChat,
    title: existingChat.title || args.titleForNewChat,
    updatedAt: now,
  });
}

export async function appendAssistantMessage(
  chatId: string,
  messageId: string,
  content: string,
  partsJson?: string,
  now = Date.now(),
): Promise<void> {
  await ensureChat(chatId, "SQL Query Results", now);

  const existingMessage = await getByKey<WorkspaceMessage>(
    STORE_MESSAGES,
    messageId,
  );
  if (!existingMessage) {
    await putMessage({
      id: messageId,
      chatId,
      role: "assistant",
      content,
      parts: partsJson ?? null,
      createdAt: now,
    });
  }

  await touchChatUpdatedAt(chatId, now);
}

export async function deleteChat(chatId: string): Promise<void> {
  const messages = await getAllFromStore<WorkspaceMessage>(STORE_MESSAGES);
  const matching = messages.filter((message) => message.chatId === chatId);
  for (const message of matching) {
    await deleteByKey(STORE_MESSAGES, message.id);
  }
  await deleteByKey(STORE_CHATS, chatId);
}

export async function deleteMessageFromChat(
  chatId: string,
  messageId: string,
  now = Date.now(),
): Promise<void> {
  const message = await getByKey<WorkspaceMessage>(STORE_MESSAGES, messageId);
  if (!message || message.chatId !== chatId) {
    return;
  }

  await deleteByKey(STORE_MESSAGES, messageId);
  await touchChatUpdatedAt(chatId, now);
}

export async function updateMessageParts(
  chatId: string,
  messageId: string,
  partsJson: string,
  now = Date.now(),
): Promise<void> {
  const message = await getByKey<WorkspaceMessage>(STORE_MESSAGES, messageId);
  if (!message || message.chatId !== chatId) {
    return;
  }

  await putMessage({
    ...message,
    parts: partsJson,
  });

  await touchChatUpdatedAt(chatId, now);
}

export async function getMessageById(
  messageId: string,
): Promise<DbMessageRow | null> {
  const message = await getByKey<WorkspaceMessage>(STORE_MESSAGES, messageId);
  if (!message) {
    return null;
  }

  return {
    id: message.id,
    chatId: message.chatId,
    role: message.role,
    content: message.content,
    parts: message.parts,
    createdAt: message.createdAt,
  };
}
