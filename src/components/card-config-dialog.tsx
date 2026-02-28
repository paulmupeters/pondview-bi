import React, { useState, useRef } from "react";
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

interface CardConfigFormProps {
  config: CardConfig | null;
  onConfigChange: (config: CardConfig) => void;
  onCancel?: () => void;
  inline?: boolean;
}

export function CardConfigForm({
  config,
  onConfigChange,
  onCancel,
  inline = false,
}: CardConfigFormProps) {
  const titleRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLInputElement>(null);
  const takeawayRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    const newConfig: CardConfig = {
      configType: "card",
      title: titleRef.current?.value || "",
      description: descriptionRef.current?.value || "",
      takeaway: takeawayRef.current?.value || undefined,
    };

    onConfigChange(newConfig);
  };

  const handleButtonClick = () => {
    const newConfig: CardConfig = {
      configType: "card",
      title: titleRef.current?.value || "",
      description: descriptionRef.current?.value || "",
      takeaway: takeawayRef.current?.value || undefined,
    };
    onConfigChange(newConfig);
  };

  const formContent = (
    <div className="space-y-6">
      {/* Card Title */}
      <div className="space-y-3">
        <div>
          <label htmlFor="card-title" className="text-sm font-medium">
            Card Title
          </label>
          <p className="text-xs text-gray-500">
            Title to display above the value
          </p>
        </div>
        <Input
          ref={titleRef}
          id="card-title"
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
          <label htmlFor="card-description" className="text-sm font-medium">
            Description
          </label>
          <p className="text-xs text-gray-500">
            Brief description of what the value represents
          </p>
        </div>
        <Input
          ref={descriptionRef}
          id="card-description"
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
          <label htmlFor="card-takeaway" className="text-sm font-medium">
            Key Takeaway (Optional)
          </label>
          <p className="text-xs text-gray-500">
            Main insight or conclusion from this value
          </p>
        </div>
        <Input
          ref={takeawayRef}
          id="card-takeaway"
          name="takeaway"
          defaultValue={config?.takeaway || ""}
          placeholder="Enter key takeaway"
        />
      </div>

      <div className="flex justify-end gap-2 pt-4">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
          >
            Cancel
          </Button>
        )}
        {inline ? (
          <Button type="button" onClick={handleButtonClick}>Apply</Button>
        ) : (
          <Button type="submit">Apply</Button>
        )}
      </div>
    </div>
  );

  if (inline) {
    return formContent;
  }

  return (
    <form onSubmit={handleSubmit}>
      {formContent}
    </form>
  );
}

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

  const handleConfigChange = (newConfig: CardConfig) => {
    onConfigChange(newConfig);
    setOpen(false);
  };

  // Create a key based on config to reset form when config changes or dialog opens
  const formKey = open
    ? `${config?.title || ""}-${config?.description || ""}-${config?.takeaway || ""}`
    : "";

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
        <CardConfigForm
          key={formKey}
          config={config}
          onConfigChange={handleConfigChange}
          onCancel={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
