import {
  ClockIcon,
  Database,
  LayoutGrid,
  Plus,
  Settings,
  Sparkles,
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { EMPTY_CHAT_HISTORY, useChatHistory } from "@/hooks/use-chat-history";
import {
  type ChatHistoryEntry,
  getChatHistoryDisplayTitle,
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

interface AppSidebarProps {
  initialChats?: ChatHistoryEntry[];
}

const TOOLTIP_DELAY = 300;

const RAIL_ITEM_BASE =
  "group relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors";
const RAIL_ITEM_ACTIVE = "bg-primary/10 text-primary";
const RAIL_ITEM_INACTIVE =
  "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground";

export function AppSidebar({ initialChats = EMPTY_CHAT_HISTORY }: AppSidebarProps) {
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
  const isAnalysisRoute =
    pathname?.startsWith("/analysis") || pathname === "/chat";

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
    if (days < 7) return `${days}d ago`;
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
    <div className="relative hidden md:flex h-full w-14 flex-col border-r border-border bg-sidebar py-3">
      {/* Logo */}
      <div className="mb-5 flex justify-center">
        <Link
          href="/"
          aria-label="Pondview"
          title="Pondview"
          className="flex items-center justify-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <PondviewLogo className="h-10 w-10" />
        </Link>
      </div>

      {/* Workspace */}
      <div className="flex flex-col items-center gap-1 px-1.5">
        <RailAction href="/" icon={Plus} label="New" />

        <RailItem
          href="/analysis/all"
          icon={Sparkles}
          label="Analyses"
          isActive={isAnalysisRoute}
        />

        <Popover
          open={isChatHistoryPopoverOpen}
          onOpenChange={handleChatHistoryPopoverChange}
        >
          <Tooltip delayDuration={TOOLTIP_DELAY}>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    RAIL_ITEM_BASE,
                    isChatHistoryPopoverOpen
                      ? RAIL_ITEM_ACTIVE
                      : RAIL_ITEM_INACTIVE,
                  )}
                  aria-label="History"
                >
                  <ClockIcon
                    className={cn(
                      "size-[18px]",
                      isChatHistoryPopoverOpen
                        ? "text-primary"
                        : "text-sidebar-foreground/60 group-hover:text-sidebar-foreground",
                    )}
                  />
                </button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="right">History</TooltipContent>
          </Tooltip>
          <PopoverContent align="start" className="w-80 p-4">
            <div className="flex flex-col gap-3">
              <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
                {shouldShowBlockingLoading ? (
                  <p className="text-sm text-muted-foreground">Loading…</p>
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
                        {resettingDb ? "Resetting…" : "Reset local data"}
                      </Button>
                    </div>
                  </div>
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
                        className="absolute right-2 top-1/2 z-10 flex -translate-y-1/2 translate-x-1 rounded-md bg-background/80 p-1 text-muted-foreground opacity-0 backdrop-blur-sm transition-all duration-200 hover:text-destructive group-hover/row:translate-x-0 group-hover/row:opacity-100"
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
      </div>

      {/* Spacer between Workspace and Tools */}
      <div className="my-2 flex justify-center">
        <div className="h-px w-6 bg-sidebar-border" />
      </div>

      {/* Tools */}
      <div className="flex flex-col items-center gap-1 px-1.5">
        <RailItem
          href="/dashboards"
          icon={LayoutGrid}
          label="Dashboards"
          isActive={isDashboardsRoute}
        />
        <RailItem
          href="/sql-editor"
          icon={SquareTerminal}
          label="SQL Editor"
          isActive={isSqlEditorRoute}
        />
        <RailItem
          href="/data"
          icon={Database}
          label="Data"
          isActive={isDataRoute}
        />
      </div>

      <div className="flex-1" />

      {/* System */}
      <div className="flex flex-col items-center gap-1 px-1.5">
        <RailItem
          href="/settings"
          icon={Settings}
          label="Settings"
          isActive={isSettingsRoute}
        />
        <Tooltip delayDuration={TOOLTIP_DELAY}>
          <TooltipTrigger asChild>
            <ThemeToggle />
          </TooltipTrigger>
          <TooltipContent side="right">Toggle theme</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Primitives                                                         */
/* ------------------------------------------------------------------ */

function RailItem({
  href,
  icon: Icon,
  label,
  isActive,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  isActive?: boolean;
}) {
  return (
    <Tooltip delayDuration={TOOLTIP_DELAY}>
      <TooltipTrigger asChild>
        <Link
          href={href}
          className={cn(
            RAIL_ITEM_BASE,
            isActive ? RAIL_ITEM_ACTIVE : RAIL_ITEM_INACTIVE,
          )}
          aria-label={label}
        >
          {isActive && (
            <div className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-primary" />
          )}
          <Icon
            className={cn(
              "size-[18px]",
              isActive
                ? "text-primary"
                : "text-sidebar-foreground/60 group-hover:text-sidebar-foreground",
            )}
          />
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

function RailAction({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <Tooltip delayDuration={TOOLTIP_DELAY}>
      <TooltipTrigger asChild>
        <Link
          href={href}
          className={cn(
            "group relative flex h-9 w-9 items-center justify-center rounded-lg border border-primary/15 bg-primary/5 transition-colors",
            "hover:bg-primary/10 hover:border-primary/25",
          )}
          aria-label={label}
        >
          <Icon className="size-[18px] text-primary" />
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}
