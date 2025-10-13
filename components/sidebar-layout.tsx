"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppSidebar } from "@/components/app-sidebar";

interface SidebarLayoutProps {
  children: React.ReactNode;
}

export function SidebarLayout({ children }: SidebarLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const pathname = usePathname();

  // Auto-close sidebar when navigating to chat pages
  useEffect(() => {
    // Check if current path is a chat page (contains a chatId)
    const isChatPage = pathname && pathname !== "/" && !pathname.startsWith("/view-data") && !pathname.startsWith("/api");
    
    if (isChatPage) {
      setIsSidebarOpen(false);
    } else {
      // Reopen sidebar when navigating back to home or other pages
      setIsSidebarOpen(true);
    }
  }, [pathname]);

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  return (
    <div className="flex h-full w-full">
      <AppSidebar isOpen={isSidebarOpen} onToggle={toggleSidebar} />
      <div className="flex-1 overflow-hidden relative">
        {/* Toggle button when sidebar is closed */}
        {!isSidebarOpen && (
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            className="absolute top-4 left-4 z-50 h-8 w-8 bg-background/80 backdrop-blur-sm border shadow-sm"
          >
            <PanelLeft className="h-4 w-4" />
          </Button>
        )}
        <div className="h-full bg-background/80 backdrop-blur-sm">
          {children}
        </div>
      </div>
    </div>
  );
}
