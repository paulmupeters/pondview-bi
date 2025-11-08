"use client";

import { Command } from "cmdk";
import {
  Database,
  LayoutGrid,
  MessageSquare,
  Moon,
  Settings,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useTheme } from "@/lib/theme-provider";

interface CommandItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  shortcut?: string[];
  perform: () => void;
}

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = useState("");
  const { theme, setTheme } = useTheme();

  // Define navigation commands to match the app's routes
  const commands: CommandItem[] = useMemo(
    () => [
      {
        id: "home",
        label: "Home",
        icon: <MessageSquare size={16} />,
        shortcut: ["1"],
        perform: () => router.push("/"),
      },
      {
        id: "dashboards",
        label: "Dashboards",
        icon: <LayoutGrid size={16} />,
        shortcut: ["2"],
        perform: () => router.push("/dashboards"),
      },
      {
        id: "data",
        label: "Data",
        icon: <Database size={16} />,
        shortcut: ["3"],
        perform: () => router.push("/data"),
      },
      {
        id: "settings",
        label: "Settings",
        icon: <Settings size={16} />,
        shortcut: ["4"],
        perform: () => router.push("/settings"),
      },
      {
        id: "toggle-theme",
        label: "Toggle Dark Mode",
        icon: <Moon size={16} />,
        shortcut: ["5"],
        perform: () => {
          if (theme === "light") {
            setTheme("dark");
          } else {
            setTheme("light");
          }
        },
      },
    ],
    [router, theme, setTheme],
  );

  // Toggle the menu when ⌘K is pressed
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const handleNumberKey = useCallback(
    (e: KeyboardEvent) => {
      // Only handle number keys when the command palette is open
      if (!open) return;

      const key = e.key;
      const numberKeys = ["1", "2", "3", "4", "5"];

      if (numberKeys.includes(key)) {
        e.preventDefault();
        const index = Number.parseInt(key) - 1;
        if (commands[index]) {
          commands[index].perform();
          setOpen(false);
          setSearch("");
        }
      }
    },
    [open, commands],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleNumberKey);
    return () => document.removeEventListener("keydown", handleNumberKey);
  }, [handleNumberKey]);

  // Listen for programmatic open/toggle/close events
  useEffect(() => {
    const onOpen = (_e: Event) => setOpen(true);
    const onToggle = (_e: Event) => setOpen((prev) => !prev);
    const onClose = (_e: Event) => setOpen(false);

    window.addEventListener("open-command-palette", onOpen);
    window.addEventListener("toggle-command-palette", onToggle);
    window.addEventListener("close-command-palette", onClose);

    return () => {
      window.removeEventListener("open-command-palette", onOpen);
      window.removeEventListener("toggle-command-palette", onToggle);
      window.removeEventListener("close-command-palette", onClose);
    };
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="p-0 gap-0 max-w-md">
        <DialogTitle className="sr-only">Command Menu</DialogTitle>
        <Command label="Global Command Menu" shouldFilter={false}>
          <div className="p-4 border-b border-border">
            <Command.Input
              value={search}
              onValueChange={setSearch}
              placeholder="Type a command or search..."
              className="w-full px-3 py-2 text-sm bg-transparent border-none outline-none placeholder:text-muted-foreground"
            />
          </div>

          <Command.List className="max-h-76 overflow-y-auto p-2">
            <Command.Empty className="px-3 py-2 text-sm text-muted-foreground">
              No results found.
            </Command.Empty>

            {commands
              .filter((command) => {
                if (!search) return true;
                const searchText = search.toLowerCase();
                return command.label.toLowerCase().includes(searchText);
              })
              .map((command) => (
                <Command.Item
                  key={command.id}
                  onSelect={() => {
                    command.perform();
                    setOpen(false);
                    setSearch("");
                  }}
                  className="px-3 py-2 text-sm rounded-md cursor-pointer hover:bg-muted aria-selected:bg-muted data-[selected=true]:bg-muted aria-selected:text-foreground flex items-center justify-between transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {command.icon}
                    <span>{command.label}</span>
                  </div>
                  {command.shortcut && (
                    <div className="flex gap-1">
                      {command.shortcut.map((key) => (
                        <kbd
                          key={key}
                          className="px-1.5 py-0.5 text-xs bg-muted rounded"
                        >
                          {key}
                        </kbd>
                      ))}
                    </div>
                  )}
                </Command.Item>
              ))}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
