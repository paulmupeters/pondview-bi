"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import type { CardConfig } from "@/lib/types";

interface CardConfigDialogProps {
  trigger: React.ReactNode;
  config: CardConfig | null;
  onConfigChange: (config: CardConfig) => void;
  tooltip?: string;
}

export function CardConfigDialog({
  trigger,
  config,
  onConfigChange,
  tooltip,
}: CardConfigDialogProps) {
  const [open, setOpen] = useState(false);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);

    const newConfig: CardConfig = {
      configType: "card",
      title: (formData.get("title") as string) || "",
      description: (formData.get("description") as string) || "",
      takeaway: (formData.get("takeaway") as string) || undefined,
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
      <DialogContent className="max-w-xl bg-card">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-gray-500">⚙️</span>
            Card Configuration
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Card Title */}
          <div className="space-y-3">
            <div>
              <label htmlFor="title" className="text-sm font-medium">
                Card Title
              </label>
              <p className="text-xs text-gray-500">
                Title to display above the value
              </p>
            </div>
            <Input
              id="title"
              name="title"
              defaultValue={config?.title || ""}
              placeholder="Enter card title"
              required
            />
          </div>

          <Separator />

          {/* Card Description */}
          <div className="space-y-3">
            <div>
              <label htmlFor="description" className="text-sm font-medium">
                Description
              </label>
              <p className="text-xs text-gray-500">
                Brief description of what the value represents
              </p>
            </div>
            <Input
              id="description"
              name="description"
              defaultValue={config?.description || ""}
              placeholder="Enter card description"
              required
            />
          </div>

          <Separator />

          {/* Card Takeaway */}
          <div className="space-y-3">
            <div>
              <label htmlFor="takeaway" className="text-sm font-medium">
                Key Takeaway (Optional)
              </label>
              <p className="text-xs text-gray-500">
                Main insight or conclusion from this value
              </p>
            </div>
            <Input
              id="takeaway"
              name="takeaway"
              defaultValue={config?.takeaway || ""}
              placeholder="Enter key takeaway"
            />
          </div>

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

