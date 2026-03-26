import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { DuckdbRepl } from "./repl";

type DuckdbShellDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function DuckdbShellDialog({
  open,
  onOpenChange,
}: DuckdbShellDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-w-7xl flex-col gap-0 overflow-hidden rounded-[28px] border border-border/60 bg-card/85 p-0 shadow-[0_28px_80px_-36px_rgba(15,23,42,0.55)] backdrop-blur-sm"
        style={{ height: "85vh" }}
      >
        <DialogHeader className="shrink-0 border-b border-border/60 px-6 py-5">
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
              Query Workbench
            </p>
            <DialogTitle className="text-xl font-semibold tracking-tight">
              DuckDB Shell
            </DialogTitle>
          </div>
        </DialogHeader>
        <div className="min-h-0 flex-1 p-3">
          <DuckdbRepl className="h-full rounded-xl border border-border/70 bg-background/95 shadow-[0_16px_36px_-28px_rgba(15,23,42,0.42)]" />
        </div>
      </DialogContent>
    </Dialog>
  );
}
