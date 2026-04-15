export type ChatHistoryEntry = {
  id: string;
  title: string | null;
  updatedAt: number;
};

function formatLocalIsoDate(timestamp: number): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getChatHistoryDisplayTitle(chat: ChatHistoryEntry): string {
  const trimmedTitle = chat.title?.trim();
  if (trimmedTitle) {
    return trimmedTitle;
  }

  return `${formatLocalIsoDate(chat.updatedAt)} Untitled`;
}
