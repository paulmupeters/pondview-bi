import { useEffect, useMemo, useRef, useState } from "react";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { MeasuresByName } from "@/lib/dashboard/measures";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { TextConfig } from "@/lib/types";

type TextConfigDialogProps = {
  trigger: React.ReactNode;
  config: TextConfig | null;
  onConfigChange: (config: TextConfig) => void;
  tooltip?: string;
  measures?: MeasuresByName;
};

export function TextConfigDialog({
  trigger,
  config,
  onConfigChange,
  tooltip,
  measures = {},
}: TextConfigDialogProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState<string>(config?.title ?? "");
  const [content, setContent] = useState<string>(config?.content ?? "");
  const [showPreview, setShowPreview] = useState(false);
  const [isMeasurePopoverOpen, setIsMeasurePopoverOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Reset state when dialog opens or config changes
  useEffect(() => {
    if (open) {
      setTitle(config?.title ?? "");
      setContent(config?.content ?? "");
    }
  }, [open, config?.title, config?.content]);

  const canSave = useMemo(
    () => content.trim().length > 0,
    [content],
  );
  const measureEntries = useMemo(
    () =>
      Object.entries(measures).sort(([leftKey], [rightKey]) =>
        leftKey.localeCompare(rightKey),
      ),
    [measures],
  );

  const handleApply = () => {
    if (!canSave) return;
    onConfigChange({
      configType: "text",
      title: title.trim() ? title.trim() : undefined,
      content,
    });
    setOpen(false);
  };

  const insertMeasureToken = (measureName: string) => {
    const token = `{{${measureName}}}`;
    setShowPreview(false);
    setContent((previousContent) => {
      const textarea = textareaRef.current;
      const hasActiveSelection =
        textarea !== null && document.activeElement === textarea;
      const selectionStart = hasActiveSelection
        ? textarea.selectionStart
        : previousContent.length;
      const selectionEnd = hasActiveSelection
        ? textarea.selectionEnd
        : previousContent.length;

      const nextContent =
        previousContent.slice(0, selectionStart) +
        token +
        previousContent.slice(selectionEnd);

      const nextCaretPosition = selectionStart + token.length;
      requestAnimationFrame(() => {
        if (!textareaRef.current) {
          return;
        }
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(
          nextCaretPosition,
          nextCaretPosition,
        );
      });

      return nextContent;
    });
    setIsMeasurePopoverOpen(false);
  };

  const dialogBody = (
    <div className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="text-card-title" className="text-sm font-medium">
          Title (optional)
        </label>
        <Input
          id="text-card-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Text card title"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label htmlFor="text-card-content" className="text-sm font-medium">
            Markdown content
          </label>
          <div className="flex items-center gap-2">
            <Popover
              open={isMeasurePopoverOpen}
              onOpenChange={setIsMeasurePopoverOpen}
            >
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={measureEntries.length === 0}
                >
                  Insert measure
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-2" align="end">
                {measureEntries.length > 0 ? (
                  <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
                    {measureEntries.map(([measureName, measureValue]) => (
                      <button
                        key={measureName}
                        type="button"
                        className="flex w-full flex-col rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted"
                        onClick={() => insertMeasureToken(measureName)}
                      >
                        <span className="text-sm font-medium">
                          {`{{${measureName}}}`}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          Current value: {measureValue || "(empty)"}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                    No measures available yet.
                  </div>
                )}
              </PopoverContent>
            </Popover>
            <Button
              type="button"
              variant={showPreview ? "default" : "outline"}
              size="sm"
              onClick={() => setShowPreview((prev) => !prev)}
            >
              {showPreview ? "Edit" : "Preview"}
            </Button>
          </div>
        </div>
        {showPreview ? (
          <div className="min-h-[200px] rounded-md border border-input bg-background p-3 text-sm">
            {content.trim().length ? (
              <MarkdownRenderer>{content}</MarkdownRenderer>
            ) : (
              <span className="text-muted-foreground">Nothing to preview</span>
            )}
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            id="text-card-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="min-h-[200px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            placeholder="Write markdown here..."
          />
        )}
      </div>

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => setOpen(false)}
        >
          Cancel
        </Button>
        <Button type="button" onClick={handleApply} disabled={!canSave}>
          Apply
        </Button>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {tooltip ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>{trigger}</DialogTrigger>
          </TooltipTrigger>
          <TooltipContent>
            <p>{tooltip}</p>
          </TooltipContent>
        </Tooltip>
      ) : (
        <DialogTrigger asChild>{trigger}</DialogTrigger>
      )}
      <DialogContent className="max-w-2xl bg-card">
        <DialogHeader>
          <DialogTitle>Text Card</DialogTitle>
        </DialogHeader>
        {dialogBody}
      </DialogContent>
    </Dialog>
  );
}
