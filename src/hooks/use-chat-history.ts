import { useCallback, useEffect, useState } from "react";
import type { ChatHistoryEntry } from "@/lib/chat-history";
import { getOpenProject, listOpenProjectFiles } from "@/lib/project-store";
import { listRecentAnalysisNotebooks } from "@/lib/workspace/analysis-notebook-repo";

type LoadChatsOptions = {
  showLoading?: boolean;
};

type UseChatHistoryOptions = {
  limit?: number;
};

function getNotebookProjectPath(path: string): string | null {
  const segments = path.trim().replace(/\\/g, "/").split("/").filter(Boolean);
  const notebooksIndex = segments.indexOf("notebooks");
  const artifactId = segments[notebooksIndex + 1];

  if (
    notebooksIndex === -1 ||
    segments[notebooksIndex - 1] !== "pondview" ||
    !artifactId?.trim()
  ) {
    return null;
  }

  return `pondview/notebooks/${artifactId.trim()}`;
}

export function useChatHistory(
  initialChats: ChatHistoryEntry[] = [],
  { limit }: UseChatHistoryOptions = {},
) {
  const [chats, setChats] = useState<ChatHistoryEntry[]>(initialChats);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setChats(initialChats);
  }, [initialChats]);

  const loadChats = useCallback(
    async (options: LoadChatsOptions = {}): Promise<ChatHistoryEntry[]> => {
      const { showLoading = false } = options;
      if (showLoading) {
        setIsLoading(true);
      }
      setError(null);

      try {
        const project = await getOpenProject();
        const projectPaths = project
          ? Array.from(
              new Set(
                (await listOpenProjectFiles())
                  .map((file) => getNotebookProjectPath(file.path))
                  .filter((path): path is string => path !== null),
              ),
            )
          : [];
        const chatList = await listRecentAnalysisNotebooks({
          ...(limit !== undefined ? { limit } : {}),
          ...(project
            ? {
                projectId: project.id,
                projectPaths,
              }
            : {}),
        });
        setChats(chatList);
        return chatList;
      } catch (error) {
        console.error("Failed to load chats:", error);
        setError(
          error instanceof Error ? error.message : "Failed to load chats.",
        );
      } finally {
        if (showLoading) {
          setIsLoading(false);
        }
      }

      return [];
    },
    [limit],
  );

  return { chats, isLoading, error, loadChats };
}
