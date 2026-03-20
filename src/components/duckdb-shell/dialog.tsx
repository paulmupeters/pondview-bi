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
        className="max-w-7xl gap-0 p-0 flex flex-col"
        style={{ height: "85vh" }}
      >
        <DialogHeader className="px-6 pt-6 pb-4 shrink-0">
          <DialogTitle>DuckDB Shell</DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 px-6 pb-6">
          <DuckdbRepl className="h-full" />
        </div>
      </DialogContent>
    </Dialog>
  );
}
