import { ArrowRight, ClockIcon, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EMPTY_CHAT_HISTORY, useChatHistory } from "@/hooks/use-chat-history";
import {
  type ChatHistoryEntry,
  getChatHistoryDisplayTitle,
} from "@/lib/chat-history";
import { cn } from "@/lib/utils";
import { deleteAnalysisNotebook } from "@/lib/workspace/analysis-notebook-repo";
import { deleteChat } from "@/lib/workspace/chat-repo";
import Link from "@/vite/next-link";
import { useRouter } from "@/vite/next-navigation";

const ANALYSIS_SKELETON_KEYS = [
  "analysis-skeleton-1",
  "analysis-skeleton-2",
  "analysis-skeleton-3",
  "analysis-skeleton-4",
  "analysis-skeleton-5",
  "analysis-skeleton-6",
] as const;

/* ------------------------------------------------------------------ */
/*  Time formatting                                                     */
/* ------------------------------------------------------------------ */

function useRelativeTimeFormatter() {
  return useMemo(
    () => new Intl.RelativeTimeFormat("en", { numeric: "auto" }),
    [],
  );
}

function formatRelativeTime(
  rtf: Intl.RelativeTimeFormat,
  timestamp: number,
): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.round(diff / 1000);
  if (seconds < 10) return "Just now";

  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return rtf.format(-seconds, "second");

  const hours = Math.round(minutes / 60);
  if (hours < 1) return rtf.format(-minutes, "minute");

  const days = Math.round(hours / 24);
  if (days < 1) return rtf.format(-hours, "hour");

  const weeks = Math.round(days / 7);
  if (weeks < 4) return rtf.format(-days, "day");

  const months = Math.round(days / 30);
  if (months < 12) return rtf.format(-months, "month");

  return rtf.format(-Math.round(days / 365), "year");
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                      */
/* ------------------------------------------------------------------ */

function SkeletonGrid() {
  return (
    <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
      {ANALYSIS_SKELETON_KEYS.map((key) => (
        <div
          key={key}
          className="h-16 animate-pulse bg-muted/40 border-l-[3px] border-l-primary/20"
        />
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center animate-in fade-in zoom-in-95 duration-500">
      <div className="relative mb-8">
        <div className="absolute -inset-4 rounded-full bg-primary/10 blur-2xl" />
        <div className="relative flex h-20 w-20 items-center justify-center rounded-full border-2 border-dashed border-primary/30 bg-primary/5">
          <ClockIcon className="h-8 w-8 text-primary/60" />
        </div>
      </div>
      <h2 className="text-2xl font-bold tracking-tight text-foreground">
        No analyses yet
      </h2>
      <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
        Start a new analysis from the home screen. All of your analyses will
        show up here.
      </p>
      <Link href="/" className="mt-8">
        <Button
          size="lg"
          className="gap-2 rounded-full px-6 shadow-lg shadow-primary/20"
        >
          <Plus className="h-4 w-4" />
          Start New Analysis
        </Button>
      </Link>
    </div>
  );
}

function ErrorState({
  error,
  onRetry,
}: {
  error: string;
  onRetry: () => void;
}) {
  return (
    <div className="animate-in fade-in zoom-in-95 duration-500">
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-8 text-left border-l-4 border-l-destructive">
        <h3 className="text-lg font-semibold text-destructive">
          Unable to load analyses
        </h3>
        <p className="mt-2 text-sm text-destructive/80">{error}</p>
        <Button variant="outline" className="mt-6" onClick={onRetry}>
          Retry
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page                                                           */
/* ------------------------------------------------------------------ */

export default function AllAnalysesPage() {
  const router = useRouter();
  const rtf = useRelativeTimeFormatter();

  const { chats, isLoading, error, loadChats } = useChatHistory(
    EMPTY_CHAT_HISTORY,
    { limit: Number.MAX_SAFE_INTEGER },
  );

  const sortedChats = useMemo(
    () => [...chats].sort((a, b) => b.updatedAt - a.updatedAt),
    [chats],
  );

  const [gridVisible, setGridVisible] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [chatToDelete, setChatToDelete] = useState<ChatHistoryEntry | null>(
    null,
  );

  const reload = useCallback(
    (showLoading = false) => {
      void loadChats({ showLoading });
    },
    [loadChats],
  );

  useEffect(() => {
    reload(true);
  }, [reload]);

  /* Staggered entrance: wait one frame so the browser sees the initial
     opacity:0 state before we flip to visible.                        */
  useEffect(() => {
    if (sortedChats.length > 0 && !isLoading) {
      const id = requestAnimationFrame(() => setGridVisible(true));
      return () => cancelAnimationFrame(id);
    }
    if (isLoading) setGridVisible(false);
  }, [sortedChats.length, isLoading]);

  const handleOpen = useCallback(
    (chatId: string) => {
      router.push(`/analysis?id=${encodeURIComponent(chatId)}`);
    },
    [router],
  );

  const confirmDelete = useCallback(async () => {
    if (!chatToDelete) return;
    setDeletingId(chatToDelete.id);
    try {
      await Promise.all([
        deleteAnalysisNotebook(chatToDelete.id),
        deleteChat(chatToDelete.id),
      ]);
      await loadChats();
    } catch {
      await loadChats();
    } finally {
      setDeletingId(null);
      setChatToDelete(null);
    }
  }, [chatToDelete, loadChats]);

  const showBlockingLoader = isLoading && chats.length === 0;

  return (
    <div className="relative min-h-full w-full overflow-y-auto bg-background">
      {/* Atmospheric top glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 40% at 50% 0%, hsl(var(--primary) / 0.06), transparent)",
        }}
      />

      <div className="relative mx-auto max-w-7xl px-6 py-12 lg:px-8">
        {/* Header */}
        <header className="mb-10 flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-3">
            <h1 className="text-5xl font-black tracking-tighter text-foreground sm:text-6xl">
              Analyses
            </h1>
          </div>

          <div className="flex items-center gap-6">
            {!isLoading && (
              <div className="hidden text-right sm:block">
                <p className="font-mono text-3xl font-bold leading-none text-foreground">
                  {sortedChats.length}
                </p>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {sortedChats.length === 1 ? "Analysis" : "Analyses"}
                </p>
              </div>
            )}
            <Link href="/">
              <Button
                size="lg"
                className="gap-2 rounded-full px-6 shadow-lg shadow-primary/20 transition-all hover:-translate-y-0.5 hover:shadow-primary/35"
              >
                <Plus className="h-4 w-4" />
                New Analysis
              </Button>
            </Link>
          </div>
        </header>

        {/* Content */}
        {showBlockingLoader ? (
          <SkeletonGrid />
        ) : error ? (
          <ErrorState error={error} onRetry={() => reload(true)} />
        ) : sortedChats.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {sortedChats.map((chat, i) => {
              const isFeatured = i === 0;
              const delayMs = Math.min(i, 15) * 40;

              return (
                <article
                  key={chat.id}
                  className={cn(
                    "group relative flex items-center gap-4 border-l-primary bg-card px-5 py-3.5 text-left transition-colors ease-out hover:bg-accent/[0.06]",
                    isFeatured ? "border-l-[4px]" : "border-l-[3px]",
                  )}
                  style={{
                    transitionProperty:
                      "opacity, transform, box-shadow, background-color, border-color",
                    transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
                    transitionDuration: gridVisible ? "500ms" : "0ms",
                    transitionDelay: gridVisible ? `${delayMs}ms` : "0ms",
                    opacity: gridVisible ? 1 : 0,
                    transform: gridVisible
                      ? "translateY(0)"
                      : "translateY(8px)",
                  }}
                >
                  {/* Stretched link for row-level navigation */}
                  <button
                    type="button"
                    className="absolute inset-0 z-10 cursor-pointer rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    onClick={() => handleOpen(chat.id)}
                    aria-label={`Open ${getChatHistoryDisplayTitle(chat)}`}
                  />

                  <span className="pointer-events-none relative z-20 shrink-0 font-mono text-[11px] font-semibold tabular-nums tracking-widest text-primary/70">
                    {String(i + 1).padStart(2, "0")}
                  </span>

                  <div className="pointer-events-none relative z-20 flex min-w-0 flex-1 items-center gap-3">
                    <h3 className="truncate font-semibold leading-snug text-card-foreground">
                      {getChatHistoryDisplayTitle(chat)}
                    </h3>
                    {isFeatured && (
                      <span className="inline-flex shrink-0 items-center rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-primary">
                        Latest
                      </span>
                    )}
                  </div>

                  <div className="pointer-events-none relative z-20 flex shrink-0 items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    <ClockIcon className="h-3 w-3" />
                    {formatRelativeTime(rtf, chat.updatedAt)}
                  </div>

                  <button
                    type="button"
                    className="pointer-events-auto relative z-20 inline-flex shrink-0 items-center justify-center rounded-md p-1.5 text-muted-foreground opacity-0 ring-offset-background transition-all hover:bg-destructive/10 hover:text-destructive focus:opacity-100 group-hover:opacity-100"
                    onClick={() => setChatToDelete(chat)}
                    disabled={deletingId === chat.id}
                    aria-label="Delete analysis"
                    title="Delete analysis"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>

                  <ArrowRight className="pointer-events-none relative z-20 h-4 w-4 shrink-0 -translate-x-1 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
                </article>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete confirmation dialog */}
      <Dialog
        open={!!chatToDelete}
        onOpenChange={(open) => !open && setChatToDelete(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Analysis</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-semibold text-foreground">
                &ldquo;
                {chatToDelete ? getChatHistoryDisplayTitle(chatToDelete) : ""}
                &rdquo;
              </span>
              ? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setChatToDelete(null)}
              disabled={!!deletingId}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={!!deletingId}
            >
              {deletingId ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
