"use client";

import { useState } from "react";
import { AppSidebar } from "@/components/app-sidebar";

interface SidebarLayoutProps {
  children: React.ReactNode;
}

export function SidebarLayout({ children }: SidebarLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  return (
    <div className="flex h-full w-full">
      <AppSidebar isOpen={isSidebarOpen} onToggle={toggleSidebar} />
      <div className="flex-1 overflow-hidden">
        <div className="h-full bg-background/80 backdrop-blur-sm">
          {children}
        </div>
      </div>
    </div>
  );
}
