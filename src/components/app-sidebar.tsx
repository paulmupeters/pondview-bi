"use client";

import { ClockIcon, Database, LayoutGrid, Plus, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { MouseEvent } from "react";
import { useEffect, useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useChatHistory } from "@/hooks/use-chat-history";
import type { ChatHistoryEntry } from "@/lib/chat-history";
import { cn } from "@/lib/utils";

const railButtonClassName =
  "h-auto w-full flex-col gap-1 rounded-xl px-1 py-2 text-[11px] font-medium leading-tight";

interface AppSidebarProps {
  initialChats?: ChatHistoryEntry[];
}

export function AppSidebar({ initialChats = [] }: AppSidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const activeChatId =
    pathname === "/chat" ? (searchParams.get("id") ?? null) : null;
  const { chats, isLoading, loadChats } = useChatHistory(initialChats);
  const [isChatHistoryPopoverOpen, setIsChatHistoryPopoverOpen] =
    useState(false);

  const isDashboardsRoute = pathname?.startsWith("/dashboards");
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
          const res = await fetch("/api/chats", { cache: "no-store" });
          if (res.ok) {
            const data = (await res.json()) as {
              chats: ChatHistoryEntry[];
            };
            if (data.chats?.some((chat) => chat.id === activeChatId)) {
              await loadChats();
              break;
            }
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
      const res = await fetch(`/api/chat/${chatId}`, { method: "DELETE" });
      if (!res.ok) {
        await loadChats();
      } else {
        await loadChats();
      }
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
    router.push(`/chat?id=${encodeURIComponent(chatId)}`);
    setIsChatHistoryPopoverOpen(false);
  };

  const shouldShowBlockingLoading = isLoading && chats.length === 0;

  return (
    <div className="relative flex h-full w-20 flex-col border-r border-border bg-sidebar px-2 py-4">
      <div className="relative flex flex-col items-center gap-2">
        <div className="relative">
          < Link href="/">
          <svg
            width="60%"
            height="60%"
            viewBox="0 0 1280 792"
            version="1.1"
            xmlns="http://www.w3.org/2000/svg"
            xmlnsXlink="http://www.w3.org/1999/xlink"
            style={{
              fillRule: "evenodd",
              clipRule: "evenodd",
              strokeLinecap: "round",
              strokeLinejoin: "round",
              strokeMiterlimit: 1.5,
            }}
            className="h-16 w-16"
            aria-label="DataChat"
          >
            <title>Pondview</title>
            <g id="water1">
              <path
                d="M804.167,291.667l87.5,0l0,16.667l62.5,0l0,16.667l33.333,0l0,20.833l29.167,0l0,12.5l33.333,0l0,16.667l16.667,0l0,20.833l16.667,0l0,83.333l-16.667,0l0,16.667l-12.5,0l0,16.667l-20.833,0l0,16.667l-16.667,0l0,12.5l-29.167,0l0,16.667l-50,0l0,12.5l-50,0l0,12.5l-100,0l0,20.833l-316.667,0l0,-20.833l-95.833,0l0,-16.667l-50,0l0,-16.667l-50,0l0,-16.667l-29.167,0l0,-16.667l-20.833,0l0,-12.5l-12.5,0l0,-16.667l-16.667,0l0,-16.667l-16.667,0l0,-79.167l16.667,0l0,-16.667l16.667,0l0,-16.667l33.333,0l0,-16.667l29.167,0l0,-16.667l33.333,0l0,-16.667l66.667,0l0,-16.667l75,0l0,16.667l-62.5,0l0,12.5l-54.167,0l0,16.667l-45.833,0l0,16.667l-12.5,0l0,16.667l-16.667,0l0,16.667l-16.667,0l0,66.667l12.5,0l0,20.833l33.333,0l0,20.833l33.333,0l0,16.667l45.833,0l0,16.667l66.667,0l0,20.833l387.5,0l0,-20.833l62.5,0l0,-16.667l50,0l0,-16.667l33.333,0l0,-20.833l33.333,0l0,-16.667l16.667,0l0,-62.5l-16.667,0l0,-16.667l-12.5,0l0,-12.5l-20.833,0l0,-20.833l-37.5,0l0,-16.667l-54.167,0l0,-20.833l-70.833,0l0,-16.667Z"
                style={{
                  fill: "var(--accent)",
                  stroke: "var(--accent)",
                  strokeWidth: "4.17px",
                }}
              />
            </g>
            <g id="drop">
              <path
                d="M550,325c0.218,35.525 0,-50 0,-50l0,-4.167l16.667,0l0,-45.833l16.667,0l0,-25l16.667,0l0,-33.333l20.833,0l0,-16.667l20.833,0l0,16.667l16.667,0l0,33.333l20.833,0l0,29.167l16.667,0l0,45.833l16.667,0l0,83.333l-16.667,0l0,33.333l-16.667,0l0,16.667l-37.5,0l0,4.167l-29.167,0l0,-4.167l-25,0l0,-16.667l-20.833,0l0,-33.333l-16.667,0c0,0 -0.218,-68.858 0,-33.333Z"
                style={{
                  fill: "var(--accent)",
                  stroke: "var(--accent)",
                  strokeWidth: "4.17px",
                }}
              />
              <path
                d="M675,304.167l0,37.5l-16.667,0l0,16.667l-25,0l0,20.833l25,0l0,-20.833l16.667,0l0,-16.667l16.667,0l0,-37.5l-16.667,0Z"
                style={{ fill: "var(--background)" }}
              />
            </g>
            <g id="water2">
              <path
                d="M450,358.333l-45.833,0l0,16.667l-29.167,0l0,16.667l-20.833,0l0,45.833l20.833,0l0,16.667l29.167,0l0,16.667l33.333,0l0,16.667l66.667,0l0,20.833l254.167,0l0,-20.833l62.5,0l0,-12.5l37.5,0l0,-20.833l25,0l0,-12.5l20.833,0l0,-45.833l-20.833,0l0,-16.667l-29.167,0l0,-16.667l-45.833,0l0,16.667l33.333,0l0,12.5l16.667,0l0,33.333l-16.667,0l0,16.667l-33.333,0l0,16.667l-66.667,0l0,20.833l-225,0l0,-20.833l-66.667,0l0,-16.667l-33.333,0l0,-16.667l-16.667,0l0,-37.5l16.667,0l0,-12.5l33.333,0l0,-16.667"
                style={{
                  fill: "var(--accent)",
                  stroke: "var(--accent)",
                  strokeWidth: "4.17px",
                }}
              />
              <rect
                x="454.167"
                y="341.667"
                width="45.833"
                height="16.667"
                style={{
                  fill: "var(--accent)",
                  stroke: "var(--accent)",
                  strokeWidth: "4.17px",
                }}
              />
              <rect
                x="762.5"
                y="341.667"
                width="45.833"
                height="16.667"
                style={{
                  fill: "var(--accent)",
                  stroke: "var(--accent)",
                  strokeWidth: "4.17px",
                }}
              />
            </g>
          </svg>
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
            <span className="text-center">New</span>
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
              <span className="text-center">History</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 p-4">
            <div className="flex max-h-72 flex-col gap-2 overflow-y-auto">
              {shouldShowBlockingLoading ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : chats.length > 0 ? (
                chats.map((chat) => (
                  <div
                    key={chat.id}
                    className={cn(
                      "group relative flex items-center gap-2 rounded-md p-2 pr-8 transition-colors hover:bg-accent",
                      activeChatId === chat.id && "bg-accent",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => handleChatClick(chat.id)}
                      className="flex min-w-0 flex-1 cursor-pointer items-start justify-between gap-2 text-left"
                    >
                      <p className="min-w-0 flex-1 truncate text-sm hover:text-accent-foreground">
                        {chat.title || chat.id}
                      </p>
                      <p className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatDate(chat.updatedAt)}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteChat(chat.id, e)}
                      className="absolute right-2 top-1/2 z-10 flex -translate-y-1/2 translate-x-2 rounded-md bg-background/80 p-1 text-muted-foreground opacity-0 backdrop-blur-sm transition-all duration-200 hover:bg-accent/80 hover:text-destructive group-hover:translate-x-0 group-hover:opacity-100"
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
          </PopoverContent>
        </Popover>
        <Link href="/dashboards" className="w-full">
          <Button
            variant="ghost"
            className={cn(
              railButtonClassName,
              isDashboardsRoute &&
              "bg-sidebar-accent text-sidebar-accent-foreground",
            )}
            aria-label="Dashboards"
            title="Dashboards"
          >
            <LayoutGrid className="h-4 w-4" />
            <span className="text-center">Dashboards</span>
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
            <span className="text-center">Data</span>
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
            <span className="text-center">Settings</span>
          </Button>
        </Link>
        <div className="flex w-full flex-col items-center rounded-xl px-1 py-2">
          <ThemeToggle />
          <span className="mt-1 text-center text-[11px] font-medium leading-tight text-muted-foreground">
            Theme
          </span>
        </div>
      </div>
    </div>
  );
}
