import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { DuckdbRepl } from "./repl";

type DuckdbShellDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function DuckdbShellDialog({ open, onOpenChange }: DuckdbShellDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl gap-6 p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>DuckDB Shell</DialogTitle>
        </DialogHeader>
        <div className="px-6 pb-6">
          <DuckdbRepl className="h-[65vh]" />
        </div>
      </DialogContent>
    </Dialog>
  );
}


