import { Squares2X2Icon } from "@heroicons/react/24/outline";
import { Eye, Pencil } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { AddToDashboardDialog } from "@/components/add-to-dashboard-dialog";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { Button } from "@/components/ui/button";
import type { AnalysisCellState } from "@/features/analysis/analysis-reducer";
import type { NotebookSession } from "@/hooks/use-notebook-session";
import type { TextConfig } from "@/lib/types";

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

  const hasContent = content.trim().length > 0;
  const textConfig: TextConfig = {
    configType: "text",
    content,
  };

  return (
    <div className="space-y-3 rounded-lg border border-border/70 bg-background px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-primary/35" />
          <span className="font-mono text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground/60">
            Markdown annotation
          </span>
        </div>
        <div className="flex items-center gap-1">
          {hasContent ? (
            <AddToDashboardDialog
              trigger={
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                >
                  <Squares2X2Icon className="size-3" />
                  Add to dashboard
                </Button>
              }
              sql="SELECT 1"
              visualOptions={[
                {
                  type: "text",
                  config: textConfig,
                },
              ]}
              defaultVisualType="text"
            />
          ) : null}
          {hasContent && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs text-muted-foreground"
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
      </div>
      {showPreview ? (
        <div className="min-h-[96px] max-w-3xl rounded-md border border-border/60 bg-card px-5 py-4 text-sm leading-relaxed">
          <MarkdownRenderer>{content}</MarkdownRenderer>
        </div>
      ) : (
        <textarea
          value={content}
          onChange={handleChange}
          className="min-h-[104px] w-full rounded-md border border-border/60 bg-card px-4 py-3 text-sm leading-relaxed ring-offset-background placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          placeholder="Write markdown notes, interpretation, or assumptions..."
        />
      )}
    </div>
  );
}
