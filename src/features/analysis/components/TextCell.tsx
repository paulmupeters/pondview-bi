import { Eye, Pencil } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { Button } from "@/components/ui/button";
import type { AnalysisCellState } from "@/features/analysis/analysis-reducer";
import type { NotebookSession } from "@/hooks/use-notebook-session";

type TextCellProps = {
  cell: AnalysisCellState;
  notebookSession: NotebookSession;
};

export function TextCell({ cell, notebookSession }: TextCellProps) {
  const [content, setContent] = useState(cell.promptText ?? "");
  const [showPreview, setShowPreview] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestContentRef = useRef(content);
  latestContentRef.current = content;
  const cellIdRef = useRef(cell.id);

  // Reset local state only when switching to a different cell
  if (cellIdRef.current !== cell.id) {
    cellIdRef.current = cell.id;
    setContent(cell.promptText ?? "");
  }

  const saveContent = useCallback(
    (value: string) => {
      void notebookSession.updateCell(cell.id, { promptText: value });
    },
    [cell.id, notebookSession],
  );

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setContent(value);

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => {
      saveContent(value);
    }, 500);
  };

  // Auto-switch to preview when content is present and user hasn't interacted
  const hasContent = content.trim().length > 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          Markdown
        </span>
        {hasContent && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => setShowPreview((prev) => !prev)}
          >
            {showPreview ? (
              <>
                <Pencil className="size-3" />
                Edit
              </>
            ) : (
              <>
                <Eye className="size-3" />
                Preview
              </>
            )}
          </Button>
        )}
      </div>
      {showPreview ? (
        <div className="min-h-[80px] rounded-md border border-input bg-background p-3 text-sm">
          <MarkdownRenderer>{content}</MarkdownRenderer>
        </div>
      ) : (
        <textarea
          value={content}
          onChange={handleChange}
          className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          placeholder="Write markdown content here... This will become a text card on the dashboard."
        />
      )}
    </div>
  );
}
