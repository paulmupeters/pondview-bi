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
      <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:gap-0.5">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = item.id === activeSection;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onSelect(item.id)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex w-full items-center gap-2.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  "lg:whitespace-normal",
                  isActive
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                <Icon
                  className={cn(
                    "h-4 w-4 shrink-0",
                    isActive ? "text-foreground" : "text-muted-foreground",
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
      className={cn("border-b pb-7 last:border-b-0 last:pb-0", className)}
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
    <div className="flex items-start gap-3 border-b pb-4">
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-muted/40 text-foreground">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      </div>
    </div>
  );
}
