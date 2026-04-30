import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type SettingsSection = "ai" | "runtime" | "projects" | "appearance";

export type SectionNavItem = {
  id: SettingsSection;
  label: string;
  icon: LucideIcon;
};

export function SettingsNav({
  items,
  activeSection,
  onSelect,
}: {
  items: readonly SectionNavItem[];
  activeSection: SettingsSection;
  onSelect: (id: SettingsSection) => void;
}) {
  return (
    <nav
      aria-label="Settings sections"
      className="w-full shrink-0 lg:sticky lg:top-6 lg:w-56"
    >
      <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:gap-0.5 lg:overflow-visible">
        {items.map((item, i) => {
          const Icon = item.icon;
          const isActive = item.id === activeSection;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onSelect(item.id)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "relative flex w-full items-center gap-2.5 whitespace-nowrap rounded-md px-3 py-2.5 text-sm font-medium transition-all",
                  "lg:whitespace-normal",
                  isActive
                    ? "bg-accent/[0.06] text-foreground"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                )}
              >
                {isActive && (
                  <span className="absolute inset-y-0 left-0 w-[3px] rounded-r-full bg-primary" />
                )}
                <span className="font-mono text-[10px] tabular-nums text-muted-foreground/60">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <Icon
                  className={cn(
                    "h-4 w-4 shrink-0",
                    isActive ? "text-primary" : "text-muted-foreground/60",
                  )}
                />
                <span>{item.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function SettingsContentSection({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-lg border border-border bg-card p-5 border-l-[3px] border-l-primary/30",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function SectionHeader({
  icon: Icon,
  title,
}: {
  icon: LucideIcon;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2.5 border-b border-border pb-4">
      <Icon className="h-4 w-4 text-primary/70" />
      <h2 className="text-lg font-bold tracking-tight text-foreground">
        {title}
      </h2>
    </div>
  );
}
