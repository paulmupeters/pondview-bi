import { LayoutDashboard, PanelLeft, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
};

export function AnalysisToolbar({
  onAddCell,
  isBusy,
  title,
  onTitleChange,
  onCreateDashboard,
  isExplorerCollapsed,
  onToggleExplorer,
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
      <Button
        type="button"
        variant="outline"
        onClick={onToggleExplorer}
        aria-label={getAnalysisExplorerToggleLabel(isExplorerCollapsed)}
      >
        <PanelLeft />
        {getAnalysisExplorerToggleLabel(isExplorerCollapsed)}
      </Button>
      <Button onClick={() => onAddCell(defaultMode)} disabled={isBusy}>
        <Plus />
        Add cell
      </Button>
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
      <div className="ml-auto">
        <Button variant="outline" size="sm" onClick={onCreateDashboard}>
          <LayoutDashboard />
          Create dashboard
        </Button>
      </div>
    </div>
  );
}
