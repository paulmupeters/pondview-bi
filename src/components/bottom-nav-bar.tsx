import {
  ClockIcon,
  Database,
  LayoutGrid,
  Plus,
  Settings,
  SquareTerminal,
} from "lucide-react";
import type { MouseEvent } from "react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useChatHistory } from "@/hooks/use-chat-history";
import {
  type ChatHistoryEntry,
  getChatHistoryDisplayTitle,
} from "@/lib/chat-history";
import { cn } from "@/lib/utils";
import { deleteAnalysisNotebook } from "@/lib/workspace/analysis-notebook-repo";
import { deleteChat } from "@/lib/workspace/chat-repo";
import Link from "@/vite/next-link";
import {
  usePathname,
  useRouter,
  useSearchParams,
} from "@/vite/next-navigation";

const navButtonClassName =
  "h-auto flex-col gap-0.5 rounded-lg px-2 py-1.5 text-[10px] font-medium leading-tight min-w-0 transition-colors";

interface BottomNavBarProps {
  initialChats?: ChatHistoryEntry[];
}

export function BottomNavBar({ initialChats = [] }: BottomNavBarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const activeChatId =
    pathname === "/analysis" || pathname === "/chat"
      ? (searchParams.get("id") ?? null)
      : null;
  const { chats, isLoading, error, loadChats } = useChatHistory(initialChats, {
    limit: 5,
  });
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const isDashboardsRoute = pathname?.startsWith("/dashboards");
  const isSqlEditorRoute = pathname === "/sql-editor";
  const isDataRoute = pathname === "/data";
  const isSettingsRoute = pathname === "/settings";
  const isChatRoute =
    pathname === "/analysis" || pathname === "/chat" || pathname === "/";

  useEffect(() => {
    if (isHistoryOpen) {
      void loadChats({ showLoading: chats.length === 0 });
    }
  }, [isHistoryOpen, loadChats, chats.length]);

  const handleDeleteChat = async (
    chatId: string,
    e?: MouseEvent<HTMLButtonElement>,
  ) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (chatId === activeChatId) {
      router.push("/");
    }
    try {
      await Promise.all([deleteAnalysisNotebook(chatId), deleteChat(chatId)]);
      await loadChats();
    } catch {
      await loadChats();
    }
  };

  const handleChatClick = (chatId: string) => {
    router.push(`/analysis?id=${encodeURIComponent(chatId)}`);
    setIsHistoryOpen(false);
  };

  const formatDate = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days}d ago`;
    return "Older";
  };

  const shouldShowBlockingLoading = isLoading && chats.length === 0;

  return (
    <div className="fixed bottom-0 inset-x-0 z-50 md:hidden border-t border-border bg-sidebar pb-[env(safe-area-inset-bottom)]">
      <nav className="flex h-14 items-center justify-around px-1">
        <Link href="/" className="flex-1">
          <Button
            variant="ghost"
            className={cn(
              navButtonClassName,
              "w-full",
              isChatRoute
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Plus className="h-5 w-5" />
            <span className="text-center">New</span>
          </Button>
        </Link>

        <Popover open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
          <PopoverTrigger asChild>
            <div className="flex-1">
              <Button
                variant="ghost"
                className={cn(
                  navButtonClassName,
                  "w-full",
                  isHistoryOpen
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <ClockIcon className="h-5 w-5" />
                <span className="text-center">History</span>
              </Button>
            </div>
          </PopoverTrigger>
          <PopoverContent side="top" align="start" className="w-80 p-4 mb-2">
            <div className="flex flex-col gap-3">
              <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
                {shouldShowBlockingLoading ? (
                  <p className="text-sm text-muted-foreground">Loading…</p>
                ) : error ? (
                  <p className="text-sm text-muted-foreground">{error}</p>
                ) : chats.length > 0 ? (
                  chats.map((chat) => (
                    <div
                      key={chat.id}
                      className={cn(
                        "group/row relative flex items-center gap-2 rounded-md p-2 pr-8 transition-colors hover:bg-muted",
                        activeChatId === chat.id &&
                          "bg-primary/5 border-l-2 border-l-primary",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => handleChatClick(chat.id)}
                        className="flex min-w-0 flex-1 cursor-pointer items-start justify-between gap-2 text-left"
                      >
                        <p className="min-w-0 flex-1 truncate text-sm text-foreground">
                          {getChatHistoryDisplayTitle(chat)}
                        </p>
                        <p className="whitespace-nowrap text-[11px] text-muted-foreground">
                          {formatDate(chat.updatedAt)}
                        </p>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteChat(chat.id, e)}
                        className="absolute right-2 top-1/2 z-10 flex -translate-y-1/2 rounded-md bg-background/80 p-1 text-muted-foreground opacity-0 backdrop-blur-sm transition-all duration-200 hover:text-destructive group-hover/row:opacity-100"
                        aria-label="Delete chat"
                      >
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <title>Delete chat</title>
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No chats</p>
                )}
              </div>
              <div className="flex justify-end border-t border-border pt-2">
                <Link
                  href="/analysis/all"
                  onClick={() => setIsHistoryOpen(false)}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  View all analyses
                </Link>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        <Link href="/dashboards" className="flex-1">
          <Button
            variant="ghost"
            className={cn(
              navButtonClassName,
              "w-full",
              isDashboardsRoute
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <LayoutGrid className="h-5 w-5" />
            <span className="text-center">Boards</span>
          </Button>
        </Link>

        <Link href="/sql-editor" className="flex-1">
          <Button
            variant="ghost"
            className={cn(
              navButtonClassName,
              "w-full",
              isSqlEditorRoute
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <SquareTerminal className="h-5 w-5" />
            <span className="text-center">SQL</span>
          </Button>
        </Link>

        <Link href="/data" className="flex-1">
          <Button
            variant="ghost"
            className={cn(
              navButtonClassName,
              "w-full",
              isDataRoute
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Database className="h-5 w-5" />
            <span className="text-center">Data</span>
          </Button>
        </Link>

        <Link href="/settings" className="flex-1">
          <Button
            variant="ghost"
            className={cn(
              navButtonClassName,
              "w-full",
              isSettingsRoute
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Settings className="h-5 w-5" />
            <span className="text-center">Settings</span>
          </Button>
        </Link>
      </nav>
    </div>
  );
}
