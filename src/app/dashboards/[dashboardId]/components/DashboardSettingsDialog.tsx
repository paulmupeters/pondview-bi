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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";

type DashboardSettingsDialogProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  columns: number;
  onColumnsChange: (value: string) => void;
  autoFitRows: boolean;
  onAutoFitChange: (checked: boolean) => void;
};

export function DashboardSettingsDialog({
  isOpen,
  onOpenChange,
  columns,
  onColumnsChange,
  autoFitRows,
  onAutoFitChange,
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
            Configure your dashboard layout preferences and filters.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-6 py-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="columns-select" className="text-sm font-medium">
              Number of Columns
            </label>
            <Select value={columns.toString()} onValueChange={onColumnsChange}>
              <SelectTrigger id="columns-select" className="w-full">
                <SelectValue placeholder="Select columns" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 Column</SelectItem>
                <SelectItem value="2">2 Columns</SelectItem>
                <SelectItem value="3">3 Columns</SelectItem>
                <SelectItem value="4">4 Columns</SelectItem>
                <SelectItem value="5">5 Columns</SelectItem>
                <SelectItem value="6">6 Columns</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between rounded-md border p-4">
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">
                Auto-fit under-filled rows
              </span>
              <span className="text-xs text-muted-foreground">
                When a row has empty slots, stretch its charts to fill the
                available columns.
              </span>
            </div>
            <Toggle
              aria-label="Toggle auto-fit rows"
              pressed={autoFitRows}
              onPressedChange={onAutoFitChange}
              variant="outline"
            >
              {autoFitRows ? "On" : "Off"}
            </Toggle>
          </div>
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
