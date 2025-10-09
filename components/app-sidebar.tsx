"use client";

import {
  BanknotesIcon,
  Bars3Icon,
  BookOpenIcon,
  ClockIcon,
  FolderIcon,
  HomeIcon,
  PencilIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ConnectDataDialog } from "@/components/connect-data-dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  useSidebar,
} from "@/components/ui/sidebar";

export function AppSidebar() {
  const [isConnectDialogOpen, setIsConnectDialogOpen] = useState(false);
  const [isAnalysisOpen, setIsAnalysisOpen] = useState(false);
  const [isDashboardsOpen, setIsDashboardsOpen] = useState(false);
  const [isDataSourcesOpen, setIsDataSourcesOpen] = useState(false);
  const { open, toggleSidebar } = useSidebar();
  const [recentChats, setRecentChats] = useState<
    { id: string; title: string | null; updatedAt: number }[]
  >([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/chats", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as {
          chats: { id: string; title: string | null; updatedAt: number }[];
        };
        if (!cancelled) setRecentChats(data.chats ?? []);
      } catch { }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Sidebar
      variant="inset"
      collapsible="icon"
      className="group-data-[side=left]:border-r-0 bg-sidebar"
    >
      <SidebarHeader className="border-b border-sidebar-border pb-6">
        <SidebarMenu>
          <div className="flex flex-col gap-6 pt-4">
            <div
              className={`flex justify-between items-center gap-3 px-2 rounded-xl ${open ? "" : "flex-col"}`}
            >
              <button
                type="button"
                onClick={toggleSidebar}
                className="flex text-sidebar-foreground hover:text-primary transition-colors"
              >
                <Bars3Icon className="w-4 h-4" />
              </button>
              {open ? (
                <span className="font-mono text-sidebar-foreground">
                  Data Assistant AI
                </span>
              ) : (
                <span className="font-mono text-md text-sidebar-foreground">
                    ⡿Ai⣷
                </span>
              )}
            </div>
          </div>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="px-4 py-6 mt-4 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:py-0">
        <nav className="space-y-8">
          {/* Recent chats - expanded */}
          <div className="group-data-[collapsible=icon]:hidden">
            <div className="flex items-center gap-2 my-4">
              <ClockIcon className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Recent
              </h2>
              <div className="flex-1 h-px ml-2"></div>
              <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
                {recentChats.length}
              </span>
            </div>
            {recentChats.length > 0 ? (
              <ul className="space-y-2">
                {recentChats.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/${c.id}`}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-all duration-200 group"
                    >
                      <div className="w-4 h-4 bg-muted rounded flex items-center justify-center">
                        <div className="w-2 h-2 bg-muted-foreground rounded-full"></div>
                      </div>
                      <span className="truncate max-w-[180px]">
                        {c.title || c.id}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="px-3 text-xs text-muted-foreground">
                No recent chats
              </div>
            )}
          </div>

          {/* Recent chats - collapsed */}
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="hidden group-data-[collapsible=icon]:flex items-center justify-center w-full p-0 hover:bg-sidebar-accent rounded-lg transition-colors"
              >
                <ClockIcon className="w-4 h-4 text-muted-foreground" />
              </button>
            </PopoverTrigger>
            <PopoverContent side="right" align="start" className="w-56 p-2">
              <div className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Recent
              </div>
              {recentChats.length > 0 ? (
                <ul className="space-y-1">
                  {recentChats.map((c) => (
                    <li key={c.id}>
                      <Link
                        href={`/${c.id}`}
                        className="flex items-center gap-3 px-2 py-1 rounded hover:bg-accent text-sm"
                      >
                        <div className="w-4 h-4 bg-muted rounded flex items-center justify-center">
                          <div className="w-2 h-2 bg-muted-foreground rounded-full"></div>
                        </div>
                        <span className="truncate">{c.title || c.id}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="px-2 text-xs text-muted-foreground">
                  No recent chats
                </div>
              )}
            </PopoverContent>
          </Popover>

          <div className="group-data-[collapsible=icon]:hidden">
            <div className="flex items-center gap-2 my-4">
              <HomeIcon className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                Home
              </h2>
              <div className="flex-1 h-px ml-2"></div>
              <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
                1
              </span>
            </div>
          </div>

          <button
            type="button"
            className="hidden group-data-[collapsible=icon]:flex items-center justify-center w-full p-0 hover:bg-sidebar-accent rounded-lg transition-colors"
          >
            <HomeIcon className="w-4 h-4 text-muted-foreground" />
          </button>

          <div className="group-data-[collapsible=icon]:hidden">
            <Collapsible open={isAnalysisOpen} onOpenChange={setIsAnalysisOpen}>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-2 mb-4 w-full hover:opacity-80 transition-opacity"
                >
                  <FolderIcon className="w-4 h-4 text-muted-foreground" />
                  <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                    Analysis
                  </h2>
                  <div className="flex-1 h-px ml-2"></div>
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
                    2
                  </span>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <ul className="space-y-2">
                  <li>
                    <Link
                      href="/"
                      className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-all duration-200 group"
                    >
                      <div className="w-4 h-4 bg-destructive/20 rounded flex items-center justify-center">
                        <div className="w-2 h-2 bg-destructive rounded-full"></div>
                      </div>
                      <span>Burndown Rate Analysis</span>
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/"
                      className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-all duration-200 group"
                    >
                      <div className="w-4 h-4 bg-chart-1/20 rounded flex items-center justify-center">
                        <div className="w-2 h-2 bg-chart-1 rounded-full"></div>
                      </div>
                      <span>Sales Chart Analysis</span>
                    </Link>
                  </li>
                </ul>
              </CollapsibleContent>
            </Collapsible>
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="hidden group-data-[collapsible=icon]:flex items-center justify-center w-full p-0 hover:bg-sidebar-accent rounded-lg transition-colors"
              >
                <FolderIcon className="w-4 h-4 text-muted-foreground" />
              </button>
            </PopoverTrigger>
            <PopoverContent side="right" align="start" className="w-48 p-2">
              <div className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Analysis
              </div>
              <ul className="space-y-1">
                <li>
                  <Link
                    href="/"
                    className="flex items-center gap-3 px-2 py-1 rounded hover:bg-accent text-sm"
                  >
                    <div className="w-4 h-4 bg-destructive/20 rounded flex items-center justify-center">
                      <div className="w-2 h-2 bg-destructive rounded-full"></div>
                    </div>
                    <span>Burndown Rate Analysis</span>
                  </Link>
                </li>
                <li>
                  <Link
                    href="/"
                    className="flex items-center gap-3 px-2 py-1 rounded hover:bg-accent text-sm"
                  >
                    <div className="w-4 h-4 bg-chart-1/20 rounded flex items-center justify-center">
                      <div className="w-2 h-2 bg-chart-1 rounded-full"></div>
                    </div>
                    <span>Sales Chart Analysis</span>
                  </Link>
                </li>
              </ul>
            </PopoverContent>
          </Popover>

          <div className="group-data-[collapsible=icon]:hidden">
            <Collapsible
              open={isDashboardsOpen}
              onOpenChange={setIsDashboardsOpen}
            >
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-2 mb-4 w-full hover:opacity-80 transition-opacity"
                >
                  <PencilIcon className="w-4 h-4 text-muted-foreground" />
                  <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                    Dashboards
                  </h2>
                  <div className="flex-1 h-px ml-2"></div>
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
                    3
                  </span>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <ul className="space-y-2">
                  <li>
                    <Link
                      href="/"
                      className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-all duration-200 group"
                    >
                      <div className="w-4 h-4 bg-chart-2/20 rounded flex items-center justify-center">
                        <div className="w-2 h-2 bg-chart-2 rounded-full"></div>
                      </div>
                      <span>Burndown Rate Dashboard</span>
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/"
                      className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-all duration-200 group"
                    >
                      <div className="w-4 h-4 bg-chart-3/20 rounded flex items-center justify-center">
                        <div className="w-2 h-2 bg-chart-3 rounded-full"></div>
                      </div>
                      <span>Sales Chart Dashboard</span>
                    </Link>
                  </li>
                </ul>
              </CollapsibleContent>
            </Collapsible>
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="hidden group-data-[collapsible=icon]:flex items-center justify-center w-full p-0 hover:bg-sidebar-accent rounded-lg transition-colors"
              >
                <PencilIcon className="w-4 h-4 text-muted-foreground" />
              </button>
            </PopoverTrigger>
            <PopoverContent side="right" align="start" className="w-48 p-2">
              <div className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Dashboards
              </div>
              <ul className="space-y-1">
                <li>
                  <Link
                    href="/"
                    className="flex items-center gap-3 px-2 py-1 rounded hover:bg-accent text-sm"
                  >
                    <div className="w-4 h-4 bg-chart-2/20 rounded flex items-center justify-center">
                      <div className="w-2 h-2 bg-chart-2 rounded-full"></div>
                    </div>
                    <span>Burndown Rate Dashboard</span>
                  </Link>
                </li>
                <li>
                  <Link
                    href="/"
                    className="flex items-center gap-3 px-2 py-1 rounded hover:bg-accent text-sm"
                  >
                    <div className="w-4 h-4 bg-chart-3/20 rounded flex items-center justify-center">
                      <div className="w-2 h-2 bg-chart-3 rounded-full"></div>
                    </div>
                    <span>Sales Chart Dashboard</span>
                  </Link>
                </li>
              </ul>
            </PopoverContent>
          </Popover>

          <div className="group-data-[collapsible=icon]:hidden">
            <Collapsible
              open={isDataSourcesOpen}
              onOpenChange={setIsDataSourcesOpen}
            >
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-2 mb-4 w-full hover:opacity-80 transition-opacity"
                >
                  <BanknotesIcon className="w-4 h-4 text-muted-foreground" />
                  <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                    Data Sources
                  </h2>
                  <div className="flex-1 h-px ml-2"></div>
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
                    4
                  </span>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <ul className="space-y-2">
                  <li>
                    <Link
                      href="/"
                      className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-all duration-200 group"
                    >
                      <PlusIcon className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                      <span>Upload Data</span>
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/view-data"
                      className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-all duration-200 group"
                    >
                      <BookOpenIcon className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                      <span>View Data</span>
                    </Link>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={() => setIsConnectDialogOpen(true)}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-sidebar-foreground transition-all duration-200 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground group"
                    >
                      <div className="w-4 h-4 bg-primary rounded flex items-center justify-center">
                        <div className="w-1.5 h-1.5 bg-primary-foreground rounded-full"></div>
                      </div>
                      <span>Connect Data</span>
                    </button>
                  </li>
                </ul>
              </CollapsibleContent>
            </Collapsible>
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="hidden group-data-[collapsible=icon]:flex items-center justify-center w-full p-0 hover:bg-sidebar-accent rounded-lg transition-colors"
              >
                <BanknotesIcon className="w-4 h-4 text-muted-foreground" />
              </button>
            </PopoverTrigger>
            <PopoverContent side="right" align="start" className="w-48 p-2">
              <div className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Data Sources
              </div>
              <ul className="space-y-1">
                <li>
                  <Link
                    href="/"
                    className="flex items-center gap-3 px-2 py-1 rounded hover:bg-accent text-sm"
                  >
                    <PlusIcon className="w-4 h-4" />
                    <span>Upload Data</span>
                  </Link>
                </li>
                <li>
                  <Link
                    href="/view-data"
                    className="flex items-center gap-3 px-2 py-1 rounded hover:bg-accent text-sm"
                  >
                    <BookOpenIcon className="w-4 h-4" />
                    <span>View Data</span>
                  </Link>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => setIsConnectDialogOpen(true)}
                    className="flex w-full items-center gap-3 px-2 py-1 rounded hover:bg-accent text-left text-sm"
                  >
                    <div className="w-4 h-4 bg-primary rounded flex items-center justify-center">
                      <div className="w-1.5 h-1.5 bg-primary-foreground rounded-full"></div>
                    </div>
                    <span>Connect Data</span>
                  </button>
                </li>
              </ul>
            </PopoverContent>
          </Popover>
        </nav>
      </SidebarContent>
      <ConnectDataDialog
        open={isConnectDialogOpen}
        onOpenChange={setIsConnectDialogOpen}
      />
    </Sidebar>
  );
}
