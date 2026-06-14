import { ArrowRightIcon } from "@heroicons/react/24/outline";
import { ClockIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { EMPTY_CHAT_HISTORY, useChatHistory } from "@/hooks/use-chat-history";
import { getChatHistoryDisplayTitle } from "@/lib/chat-history";
import { cn } from "@/lib/utils";
import Link from "@/vite/next-link";
import { useRouter } from "@/vite/next-navigation";

const RECENT_ANALYSES_LIMIT = 5;
const RECENT_ANALYSIS_SKELETON_KEYS = [
  "recent-analysis-skeleton-1",
  "recent-analysis-skeleton-2",
  "recent-analysis-skeleton-3",
] as const;

function formatRecentAnalysisDate(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return "Older";
}

type RecentAnalysesSectionProps = {
  className?: string;
  visible?: boolean;
};

export function RecentAnalysesSection({
  className,
  visible = true,
}: RecentAnalysesSectionProps) {
  const router = useRouter();
  const { chats, isLoading, error, loadChats } = useChatHistory(
    EMPTY_CHAT_HISTORY,
    {
      limit: RECENT_ANALYSES_LIMIT,
      scopeToProject: false,
    },
  );
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    void loadChats({ showLoading: true }).finally(() => {
      setHasLoaded(true);
    });
  }, [loadChats]);

  const handleOpen = useCallback(
    (chatId: string) => {
      router.push(`/analysis?id=${encodeURIComponent(chatId)}`);
    },
    [router],
  );

  const headerClassName = cn(
    "flex items-center justify-between gap-3 transition-all duration-500 ease-out motion-reduce:transition-none",
    visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2",
  );

  if (!hasLoaded && isLoading) {
    return (
      <section
        className={cn("mt-6 space-y-3", className)}
        aria-label="Recent analyses"
        aria-busy="true"
      >
        <div className={headerClassName}>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ClockIcon className="h-3.5 w-3.5" aria-hidden="true" />
            Recent analyses
          </p>
        </div>
        <div className="space-y-2">
          {RECENT_ANALYSIS_SKELETON_KEYS.map((key) => (
            <div
              key={key}
              className="h-11 animate-pulse rounded-md border border-border/30 bg-card/40"
            />
          ))}
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section
        className={cn("mt-6 space-y-3", className)}
        aria-label="Recent analyses"
      >
        <div className={headerClassName}>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ClockIcon className="h-3.5 w-3.5" aria-hidden="true" />
            Recent analyses
          </p>
        </div>
        <p className="text-center text-xs text-muted-foreground">{error}</p>
      </section>
    );
  }

  return (
    <section
      className={cn("mt-6 space-y-3", className)}
      aria-label="Recent analyses"
    >
      <div className={headerClassName}>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ClockIcon className="h-3.5 w-3.5" aria-hidden="true" />
          Recent analyses
        </p>
        {chats.length > 0 ? (
          <Link
            href="/analysis/all"
            className="text-xs font-medium text-primary hover:underline"
          >
            View all
          </Link>
        ) : null}
      </div>

      {chats.length > 0 ? (
        <ul className="space-y-2">
          {chats.map((chat, index) => (
            <li
              key={chat.id}
              className={cn(
                "transition-all duration-500 ease-out motion-reduce:transition-none",
                visible
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-2",
              )}
              style={{
                transitionDelay: visible ? `${200 + index * 60}ms` : "0ms",
              }}
            >
              <button
                type="button"
                onClick={() => handleOpen(chat.id)}
                className="group flex w-full items-center justify-between gap-3 rounded-md border border-border/30 bg-card/40 px-4 py-2.5 text-left text-sm text-foreground/80 transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-foreground"
              >
                <span className="min-w-0 truncate">
                  {getChatHistoryDisplayTitle(chat)}
                </span>
                <span className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
                  {formatRecentAnalysisDate(chat.updatedAt)}
                  <ArrowRightIcon className="h-3.5 w-3.5 -translate-x-1 opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:text-primary group-hover:opacity-100" />
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p
          className={cn(
            "rounded-md border border-dashed border-border/40 bg-card/20 px-4 py-3 text-center text-xs text-muted-foreground transition-all duration-500 ease-out motion-reduce:transition-none",
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2",
          )}
        >
          No analyses yet. Start one above or try an example below.
        </p>
      )}
    </section>
  );
}
