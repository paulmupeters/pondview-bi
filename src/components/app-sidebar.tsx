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
import { PondviewLogo } from "@/components/pondview-logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useChatHistory } from "@/hooks/use-chat-history";
import {
  getChatHistoryDisplayTitle,
  type ChatHistoryEntry,
} from "@/lib/chat-history";
import { cn } from "@/lib/utils";
import { deleteAnalysisNotebook } from "@/lib/workspace/analysis-notebook-repo";
import { deleteChat } from "@/lib/workspace/chat-repo";
import { switchToFreshWorkspaceDatabase } from "@/lib/workspace/workspace-db";
import Link from "@/vite/next-link";
import {
  usePathname,
  useRouter,
  useSearchParams,
} from "@/vite/next-navigation";

const railButtonClassName =
  "h-auto w-full flex-col gap-0 sm:gap-1 rounded-xl px-1 py-2 text-[11px] font-medium leading-tight";

interface AppSidebarProps {
  initialChats?: ChatHistoryEntry[];
}

export function AppSidebar({ initialChats = [] }: AppSidebarProps) {
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
  const [isChatHistoryPopoverOpen, setIsChatHistoryPopoverOpen] =
    useState(false);
  const [resettingDb, setResettingDb] = useState(false);

  const isDashboardsRoute = pathname?.startsWith("/dashboards");
  const isSqlEditorRoute = pathname === "/sql-editor";
  const isDataRoute = pathname === "/data";
  const isSettingsRoute = pathname === "/settings";

  useEffect(() => {
    void loadChats({ showLoading: initialChats.length === 0 });
  }, [initialChats.length, loadChats]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!activeChatId) return;
      const latest = await loadChats();
      const alreadyListed = latest.some((chat) => chat.id === activeChatId);

      if (!alreadyListed) {
        // Retry briefly so a new chat has time to persist.
        for (let i = 0; i < 4 && !cancelled; i++) {
          const latestRetry = await loadChats();
          if (latestRetry.some((chat) => chat.id === activeChatId)) {
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [activeChatId, loadChats]);

  const handleChatHistoryPopoverChange = (open: boolean) => {
    setIsChatHistoryPopoverOpen(open);
    if (open) {
      void loadChats({ showLoading: chats.length === 0 });
    }
  };

  const handleDeleteChat = async (
    chatId: string,
    e?: MouseEvent<HTMLButtonElement>,
  ) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    const isDeletingActiveChat = chatId === activeChatId;
    if (isDeletingActiveChat) {
      router.push("/");
    }

    try {
      await Promise.all([deleteAnalysisNotebook(chatId), deleteChat(chatId)]);
      await loadChats();
    } catch {
      await loadChats();
    }
  };

  const formatDate = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days} days ago`;
    if (days < 14) return "Last week";
    return "Older";
  };

  const handleChatClick = (chatId: string) => {
    router.push(`/analysis?id=${encodeURIComponent(chatId)}`);
    setIsChatHistoryPopoverOpen(false);
  };

  const shouldShowBlockingLoading = isLoading && chats.length === 0;

  const handleResetWorkspaceDb = async () => {
    setResettingDb(true);
    try {
      switchToFreshWorkspaceDatabase();
      window.location.reload();
    } catch {
      setResettingDb(false);
    }
  };

  return (
    <div className="relative hidden md:flex h-full w-12 sm:w-20 flex-col border-r border-border bg-sidebar py-4 p-1">
      <div className="relative flex flex-col items-center gap-2">
        <div className="relative">
          <Link href="/">
            <PondviewLogo className="h-10 w-10 sm:h-16 sm:w-16" />
            <div className="absolute inset-x-0 top-[30%] flex justify-center pointer-events-none z-10">
              {/* <span className="text-primary font-bold text-xs font-mono">POND</span>
            <span className="text-xs font-mono font-semibold text-sidebar-foreground">VIEW</span> */}
            </div>
          </Link>
        </div>
      </div>
      <div className="flex flex-col items-center gap-2 mt-2">
        <Link href="/" className="w-full">
          <Button
            variant="ghost"
            className={cn(
              railButtonClassName,
              "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground",
            )}
            aria-label="New"
            title="New"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline text-center">New</span>
          </Button>
        </Link>

        <Popover
          open={isChatHistoryPopoverOpen}
          onOpenChange={handleChatHistoryPopoverChange}
        >
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              className={cn(
                railButtonClassName,
                isChatHistoryPopoverOpen &&
                  "bg-sidebar-accent text-sidebar-accent-foreground",
              )}
              aria-label="History"
              title="History"
            >
              <ClockIcon className="h-4 w-4" />
              <span className="hidden sm:inline text-center">History</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 p-4">
            <div className="flex flex-col gap-3">
            <div className="flex max-h-72 flex-col gap-2 overflow-y-auto">
              {shouldShowBlockingLoading ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : error ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">{error}</p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void loadChats({ showLoading: true })}
                    >
                      Retry
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      onClick={() => void handleResetWorkspaceDb()}
                      disabled={resettingDb}
                    >
                      {resettingDb ? "Resetting..." : "Reset local data"}
                    </Button>
                  </div>
                </div>
              ) : chats.length > 0 ? (
                chats.map((chat) => (
                  <div
                    key={chat.id}
                    className={cn(
                      "group relative flex items-center gap-2 rounded-md p-2 pr-8 transition-colors hover:bg-sidebar-accent text-sidebar-foreground hover:text-sidebar-accent-foreground",
                      activeChatId === chat.id &&
                        "bg-sidebar-accent text-sidebar-accent-foreground",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => handleChatClick(chat.id)}
                      className="flex min-w-0 flex-1 cursor-pointer items-start justify-between gap-2 text-left"
                    >
                      <p className="min-w-0 flex-1 truncate text-sm">
                        {getChatHistoryDisplayTitle(chat)}
                      </p>
                      <p className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatDate(chat.updatedAt)}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteChat(chat.id, e)}
                      className="absolute right-2 top-1/2 z-10 flex -translate-y-1/2 translate-x-2 rounded-md bg-background/80 p-1 text-muted-foreground opacity-0 backdrop-blur-sm transition-all duration-200 hover:bg-sidebar-accent/80 hover:text-destructive group-hover:translate-x-0 group-hover:opacity-100"
                      aria-label="Delete chat"
                      title="Delete chat"
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
                onClick={() => setIsChatHistoryPopoverOpen(false)}
                className="text-xs font-medium text-primary hover:underline"
              >
                View all analyses
              </Link>
            </div>
            </div>
          </PopoverContent>
        </Popover>
        <Link href="/dashboards" className="w-full">
          <Button
            variant="ghost"
            className={cn(
              railButtonClassName,
              isDashboardsRoute &&
                "bg-sidebar-accent text-sidebar-accent-foreground w-full",
            )}
            aria-label="Dashboards"
            title="Dashboards"
          >
            <LayoutGrid className="h-4 w-4" />
            <span className="hidden sm:inline text-center">Dashboards</span>
          </Button>
        </Link>
        <Link href="/sql-editor" className="w-full">
          <Button
            variant="ghost"
            className={cn(
              railButtonClassName,
              isSqlEditorRoute &&
                "bg-sidebar-accent text-sidebar-accent-foreground",
            )}
            aria-label="SQL"
            title="SQL Editor"
          >
            <SquareTerminal className="h-4 w-4" />
            <span className="hidden sm:inline text-center">SQL</span>
          </Button>
        </Link>
        <Link href="/data" className="w-full">
          <Button
            variant="ghost"
            className={cn(
              railButtonClassName,
              isDataRoute && "bg-sidebar-accent text-sidebar-accent-foreground",
            )}
            aria-label="Data"
            title="Data"
          >
            <Database className="h-4 w-4" />
            <span className="hidden sm:inline text-center">Data</span>
          </Button>
        </Link>
      </div>

      <div className="flex-1" />

      <div className="flex flex-col items-center gap-2 border-t border-border pt-3">
        <Link href="/settings" className="w-full">
          <Button
            variant="ghost"
            className={cn(
              railButtonClassName,
              isSettingsRoute &&
                "bg-sidebar-accent text-sidebar-accent-foreground",
            )}
            aria-label="Settings"
            title="Settings"
          >
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline text-center">Settings</span>
          </Button>
        </Link>
        <div className="flex w-full flex-col items-center rounded-xl px-1 py-2">
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}
