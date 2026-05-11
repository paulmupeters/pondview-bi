import { Settings2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { TableConfig } from "@/lib/types";

interface TableConfigDialogProps {
  trigger: React.ReactNode;
  config: TableConfig | null;
  columns?: Array<{ name: string }>;
  onConfigChange: (config: TableConfig) => void;
  tooltip?: string;
}

export function TableConfigDialog({
  trigger,
  config,
  columns = [],
  onConfigChange,
  tooltip,
}: TableConfigDialogProps) {
  const [open, setOpen] = useState(false);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);

    const sortColumn = formData.get("sortColumn") as string;
    const sortDirection = formData.get("sortDirection") as "asc" | "desc" | "";

    const newConfig: TableConfig = {
      configType: "table",
      title: (formData.get("title") as string) || "",
      description: (formData.get("description") as string) || "",
      takeaway: (formData.get("takeaway") as string) || undefined,
      sortColumn: sortColumn || undefined,
      sortDirection: sortDirection || undefined,
      colSpan: config?.colSpan,
    };

    onConfigChange(newConfig);
    setOpen(false);
  };

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
      <DialogContent className="max-w-2xl bg-card p-6">
        <DialogHeader className="pb-2">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Settings2 className="h-5 w-5 text-muted-foreground" />
            Table Settings
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Table Title */}
          <div className="space-y-3">
            <div>
              <label htmlFor="title" className="text-sm font-medium">
                Table Title
              </label>
              <p className="text-xs text-gray-500">
                Title to display above the table
              </p>
            </div>
            <Input
              id="title"
              name="title"
              defaultValue={config?.title || ""}
              placeholder="Enter table title"
              required
            />
          </div>

          <Separator />

          {/* Table Description */}
          <div className="space-y-3">
            <div>
              <label htmlFor="description" className="text-sm font-medium">
                Description
              </label>
              <p className="text-xs text-gray-500">
                Brief description of what the table shows
              </p>
            </div>
            <Input
              id="description"
              name="description"
              defaultValue={config?.description || ""}
              placeholder="Enter table description"
              required
            />
          </div>

          <Separator />

          {/* Table Takeaway */}
          <div className="space-y-3">
            <div>
              <label htmlFor="takeaway" className="text-sm font-medium">
                Key Takeaway (Optional)
              </label>
              <p className="text-xs text-gray-500">
                Main insight or conclusion from this table
              </p>
            </div>
            <Input
              id="takeaway"
              name="takeaway"
              defaultValue={config?.takeaway || ""}
              placeholder="Enter key takeaway"
            />
          </div>

          {columns.length > 0 && (
            <>
              <Separator />

              {/* Sort Column */}
              <div className="space-y-3">
                <div>
                  <label htmlFor="sortColumn" className="text-sm font-medium">
                    Default Sort Column (Optional)
                  </label>
                  <p className="text-xs text-gray-500">
                    Column to sort the table by default
                  </p>
                </div>
                <select
                  id="sortColumn"
                  name="sortColumn"
                  defaultValue={config?.sortColumn || ""}
                  className="w-full px-3 py-2 border border-input bg-background rounded-md text-sm"
                >
                  <option value="">No default sort</option>
                  {columns.map((column) => (
                    <option key={column.name} value={column.name}>
                      {column.name}
                    </option>
                  ))}
                </select>
              </div>

              <Separator />

              {/* Sort Direction */}
              <fieldset className="space-y-3">
                <legend className="text-sm font-medium">
                  Sort Direction (Optional)
                </legend>
                <p className="text-xs text-gray-500">
                  Direction to sort the table by default
                </p>
                <div className="flex gap-2">
                  <label className="cursor-pointer">
                    <input
                      type="radio"
                      name="sortDirection"
                      value=""
                      defaultChecked={!config?.sortDirection}
                      className="sr-only peer"
                    />
                    <div className="px-4 py-2 border rounded-lg hover:bg-card-foreground/10 peer-checked:bg-card-foreground/10 peer-checked:border-card-foreground/20">
                      None
                    </div>
                  </label>
                  <label className="cursor-pointer">
                    <input
                      type="radio"
                      name="sortDirection"
                      value="asc"
                      defaultChecked={config?.sortDirection === "asc"}
                      className="sr-only peer"
                    />
                    <div className="px-4 py-2 border rounded-lg hover:bg-card-foreground/10 peer-checked:bg-card-foreground/10 peer-checked:border-card-foreground/20">
                      Ascending
                    </div>
                  </label>
                  <label className="cursor-pointer">
                    <input
                      type="radio"
                      name="sortDirection"
                      value="desc"
                      defaultChecked={config?.sortDirection === "desc"}
                      className="sr-only peer"
                    />
                    <div className="px-4 py-2 border rounded-lg hover:bg-card-foreground/10 peer-checked:bg-card-foreground/10 peer-checked:border-card-foreground/20">
                      Descending
                    </div>
                  </label>
                </div>
              </fieldset>
            </>
          )}

          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit">Apply</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
