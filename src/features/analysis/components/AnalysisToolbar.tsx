import { Check, LayoutDashboard, Loader2, PanelLeft, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getAnalysisExplorerToggleLabel } from "@/features/analysis/analysis-explorer";
import {
  type DefaultPromptMode,
  useDefaultPromptModePreference,
} from "@/lib/default-prompt-mode";

type AnalysisToolbarProps = {
  onAddCell: (mode: DefaultPromptMode) => void;
  isBusy: boolean;
  title: string | null;
  onTitleChange: (title: string | null) => void;
  onCreateDashboard: () => void;
  isExplorerCollapsed: boolean;
  onToggleExplorer: () => void;
  lastSavedAt: number | null;
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

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);
const modKey = isMac ? "\u2318" : "Ctrl+";

export function AnalysisToolbar({
  onAddCell,
  isBusy,
  title,
  onTitleChange,
  onCreateDashboard,
  isExplorerCollapsed,
  onToggleExplorer,
  lastSavedAt,
}: AnalysisToolbarProps) {
  const defaultMode = useDefaultPromptModePreference();
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState<string>("");

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
    <div className="flex flex-wrap items-center gap-3 border-b px-6 py-4">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="outline"
            onClick={onToggleExplorer}
            aria-label={getAnalysisExplorerToggleLabel(isExplorerCollapsed)}
          >
            <PanelLeft />
            {getAnalysisExplorerToggleLabel(isExplorerCollapsed)}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {getAnalysisExplorerToggleLabel(isExplorerCollapsed)}{" "}
          <kbd className="ml-1 rounded border border-border/40 bg-background/20 px-1 py-0.5 font-mono text-[10px]">
            {modKey}B
          </kbd>
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button onClick={() => onAddCell(defaultMode)} disabled={isBusy}>
            <Plus />
            Add cell
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          Add cell{" "}
          <kbd className="ml-1 rounded border border-border/40 bg-background/20 px-1 py-0.5 font-mono text-[10px]">
            {modKey}J
          </kbd>
        </TooltipContent>
      </Tooltip>
      {editingTitle ? (
        <Input
          autoFocus
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={handleTitleBlur}
          onKeyDown={handleTitleKeyDown}
          className="h-8 w-48 text-sm font-medium"
          placeholder="Untitled notebook"
        />
      ) : (
        <button
          type="button"
          onClick={handleTitleClick}
          className="cursor-text rounded px-1 py-0.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {title ?? "Untitled notebook"}
        </button>
      )}
      <div className="ml-auto flex items-center gap-3">
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          {isBusy ? (
            <>
              <Loader2 className="size-3 animate-spin" />
              Saving...
            </>
          ) : lastSavedAt ? (
            <>
              <Check className="size-3" />
              Saved {formatRelativeTime(lastSavedAt)}
            </>
          ) : null}
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" onClick={onCreateDashboard}>
              <LayoutDashboard />
              Create dashboard
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            Create dashboard{" "}
            <kbd className="ml-1 rounded border border-border/40 bg-background/20 px-1 py-0.5 font-mono text-[10px]">
              {modKey}D
            </kbd>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
