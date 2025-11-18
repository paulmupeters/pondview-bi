"use client";

import {
  ClockIcon,
  Database,
  LayoutGrid,
  PanelLeft,
  Plus,
  Settings,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { MouseEvent } from "react";
import { useEffect, useState } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useChatHistory } from "@/hooks/use-chat-history";

interface SidebarLayoutProps {
  children: React.ReactNode;
}

interface ChatHistoryPopoverProps {
  onNavigate?: () => void;
}

function ChatHistoryPopover({ onNavigate }: ChatHistoryPopoverProps) {
  const router = useRouter();
  const pathname = usePathname();
  const activeChatId = pathname?.split("/")[1] ?? null;
  const { chats, isLoading, loadChats } = useChatHistory();

  useEffect(() => {
    loadChats();
  }, [loadChats]);

  const handleDeleteChat = async (chatId: string, e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();

    // Check if we're deleting the currently active chat
    const isDeletingActiveChat = chatId === activeChatId;

    // If deleting the active chat, navigate home immediately
    if (isDeletingActiveChat) {
      router.push("/");
      onNavigate?.();
    }

    try {
      const res = await fetch(`/api/chat/${chatId}`, { method: "DELETE" });
      if (!res.ok) {
        // Reload list on failure to restore
        await loadChats();
      } else {
        // Reload to get updated list
        await loadChats();
      }
    } catch {
      // Reload on error to restore
      await loadChats();
    }
  };

  if (isLoading)
    return <p className="text-sm text-muted-foreground">Loading...</p>;

  const handleChatClick = (chatId: string) => {
    router.push(`/${chatId}`);
    onNavigate?.();
  };

  return (
    <div className="p-4 w-64 flex flex-col gap-3">
      {/* Middle Section - Chat History */}
      <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
        {chats.length > 0 ? (
          chats.map((chat) => (
            <div
              key={chat.id}
              className="group relative flex items-center gap-2 rounded-md p-2 hover:bg-accent transition-colors pr-8"
            >
              <button
                type="button"
                onClick={() => handleChatClick(chat.id)}
                className="flex-1 flex justify-between items-start gap-2 text-left cursor-pointer min-w-0"
              >
                <p className="text-sm truncate hover:text-accent-foreground min-w-0 flex-1">
                  {chat.title || chat.id}
                </p>
                <p className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">
                  {new Date(chat.updatedAt).toLocaleDateString()}
                </p>
              </button>
              <button
                type="button"
                onClick={(e) => handleDeleteChat(chat.id, e)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md z-10 text-muted-foreground hover:text-destructive hover:bg-accent/80 transition-all duration-200 opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 backdrop-blur-sm bg-background/80 flex-shrink-0"
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
          <p className="text-sm text-muted-foreground">No chats</p>
        )}
      </div>
    </div>
  );
}

export function SidebarLayout({ children }: SidebarLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isChatHistoryPopoverOpen, setIsChatHistoryPopoverOpen] =
    useState(false);

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const handleChatHistoryPopoverClose = () => {
    setIsChatHistoryPopoverOpen(false);
  };

  return (
    <div className="flex h-full w-full">
      <AppSidebar isOpen={isSidebarOpen} onToggle={toggleSidebar} />
      <div className="flex-1 overflow-hidden relative">
        {/* Toggle button when sidebar is closed */}
        {!isSidebarOpen && (
          <>
            <div className="absolute top-4 left-2 z-50 flex flex-col items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleSidebar}
                className="h-8 w-8 bg-background/80 backdrop-blur-sm border shadow-sm"
              >
                <PanelLeft className="h-4 w-4" />
              </Button>
              <Link href="/">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 bg-background/80 backdrop-blur-sm border shadow-sm"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </Link>
              <Popover
                open={isChatHistoryPopoverOpen}
                onOpenChange={setIsChatHistoryPopoverOpen}
              >
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsChatHistoryPopoverOpen(true)}
                    className="h-8 w-8 bg-background/80 backdrop-blur-sm border shadow-sm"
                  >
                    <ClockIcon className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent>
                  <ChatHistoryPopover
                    onNavigate={handleChatHistoryPopoverClose}
                  />
                </PopoverContent>
              </Popover>
              <ThemeToggle />
            </div>
            <div className="absolute bottom-36 lg:bottom-4 z-50 left-2 flex flex-col gap-2">
              <Link href="/dashboards">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 bg-background/80 backdrop-blur-sm border shadow-sm"
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/data">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 bg-background/80 backdrop-blur-sm border shadow-sm"
                >
                  <Database className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/settings">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 bg-background/80 backdrop-blur-sm border shadow-sm"
                >
                  <Settings className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </>
        )}
        <div className="h-full bg-background/80 backdrop-blur-sm">
          {children}
        </div>
      </div>
    </div>
  );
}
