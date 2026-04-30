import { Check, LayoutDashboard, Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getAnalysisShortcutLabel } from "@/features/analysis/analysis-shortcuts";
import { cn } from "@/lib/utils";

type AnalysisToolbarProps = {
  isBusy: boolean;
  title: string | null;
  onTitleChange: (title: string | null) => void;
  onCreateDashboard: () => void;
  lastSavedAt: number | null;
  isExplorerCollapsed: boolean;
};

function formatRelativeTime(timestamp: number): string {
  const secondsAgo = Math.floor((Date.now() - timestamp) / 1000);
  if (secondsAgo < 5) return "just now";
  if (secondsAgo < 60) return `${secondsAgo}s ago`;
  const minutesAgo = Math.floor(secondsAgo / 60);
  if (minutesAgo < 60) return `${minutesAgo}m ago`;
  const hoursAgo = Math.floor(minutesAgo / 60);
  if (hoursAgo < 24) return `${hoursAgo}h ago`;
  return `${Math.floor(hoursAgo / 24)}d ago`;
}

export function AnalysisToolbar({
  isBusy,
  title,
  onTitleChange,
  onCreateDashboard,
  lastSavedAt,
  isExplorerCollapsed,
}: AnalysisToolbarProps) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState<string>("");
  const dashboardShortcutLabel = getAnalysisShortcutLabel("createDashboard");

  function handleTitleClick() {
    setTitleDraft(title ?? "");
    setEditingTitle(true);
  }

  function handleTitleBlur() {
    const trimmed = titleDraft.trim();
    onTitleChange(trimmed.length > 0 ? trimmed : null);
    setEditingTitle(false);
  }

  function handleTitleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.currentTarget.blur();
    } else if (event.key === "Escape") {
      setEditingTitle(false);
    }
  }

  return (
    <div
      className={cn(
        "flex h-14 items-center gap-3 border-b border-border bg-background/80 backdrop-blur-sm pr-6 transition-[padding] duration-200 ease-out",
        isExplorerCollapsed ? "pl-16" : "pl-6",
      )}
    >
      {editingTitle ? (
        <Input
          autoFocus
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={handleTitleBlur}
          onKeyDown={handleTitleKeyDown}
          className="h-8 w-56 text-sm font-semibold tracking-tight"
          placeholder="Untitled analysis"
        />
      ) : (
        <button
          type="button"
          onClick={handleTitleClick}
          className="cursor-text rounded px-1.5 py-0.5 text-sm font-semibold tracking-tight text-foreground transition-colors hover:bg-muted"
        >
          {title ?? "Untitled analysis"}
        </button>
      )}

      <div className="ml-auto flex items-center gap-3">
        <span className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground/70">
          {isBusy ? (
            <>
              <Loader2 className="size-3 animate-spin" />
              <span className="hidden sm:inline">Saving…</span>
            </>
          ) : lastSavedAt ? (
            <>
              <Check className="size-3" />
              <span>Saved {formatRelativeTime(lastSavedAt)}</span>
            </>
          ) : null}
        </span>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" onClick={onCreateDashboard}>
              <LayoutDashboard className="size-3.5" />
              <span className="hidden sm:inline">Create dashboard</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            Create dashboard{" "}
            <kbd className="ml-1 rounded border border-border/40 bg-muted/40 px-1 py-0.5 font-mono text-[10px]">
              {dashboardShortcutLabel}
            </kbd>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
