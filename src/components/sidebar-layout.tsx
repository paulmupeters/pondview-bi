import { Suspense } from "react";
import type { ChatHistoryEntry } from "@/lib/chat-history";
import { AppSidebar } from "./app-sidebar";
import { BottomNavBar } from "./bottom-nav-bar";

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
        <div className="h-full bg-background/80 backdrop-blur-sm pb-14 md:pb-0">
          {children}
        </div>
      </div>
      <Suspense fallback={null}>
        <BottomNavBar initialChats={initialChats} />
      </Suspense>
    </div>
  );
}
