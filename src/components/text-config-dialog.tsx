import { useEffect, useMemo, useState } from "react";
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
};

export function TextConfigDialog({
  trigger,
  config,
  onConfigChange,
  tooltip,
}: TextConfigDialogProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState<string>(config?.title ?? "");
  const [content, setContent] = useState<string>(config?.content ?? "");
  const [showPreview, setShowPreview] = useState(false);

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

  const handleApply = () => {
    if (!canSave) return;
    onConfigChange({
      configType: "text",
      title: title.trim() ? title.trim() : undefined,
      content,
    });
    setOpen(false);
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
          <Button
            type="button"
            variant={showPreview ? "default" : "outline"}
            size="sm"
            onClick={() => setShowPreview((prev) => !prev)}
          >
            {showPreview ? "Edit" : "Preview"}
          </Button>
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
