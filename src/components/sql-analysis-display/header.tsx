import {
  ChatBubbleBottomCenterTextIcon,
  PlusCircleIcon,
} from "@heroicons/react/24/outline";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type {
  ActiveView,
  SqlAnalysisDisplayProps,
} from "../sql-analysis-display.types";

interface SqlAnalysisHeaderProps {
  activeView: ActiveView;
  canShowTable: boolean;
  onActiveViewChange: (view: ActiveView) => void;
  canShowVisualOptionsToggle: boolean;
  showVisualOptions: boolean;
  onVisualOptionsToggle: () => void;
  addToDashboardTrigger?: ReactNode;
  showAddToChatButton: boolean;
  onAddToChatClick: () => void;
  showClearButton: boolean;
  onClear: () => void;
  history?: SqlAnalysisDisplayProps["history"];
}

export function SqlAnalysisHeader({
  activeView,
  canShowTable,
  onActiveViewChange,
  canShowVisualOptionsToggle,
  showVisualOptions,
  onVisualOptionsToggle,
  addToDashboardTrigger,
  showAddToChatButton,
  onAddToChatClick,
  showClearButton,
  onClear,
  history,
}: SqlAnalysisHeaderProps) {
  return (
    <div className="flex flex-col gap-3 px-4 pt-2 sm:flex-row sm:items-center sm:justify-between">
      <ToggleGroup
        type="single"
        value={activeView}
        onValueChange={(value) => {
          if (value) {
            onActiveViewChange(value as ActiveView);
          }
        }}
        className="gap-2"
      >
        <ToggleGroupItem
          value="table"
          disabled={!canShowTable}
          className={cn(
            "rounded-none border-b-2 border-transparent bg-transparent px-3 py-2 text-sm font-medium data-[state=on]:bg-transparent data-[state=on]:text-primary",
            activeView === "table"
              ? "border-primary font-bold"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Data
        </ToggleGroupItem>
        <ToggleGroupItem
          value="chart"
          disabled={false}
          className={cn(
            "rounded-none border-b-2 border-transparent bg-transparent px-3 py-2 text-sm font-mono data-[state=on]:bg-transparent data-[state=on]:text-primary",
            activeView === "chart"
              ? "border-primary font-bold"
              : "font-medium text-muted-foreground hover:text-foreground",
          )}
        >
          Visual
        </ToggleGroupItem>
      </ToggleGroup>

      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        {addToDashboardTrigger}
        {canShowVisualOptionsToggle && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex items-center gap-2 text-xs font-mono"
            onClick={onVisualOptionsToggle}
            aria-expanded={showVisualOptions}
            aria-controls="chart-visual-options"
          >
            Visual options
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 transition-transform",
                showVisualOptions && "rotate-180",
              )}
            />
          </Button>
        )}
        {showAddToChatButton && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="flex items-center gap-2"
                onClick={onAddToChatClick}
              >
                <PlusCircleIcon className="h-4 w-4" />
                Add to chat
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Share this result</p>
            </TooltipContent>
          </Tooltip>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
            >
              <ChatBubbleBottomCenterTextIcon className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Edit with AI</p>
          </TooltipContent>
        </Tooltip>
        {showClearButton ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="flex items-center gap-2"
                onClick={onClear}
              >
                Clear
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Clear analysis</p>
            </TooltipContent>
          </Tooltip>
        ) : null}
        {history && history.total > 0 ? (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={history.onPrev}
              disabled={history.currentIndex <= 0}
              className="flex items-center gap-2"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[60px] text-center text-xs text-muted-foreground">
              {history.currentIndex + 1} / {history.total}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={history.onNext}
              disabled={history.currentIndex >= history.total - 1}
              className="flex items-center gap-2"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
