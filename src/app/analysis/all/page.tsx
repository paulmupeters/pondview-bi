import { ClockIcon, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useChatHistory } from "@/hooks/use-chat-history";
import {
  getChatHistoryDisplayTitle,
  type ChatHistoryEntry,
} from "@/lib/chat-history";
import { deleteAnalysisNotebook } from "@/lib/workspace/analysis-notebook-repo";
import { deleteChat } from "@/lib/workspace/chat-repo";
import Link from "@/vite/next-link";
import { useRouter } from "@/vite/next-navigation";

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} day${days > 1 ? "s" : ""} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
  return "Just now";
}

const EMPTY_INITIAL_CHATS: ChatHistoryEntry[] = [];

export default function AllAnalysesPage() {
  const router = useRouter();
  const { chats, isLoading, error, loadChats } = useChatHistory(
    EMPTY_INITIAL_CHATS,
    { limit: Number.MAX_SAFE_INTEGER },
  );
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [initialLoadStarted, setInitialLoadStarted] = useState(false);

  const reload = useCallback(
    (showLoading = false) => {
      void loadChats({ showLoading });
    },
    [loadChats],
  );

  useEffect(() => {
    reload(true);
    setInitialLoadStarted(true);
  }, [reload]);

  const handleOpen = (chatId: string) => {
    router.push(`/analysis?id=${encodeURIComponent(chatId)}`);
  };

  const handleDelete = async (chat: ChatHistoryEntry) => {
    const title = getChatHistoryDisplayTitle(chat);
    if (
      !confirm(
        `Delete "${title}"? This action cannot be undone.`,
      )
    ) {
      return;
    }
    setDeletingId(chat.id);
    try {
      await Promise.all([deleteAnalysisNotebook(chat.id), deleteChat(chat.id)]);
      await loadChats();
    } catch {
      await loadChats();
    } finally {
      setDeletingId(null);
    }
  };

  const showBlockingLoader =
    (isLoading || !initialLoadStarted) && chats.length === 0;

  return (
    <div className="mx-auto flex h-full w-full max-w-6xl flex-col gap-8 overflow-y-auto px-6 py-10">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <ClockIcon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Analyses</h1>
              <p className="text-sm text-muted-foreground">
                Browse every analysis notebook in this project
              </p>
            </div>
          </div>
          <Link href="/">
            <Button size="default">
              <Plus className="mr-2 h-4 w-4" />
              New Analysis
            </Button>
          </Link>
        </div>
      </div>

      {showBlockingLoader ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]" />
            <p className="mt-4 text-sm text-muted-foreground">
              Loading analyses...
            </p>
          </div>
        </div>
      ) : error ? (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle>Unable to load analyses</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => reload(true)}>
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : chats.length === 0 ? (
        <Card className="border-dashed">
          <CardHeader className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <ClockIcon className="h-8 w-8 text-muted-foreground" />
            </div>
            <CardTitle>No analyses yet</CardTitle>
            <CardDescription className="max-w-sm">
              Start a new analysis from the home screen. All of your analyses
              will show up here.
            </CardDescription>
            <Link href="/" className="mt-6">
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Start New Analysis
              </Button>
            </Link>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {chats.map((chat) => (
            <Card
              key={chat.id}
              className="group relative cursor-pointer overflow-hidden transition-all hover:shadow-md"
              onClick={() => handleOpen(chat.id)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <CardTitle className="truncate text-lg">
                      {getChatHistoryDisplayTitle(chat)}
                    </CardTitle>
                    <CardDescription className="mt-2 text-xs">
                      Updated {formatRelativeTime(chat.updatedAt)}
                    </CardDescription>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      void handleDelete(chat);
                    }}
                    disabled={deletingId === chat.id}
                    aria-label="Delete analysis"
                    title="Delete analysis"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-primary/50 to-primary opacity-0 transition-opacity group-hover:opacity-100" />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
