import { Moon, Sun } from "lucide-react";
import * as React from "react";
import { useTheme } from "@/lib/theme-provider";
import { cn } from "@/lib/utils";

export const ThemeToggle = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button">
>(({ className, ...props }, ref) => {
  const { theme, setTheme } = useTheme();

  const toggleTheme = () => {
    setTheme(theme === "light" ? "dark" : "light");
  };

  return (
    <button
      ref={ref}
      type="button"
      aria-label="Toggle theme"
      className={cn(
        "group relative flex h-9 w-9 items-center justify-center rounded-lg text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
        className,
      )}
      {...props}
      onClick={toggleTheme}
    >
      {theme === "dark" ? (
        <Sun className="size-[18px]" />
      ) : (
        <Moon className="size-[18px]" />
      )}
    </button>
  );
});

ThemeToggle.displayName = "ThemeToggle";
