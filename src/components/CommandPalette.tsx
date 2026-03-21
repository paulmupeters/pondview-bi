import { Command } from "cmdk";
import {
  Database,
  LayoutGrid,
  MessageSquare,
  Moon,
  Palette,
  Settings,
} from "lucide-react";
import * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  applyCustomCss,
  applyTheme,
  getSelectedTheme,
  setSelectedTheme as setThemeInStorage,
} from "@/lib/custom-css";
import { useTheme } from "@/lib/theme-provider";
import { getAllThemes } from "@/themes";
import { useRouter } from "@/vite/next-navigation";

interface CommandItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  shortcut?: string[];
  perform: () => void;
}

const CUSTOM_THEME_VALUE = "custom";

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = useState("");
  const { theme, setTheme } = useTheme();
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);
  const [hasCustomCss, setHasCustomCss] = useState(false);
  const availableThemes = useMemo(() => getAllThemes(), []);
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const commandListRef = React.useRef<HTMLDivElement | null>(null);
  const lastPreviewedCommandIdRef = React.useRef<string | null>(null);

  useEffect(() => {
    try {
      const savedTheme = getSelectedTheme();
      const savedCss = localStorage.getItem("CUSTOM_CSS") || "";
      setSelectedTheme(savedTheme ?? (savedCss ? CUSTOM_THEME_VALUE : null));
      setHasCustomCss(Boolean(savedCss));
    } catch {
      // no-op
    }
  }, []);

  const handleThemeChange = useCallback((themeName: string) => {
    try {
      if (themeName === CUSTOM_THEME_VALUE) {
        const savedCss = localStorage.getItem("CUSTOM_CSS") || "";
        setSelectedTheme(CUSTOM_THEME_VALUE);
        setThemeInStorage(null);
        setHasCustomCss(Boolean(savedCss));
        if (savedCss) {
          applyCustomCss(savedCss);
        }
      } else {
        setSelectedTheme(themeName);
        setHasCustomCss(false);
        applyTheme(themeName);
        localStorage.removeItem("CUSTOM_CSS");
      }
    } catch (error) {
      console.error("Failed to change theme", error);
    } finally {
      setOpen(false);
      setSearch("");
    }
  }, []);

  const previewTheme = useCallback((themeName: string) => {
    try {
      if (themeName === CUSTOM_THEME_VALUE) {
        const savedCss = localStorage.getItem("CUSTOM_CSS") || "";
        if (!savedCss) return;
        applyCustomCss(savedCss);
        return;
      }

      applyTheme(themeName);
    } catch (error) {
      console.error("Failed to preview theme", error);
    }
  }, []);

  // Define navigation commands to match the app's routes
  const navigationCommands: CommandItem[] = useMemo(
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
      {
        id: "change-theme-menu",
        label: "Change theme",
        icon: <Palette size={16} />,
        shortcut: ["6"],
        perform: () => {
          setShowThemeMenu(true);
          setSearch("");
        },
      },
    ],
    [router, theme, setTheme],
  );

  const themeCommands: CommandItem[] = useMemo(() => {
    const baseCommands = availableThemes.map((themeOption) => ({
      id: `theme-${themeOption.name}`,
      label: `Switch to ${themeOption.displayName}${
        selectedTheme === themeOption.name ? " (current)" : ""
      }`,
      icon: <Palette size={16} />,
      perform: () => handleThemeChange(themeOption.name),
    }));

    if (hasCustomCss) {
      baseCommands.push({
        id: "theme-custom",
        label: `Use Custom Theme${
          selectedTheme === CUSTOM_THEME_VALUE ? " (current)" : ""
        }`,
        icon: <Palette size={16} />,
        perform: () => handleThemeChange(CUSTOM_THEME_VALUE),
      });
    }

    baseCommands.unshift({
      id: "theme-back",
      label: "Back",
      icon: <Settings size={16} />,
      perform: () => {
        setShowThemeMenu(false);
        setSearch("");
      },
    });

    return baseCommands;
  }, [availableThemes, handleThemeChange, hasCustomCss, selectedTheme]);

  const commands = useMemo(
    () => (showThemeMenu ? themeCommands : navigationCommands),
    [navigationCommands, showThemeMenu, themeCommands],
  );

  const shouldKeepPaletteOpen = useCallback(
    (commandId: string) =>
      commandId === "change-theme-menu" || commandId === "theme-back",
    [],
  );

  const previewThemeFromCommandId = useCallback(
    (commandId: string) => {
      if (!showThemeMenu) return;
      if (commandId === "theme-back") return;
      if (!commandId.startsWith("theme-")) return;
      if (lastPreviewedCommandIdRef.current === commandId) return;

      const themeName = commandId.slice("theme-".length);
      previewTheme(themeName);
      lastPreviewedCommandIdRef.current = commandId;
    },
    [previewTheme, showThemeMenu],
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
      if (!open) return;

      const key = e.key;
      const matchedCommand = commands.find((command) =>
        command.shortcut?.includes(key),
      );

      if (matchedCommand) {
        e.preventDefault();
        matchedCommand.perform();
        if (!shouldKeepPaletteOpen(matchedCommand.id)) {
          setOpen(false);
          setSearch("");
        }
      }
    },
    [open, commands, shouldKeepPaletteOpen],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleNumberKey);
    return () => document.removeEventListener("keydown", handleNumberKey);
  }, [handleNumberKey]);

  useEffect(() => {
    if (!open) {
      setShowThemeMenu(false);
      setSearch("");
    }
  }, [open]);

  useEffect(() => {
    if (!showThemeMenu) {
      lastPreviewedCommandIdRef.current = null;
    }
  }, [showThemeMenu]);

  useEffect(() => {
    if (!open || !showThemeMenu || !commandListRef.current) return;

    const listElement = commandListRef.current;
    const applySelectedPreview = () => {
      const selectedItem = listElement.querySelector<HTMLElement>(
        "[cmdk-item][data-selected='true']",
      );
      const commandId = selectedItem?.dataset.commandId;
      if (commandId) {
        previewThemeFromCommandId(commandId);
      }
    };

    applySelectedPreview();

    const observer = new MutationObserver((mutations) => {
      if (
        mutations.some((mutation) => mutation.attributeName === "data-selected")
      ) {
        applySelectedPreview();
      }
    });

    observer.observe(listElement, {
      attributes: true,
      subtree: true,
      attributeFilter: ["data-selected"],
    });

    return () => observer.disconnect();
  }, [open, previewThemeFromCommandId, showThemeMenu]);

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

          <Command.List
            ref={commandListRef}
            className="max-h-76 overflow-y-auto p-2"
          >
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
                  data-command-id={command.id}
                  onMouseEnter={() => previewThemeFromCommandId(command.id)}
                  onSelect={() => {
                    command.perform();
                    // Don't close dialog for menu navigation commands
                    if (!shouldKeepPaletteOpen(command.id)) {
                      setOpen(false);
                      setSearch("");
                    }
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
