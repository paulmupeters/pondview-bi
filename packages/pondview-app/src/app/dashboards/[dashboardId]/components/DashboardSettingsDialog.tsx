import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type DashboardSettingsDialogProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

export function DashboardSettingsDialog({
  isOpen,
  onOpenChange,
}: DashboardSettingsDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="default">
          <Settings className="h-4 w-4" />
          Settings
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Dashboard Settings</DialogTitle>
          <DialogDescription>
            Configure your dashboard filters.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-6 py-4">
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">Filters</h3>
            <div className="rounded-md border bg-muted/20 p-4 text-sm text-muted-foreground">
              Manage filters from the slicer bar in dashboard view. Available
              dimensions are discovered from the active SQL runtime.
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
