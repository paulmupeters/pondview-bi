"use client";

import {
  ClockIcon,
  Database,
  LayoutGrid,
  PanelLeft,
  Plus,
  PlusIcon,
  Settings,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  const { chats, isLoading, loadChats } = useChatHistory();

  useEffect(() => {
    loadChats();
  }, [loadChats]);

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
            <button
              type="button"
              key={chat.id}
              onClick={() => handleChatClick(chat.id)}
              className="flex justify-between items-start gap-2 rounded-md p-2 text-left hover:bg-accent transition-colors cursor-pointer"
            >
              <p className="text-sm truncate hover:text-accent-foreground">
                {chat.title || chat.id}
              </p>
              <p className="text-xs text-muted-foreground whitespace-nowrap">
                {new Date(chat.updatedAt).toLocaleDateString()}
              </p>
            </button>
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
            <div className="absolute top-4 left-4 z-50 flex flex-col items-center gap-2">
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
            <div className="absolute bottom-4 z-50 left-4 flex flex-col gap-2">
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
