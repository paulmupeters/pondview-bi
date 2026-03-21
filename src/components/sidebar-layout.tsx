import { Suspense } from "react";
import type { ChatHistoryEntry } from "@/lib/chat-history";
import { AppSidebar } from "./app-sidebar";

interface SidebarLayoutProps {
  children: React.ReactNode;
  initialChats?: ChatHistoryEntry[];
}

export function SidebarLayout({
  children,
  initialChats = [],
}: SidebarLayoutProps) {
  return (
    <div className="flex h-full w-full">
      <Suspense fallback={null}>
        <AppSidebar initialChats={initialChats} />
      </Suspense>
      <div className="flex-1 overflow-hidden">
        <div className="h-full bg-background/80 backdrop-blur-sm">
          {children}
        </div>
      </div>
    </div>
  );
}
