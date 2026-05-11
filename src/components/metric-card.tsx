import { Pencil } from "lucide-react";
import { useCallback } from "react";
import { useInlineTextEdit } from "@/components/hooks/use-inline-text-edit";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface MetricCardProps {
  value: string | number | boolean | Date | null | undefined;
  title: string;
  description?: string;
  takeaway?: string;
  className?: string;
  editable?: boolean;
  showTitle?: boolean;
  onTitleChange?: (value: string) => void;
  onDescriptionChange?: (value: string) => void;
  onTakeawayChange?: (value: string) => void;
}

export function MetricCard({
  value,
  title,
  description,
  takeaway,
  className,
  editable = false,
  showTitle = true,
  onTitleChange,
  onDescriptionChange,
  onTakeawayChange,
}: MetricCardProps) {
  const formattedValue = (() => {
    if (typeof value === "number") {
      return value.toLocaleString();
    }
    if (typeof value === "boolean") {
      return value.toString();
    }
    if (value instanceof Date) {
      return value.toLocaleString();
    }
    return String(value ?? "");
  })();
  type EditableField = "title" | "description" | "takeaway";

  const canEditTitle = editable && typeof onTitleChange === "function";
  const canEditDescription =
    editable && typeof onDescriptionChange === "function";
  const canEditTakeaway = editable && typeof onTakeawayChange === "function";

  const getFieldValue = useCallback(
    (field: EditableField) => {
      if (field === "title") {
        return title;
      }
      if (field === "description") {
        return description ?? "";
      }
      return takeaway ?? "";
    },
    [description, takeaway, title],
  );

  const handleFieldCommit = useCallback(
    (field: EditableField, value: string) => {
      if (field === "title") {
        onTitleChange?.(value);
      } else if (field === "description") {
        onDescriptionChange?.(value);
      } else {
        onTakeawayChange?.(value);
      }
    },
    [onDescriptionChange, onTakeawayChange, onTitleChange],
  );

  const {
    editingField,
    draftValue,
    setDraftValue,
    inputRef,
    startEditing,
    handleInputBlur,
    handleInputKeyDown,
  } = useInlineTextEdit<EditableField>({
    getValue: getFieldValue,
    onCommit: handleFieldCommit,
  });

  const handleStartEditing = (field: EditableField) => {
    if (field === "title" && !canEditTitle) return;
    if (field === "description" && !canEditDescription) return;
    if (field === "takeaway" && !canEditTakeaway) return;
    startEditing(field);
  };

  const handleBlur = () => {
    if (editingField === null) {
      return;
    }
    handleInputBlur();
  };

  return (
    <Card className={className}>
      {showTitle ? (
        <CardHeader>
          <div className="group/title flex items-center gap-2">
            {editingField === "title" ? (
              <input
                ref={inputRef}
                type="text"
                className="w-full bg-background border border-input rounded px-2 py-1.5 text-base font-medium text-muted-foreground focus:outline-none focus:border-primary"
                value={draftValue}
                onChange={(event) => setDraftValue(event.target.value)}
                onBlur={handleBlur}
                onKeyDown={handleInputKeyDown}
              />
            ) : (
              <>
                <CardTitle className="text-base font-medium text-muted-foreground">
                  {title}
                </CardTitle>
                {canEditTitle && (
                  <button
                    type="button"
                    className="text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/title:opacity-100 focus-visible:opacity-100"
                    onClick={() => handleStartEditing("title")}
                    aria-label="Edit card title"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
              </>
            )}
          </div>
        </CardHeader>
      ) : null}
      <CardContent className="flex-1 flex flex-col justify-center">
        <div className="text-4xl font-bold text-foreground">
          {formattedValue}
        </div>
        {(description || canEditDescription) && (
          <div className="group/description mt-2 flex items-start gap-2">
            {editingField === "description" ? (
              <input
                ref={inputRef}
                type="text"
                className="w-full bg-background border border-input rounded px-2 py-1.5 text-sm text-muted-foreground focus:outline-none focus:border-primary"
                value={draftValue}
                onChange={(event) => setDraftValue(event.target.value)}
                onBlur={handleBlur}
                onKeyDown={handleInputKeyDown}
                placeholder="Add a description"
              />
            ) : (
              <>
                <div className="text-sm text-muted-foreground">
                  {description || "Add a description"}
                </div>
                {canEditDescription && (
                  <button
                    type="button"
                    className="mt-0.5 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/description:opacity-100 focus-visible:opacity-100"
                    onClick={() => handleStartEditing("description")}
                    aria-label="Edit card description"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
              </>
            )}
          </div>
        )}
        {(takeaway || canEditTakeaway) && (
          <div className="group/takeaway mt-2 flex items-start gap-2">
            {editingField === "takeaway" ? (
              <input
                ref={inputRef}
                type="text"
                className="w-full bg-background border border-input rounded px-2 py-1.5 text-xs text-muted-foreground italic focus:outline-none focus:border-primary"
                value={draftValue}
                onChange={(event) => setDraftValue(event.target.value)}
                onBlur={handleBlur}
                onKeyDown={handleInputKeyDown}
                placeholder="Add a takeaway"
              />
            ) : (
              <>
                <div className="text-xs text-muted-foreground italic">
                  {takeaway || "Add a takeaway"}
                </div>
                {canEditTakeaway && (
                  <button
                    type="button"
                    className="mt-0.5 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/takeaway:opacity-100 focus-visible:opacity-100"
                    onClick={() => handleStartEditing("takeaway")}
                    aria-label="Edit card takeaway"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
