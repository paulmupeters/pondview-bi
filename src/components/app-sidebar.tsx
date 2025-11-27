"use client";

import {
  Database,
  LayoutGrid,
  MessageSquare,
  PanelLeftClose,
  Plus,
  Settings,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { MouseEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface ChatSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function AppSidebar({ isOpen, onToggle }: ChatSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const activeChatId = pathname?.split("/")[1] ?? null;
  const [recentChats, setRecentChats] = useState<
    { id: string; title: string | null; updatedAt: number }[]
  >([]);

  const loadChats = useCallback(async (): Promise<
    { id: string; title: string | null; updatedAt: number }[]
  > => {
    try {
      const res = await fetch("/api/chats", { cache: "no-store" });
      if (!res.ok) return [];
      const data = (await res.json()) as {
        chats: { id: string; title: string | null; updatedAt: number }[];
      };
      const list = data.chats ?? [];
      setRecentChats(list);
      return list;
    } catch {
      return [];
    }
  }, []);

  // Fetch when opening sidebar
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    (async () => {
      if (!cancelled) await loadChats();
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, loadChats]);

  // Fetch on route change + brief retry if new chat not yet persisted
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const run = async () => {
      const latest = await loadChats();
      if (!activeChatId) return;
      const alreadyListed = latest.some((c) => c.id === activeChatId);

      if (!alreadyListed) {
        // Optimistically show the active chat immediately
        setRecentChats((current) => {
          const exists = current.some((c) => c.id === activeChatId);
          if (exists) return current;
          return [
            { id: activeChatId, title: null, updatedAt: Date.now() },
            ...current,
          ];
        });

        // Brief retry loop to allow server to persist the new chat
        for (let i = 0; i < 4 && !cancelled; i++) {
          const res = await fetch("/api/chats", { cache: "no-store" });
          if (res.ok) {
            const data = (await res.json()) as {
              chats: { id: string; title: string | null; updatedAt: number }[];
            };
            if (data.chats?.some((c) => c.id === activeChatId)) {
              setRecentChats(data.chats ?? []);
              break;
            }
          }
          await new Promise((r) => setTimeout(r, 500));
        }
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [isOpen, activeChatId, loadChats]);

  const handleDeleteChat = async (chatId: string) => {
    // Check if we're deleting the currently active chat
    const isDeletingActiveChat = chatId === activeChatId;

    // If deleting the active chat, navigate home immediately
    if (isDeletingActiveChat) {
      router.push("/");
    }

    // Optimistically remove from UI
    setRecentChats(
      (current: { id: string; title: string | null; updatedAt: number }[]) =>
        current.filter(
          (c: { id: string; title: string | null; updatedAt: number }) =>
            c.id !== chatId,
        ),
    );
    try {
      const res = await fetch(`/api/chat/${chatId}`, { method: "DELETE" });
      if (!res.ok) {
        // Reload list on failure to restore
        const reload = await fetch("/api/chats", { cache: "no-store" });
        if (reload.ok) {
          const data = (await reload.json()) as {
            chats: { id: string; title: string | null; updatedAt: number }[];
          };
          setRecentChats(data.chats ?? []);
        }
      }
    } catch {
      try {
        const reload = await fetch("/api/chats", { cache: "no-store" });
        if (reload.ok) {
          const data = (await reload.json()) as {
            chats: { id: string; title: string | null; updatedAt: number }[];
          };
          setRecentChats(data.chats ?? []);
        }
      } catch { }
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

  return (
    <div
      className={cn(
        "relative flex flex-col border-r border-border bg-sidebar transition-all duration-300",
        isOpen ? "w-64" : "w-0",
      )}
    >
      {isOpen && (
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex items-center justify-around border-b border-border p-4">
            <div className="flex items-center gap-2">
              <div className="flex flex-col h-12 w-24 items-center justify-center rounded-lg">
                {/* <Database className="h-4 w-4 text-primary-foreground" /> */}
                <div><span className="text-primary font-bold text-xs font-mono">POND</span><span className="text-xs font-mono font-semibold text-sidebar-foreground">VIEW</span></div>
                <svg
                  width="100%"
                  height="100%"
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
                  className="h-full w-full -mt-2"
                  aria-label="DataChat"
                >
                  <title>Pondview</title>
                  <path
                    d="M1133.333,111.015l0,536.303c0,23.327 -18.938,42.265 -42.265,42.265l-923.803,0c-23.327,0 -42.265,-18.938 -42.265,-42.265l0,-536.303c0,-23.327 18.938,-42.265 42.265,-42.265l923.803,0c23.327,0 42.265,18.938 42.265,42.265Z"
                    style={{ fill: "var(--background)" }}
                  />
                  <g id="water1">
                    <path
                      d="M804.167,291.667l87.5,0l0,16.667l62.5,0l0,16.667l33.333,0l0,20.833l29.167,0l0,12.5l33.333,0l0,16.667l16.667,0l0,20.833l16.667,0l0,83.333l-16.667,0l0,16.667l-12.5,0l0,16.667l-20.833,0l0,16.667l-16.667,0l0,12.5l-29.167,0l0,16.667l-50,0l0,12.5l-50,0l0,12.5l-100,0l0,20.833l-316.667,0l0,-20.833l-95.833,0l0,-16.667l-50,0l0,-16.667l-50,0l0,-16.667l-29.167,0l0,-16.667l-20.833,0l0,-12.5l-12.5,0l0,-16.667l-16.667,0l0,-16.667l-16.667,0l0,-79.167l16.667,0l0,-16.667l16.667,0l0,-16.667l33.333,0l0,-16.667l29.167,0l0,-16.667l33.333,0l0,-16.667l66.667,0l0,-16.667l75,0l0,16.667l-62.5,0l0,12.5l-54.167,0l0,16.667l-45.833,0l0,16.667l-12.5,0l0,16.667l-16.667,0l0,16.667l-16.667,0l0,66.667l12.5,0l0,20.833l33.333,0l0,20.833l33.333,0l0,16.667l45.833,0l0,16.667l66.667,0l0,20.833l387.5,0l0,-20.833l62.5,0l0,-16.667l50,0l0,-16.667l33.333,0l0,-20.833l33.333,0l0,-16.667l16.667,0l0,-62.5l-16.667,0l0,-16.667l-12.5,0l0,-12.5l-20.833,0l0,-20.833l-37.5,0l0,-16.667l-54.167,0l0,-20.833l-70.833,0l0,-16.667Z"
                      style={{
                        fill: "var(--primary)",
                        stroke: "var(--primary)",
                        strokeWidth: "4.17px",
                      }}
                    />
                  </g>
                  <g id="drop">
                    <path
                      d="M550,325c0.218,35.525 0,-50 0,-50l0,-4.167l16.667,0l0,-45.833l16.667,0l0,-25l16.667,0l0,-33.333l20.833,0l0,-16.667l20.833,0l0,16.667l16.667,0l0,33.333l20.833,0l0,29.167l16.667,0l0,45.833l16.667,0l0,83.333l-16.667,0l0,33.333l-16.667,0l0,16.667l-37.5,0l0,4.167l-29.167,0l0,-4.167l-25,0l0,-16.667l-20.833,0l0,-33.333l-16.667,0c0,0 -0.218,-68.858 0,-33.333Z"
                      style={{
                        fill: "var(--primary)",
                        stroke: "var(--primary)",
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
                        fill: "var(--primary)",
                        stroke: "var(--primary)",
                        strokeWidth: "4.17px",
                      }}
                    />
                    <rect
                      x="454.167"
                      y="341.667"
                      width="45.833"
                      height="16.667"
                      style={{
                        fill: "var(--primary)",
                        stroke: "var(--primary)",
                        strokeWidth: "4.17px",
                      }}
                    />
                    <rect
                      x="762.5"
                      y="341.667"
                      width="45.833"
                      height="16.667"
                      style={{
                        fill: "var(--primary)",
                        stroke: "var(--primary)",
                        strokeWidth: "4.17px",
                      }}
                    />
                  </g>
                </svg>
              </div>
              {/* <span className="text-primary font-bold text-2xl">P</span><span className="font-semibold text-sidebar-foreground">NDVIEW</span> */}
            </div>
            <div className="flex items-center gap-1">
              <ThemeToggle />
              <Button
                variant="ghost"
                size="icon"
                onClick={onToggle}
                className="h-8 w-8"
              >
                <PanelLeftClose className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* New Chat Button */}
          <div className="p-3">
            <Link href="/">
              <Button className="w-full justify-start gap-2 bg-primary text-primary-foreground hover:bg-primary/90">
                <Plus className="h-4 w-4" />
                New Analysis
              </Button>
            </Link>
          </div>

          {/* Chat History */}
          <div className="flex-1 overflow-hidden">
            <div className="px-3 py-2">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                History
              </h3>
            </div>
            <ScrollArea className="h-full px-2">
              <div className="space-y-1">
                {recentChats.length > 0 ? (
                  recentChats.map((chat) => (
                    <div key={chat.id} className="group relative">
                      <Link
                        href={`/${chat.id}`}
                        className={cn(
                          "flex w-full flex-col items-start gap-1 group rounded-lg px-3 py-2 text-left transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                          activeChatId === chat.id &&
                          "border-2 border-primary/40 bg-sidebar-primary hover:bg-sidebar-primary/80",
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <MessageSquare className="h-4 w-4 text-muted-foreground" />
                          <span
                            className={cn(
                              "text-sm font-medium text-sidebar-foreground line-clamp-1 group-hover:text-sidebar-accent-foreground",
                              activeChatId === chat.id &&
                              "text-sidebar-primary-foreground",
                            )}
                          >
                            {chat.title || chat.id}
                          </span>
                        </div>
                        <span
                          className={cn(
                            "pl-6 text-xs text-muted-foreground",
                            activeChatId === chat.id &&
                            "text-sidebar-primary-foreground",
                          )}
                        >
                          {formatDate(chat.updatedAt)}
                        </span>
                      </Link>
                      <button
                        type="button"
                        onClick={(e: MouseEvent<HTMLButtonElement>) => {
                          e.preventDefault();
                          e.stopPropagation();
                          void handleDeleteChat(chat.id);
                        }}
                        className="absolute right-2 top-2 p-1 rounded-md z-10 text-muted-foreground hover:text-destructive hover:bg-sidebar-accent/80 transition-all duration-200 opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 backdrop-blur-sm bg-background/80"
                        aria-label="Delete chat"
                        title="Delete chat"
                      >
                        <svg
                          className="w-4 h-4"
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
                  <div className="px-3 text-xs text-muted-foreground">
                    No recent chats
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Settings Section */}
          <div className="border-t border-border p-3 mb-28 md:mb-0">
            <Link href="/dashboards">
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors hover:bg-sidebar-accent"
              >
                <LayoutGrid className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-sidebar-foreground">
                  Dashboards
                </span>
              </button>
            </Link>
            <Link href="/data">
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors hover:bg-sidebar-accent"
              >
                <Database className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-sidebar-foreground">Data</span>
              </button>
            </Link>
            <Link href="/settings">
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors hover:bg-sidebar-accent"
              >
                <Settings className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-sidebar-foreground">
                  Settings
                </span>
              </button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
