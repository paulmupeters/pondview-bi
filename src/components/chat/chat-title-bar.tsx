import { Pencil } from "lucide-react";
import type { ChatTitleBarModel } from "@/components/chat/hooks/use-chat-session";

export function ChatTitleBar({ model }: { model: ChatTitleBarModel }) {
  return (
    <div className="group/title border-b border-border/50 px-4 py-3">
      <div className="flex items-center gap-2">
        {model.isEditing ? (
          <input
            ref={model.inputRef}
            value={model.draftValue}
            onChange={(event) => model.setDraftValue(event.target.value)}
            onBlur={model.handleBlur}
            onKeyDown={model.handleKeyDown}
            className="h-7 w-full rounded-md border border-primary/30 bg-background px-2.5 font-mono text-xs font-medium text-foreground shadow-sm transition-shadow focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50"
            placeholder="Untitled chat"
            aria-label="Edit chat title"
          />
        ) : (
          <>
            <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
            <p
              className="truncate font-mono text-xs font-medium tracking-wide text-muted-foreground transition-colors group-hover/title:text-foreground"
              title={model.title || "Untitled chat"}
            >
              {model.title || "Untitled chat"}
            </p>
            <button
              type="button"
              onClick={model.beginEditing}
              className="ml-auto inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/50 opacity-0 transition-all hover:bg-accent/50 hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring group-hover/title:opacity-100"
              aria-label="Edit chat title"
            >
              <Pencil className="h-3 w-3" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
