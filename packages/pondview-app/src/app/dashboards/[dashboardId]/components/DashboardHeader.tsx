import { Pencil, RefreshCw } from "lucide-react";
import type { FormEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Dashboard } from "../types";

type DashboardHeaderProps = {
  dashboard: Dashboard;
  onTitleUpdate: (newTitle: string) => Promise<void>;
  onRefresh?: () => Promise<void>;
  isRefreshing?: boolean;
  readOnly?: boolean;
};

export function DashboardHeader({
  dashboard,
  onTitleUpdate,
  onRefresh,
  isRefreshing = false,
  readOnly = false,
}: DashboardHeaderProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState(dashboard.title);
  const [isSavingTitle, setIsSavingTitle] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isEditingTitle && dashboard?.title) {
      setEditedTitle(dashboard.title);
    }
  }, [dashboard?.title, isEditingTitle]);

  useEffect(() => {
    if (isEditingTitle) {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
  }, [isEditingTitle]);

  const startEditingTitle = useCallback(() => {
    setEditedTitle(dashboard.title);
    setTitleError(null);
    setIsEditingTitle(true);
  }, [dashboard]);

  const cancelTitleEdit = useCallback(() => {
    setEditedTitle(dashboard.title);
    setTitleError(null);
    setIsEditingTitle(false);
  }, [dashboard]);

  const saveTitle = useCallback(async () => {
    const trimmedTitle = editedTitle.trim();
    if (!trimmedTitle) {
      setTitleError("Title cannot be empty");
      return;
    }
    try {
      setIsSavingTitle(true);
      await onTitleUpdate(trimmedTitle);
      setTitleError(null);
      setIsEditingTitle(false);
    } catch (error) {
      console.error("Failed to update dashboard title:", error);
    } finally {
      setIsSavingTitle(false);
    }
  }, [editedTitle, onTitleUpdate]);

  const handleTitleFormSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void saveTitle();
    },
    [saveTitle],
  );

  const trimmedEditedTitle = editedTitle.trim();
  const trimmedCurrentTitle = dashboard.title.trim();
  const isTitleSaveDisabled =
    isSavingTitle ||
    trimmedEditedTitle.length === 0 ||
    trimmedEditedTitle === trimmedCurrentTitle;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {isEditingTitle ? (
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-center"
          onSubmit={handleTitleFormSubmit}
        >
          <div className="flex flex-col gap-1">
            <Input
              ref={titleInputRef}
              value={editedTitle}
              onChange={(event) => {
                setEditedTitle(event.target.value);
                if (titleError) setTitleError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  cancelTitleEdit();
                }
              }}
              disabled={isSavingTitle}
              placeholder="Dashboard title"
              className="h-10 min-w-[200px] sm:min-w-[260px]"
            />
            {titleError ? (
              <span className="text-xs text-destructive">{titleError}</span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" disabled={isTitleSaveDisabled}>
              {isSavingTitle ? "Saving…" : "Save"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={cancelTitleEdit}
              disabled={isSavingTitle}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="group flex items-center gap-2">
          <div className="flex flex-wrap items-center gap-2 py-4">
            <h1 className="text-2xl md:text-4xl font-semibold leading-tight">
              {dashboard.title}
            </h1>
          </div>
          {onRefresh ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => void onRefresh()}
              disabled={isRefreshing}
              aria-label="Refresh dashboard"
              title="Refresh dashboard"
            >
              <RefreshCw
                className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
              />
            </Button>
          ) : null}
          {!readOnly ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={startEditingTitle}
              aria-label="Edit dashboard title"
              title="Edit title"
              className="opacity-0 transition-opacity group-hover:opacity-100"
            >
              <Pencil className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}
