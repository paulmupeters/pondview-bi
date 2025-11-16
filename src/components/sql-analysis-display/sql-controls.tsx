import { PlayCircleIcon } from "@heroicons/react/24/outline";
import { Code2 } from "lucide-react";
import { type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface SqlControlsProps {
  query: string | null;
  onQueryChange: (query: string) => void;
  onExecute: () => void;
  isExpanded: boolean;
  onToggleExpanded: () => void;
  extraControls?: ReactNode;
  editorId?: string;
}

export function SqlControls({
  query,
  onQueryChange,
  onExecute,
  isExpanded,
  onToggleExpanded,
  extraControls,
  editorId = "sql-editor-analysis",
}: SqlControlsProps) {
  const renderControls = (extraControls?: ReactNode, editorId?: string) => (
    <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
      <button
        type="button"
        onClick={onToggleExpanded}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-input bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="View SQL"
        aria-controls={editorId}
        aria-expanded={isExpanded}
        title="View SQL"
      >
        <Code2 className="h-4 w-4" />
      </button>
      {extraControls}
    </div>
  );

  const renderEditor = (editorId?: string) =>
    isExpanded ? (
      <div className="mt-4 border-t pt-4 transition-all duration-200">
        <div className="flex flex-col gap-3">
          <label htmlFor={editorId} className="text-sm font-medium">
            SQL Query
          </label>
          <Textarea
            id={editorId}
            value={query ?? ""}
            onChange={(e) => onQueryChange(e.target.value)}
            className="min-h-[200px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            placeholder="SELECT * FROM ..."
          />
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onToggleExpanded}
            >
              Close
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={onExecute}
              className="flex items-center gap-2"
            >
              <PlayCircleIcon className="w-4 h-4" />
              Execute
            </Button>
          </div>
        </div>
      </div>
    ) : null;

  return { renderControls, renderEditor };
}
