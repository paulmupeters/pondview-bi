import { AlertTriangle } from "lucide-react";
import Link from "@/vite/next-link";

export function PromptErrorBanner({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }

  return (
    <div className="mb-3 rounded-lg border border-destructive/20 bg-destructive/5 px-3.5 py-2.5 font-mono text-xs text-destructive backdrop-blur-sm dark:border-destructive/30 dark:bg-destructive/10">
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 opacity-80" />
        <div className="min-w-0 flex-1">
          <p className="leading-relaxed">{message}</p>
          <div className="mt-2">
            <Link
              href="/settings"
              className="inline-flex items-center font-medium text-destructive/90 underline decoration-destructive/30 underline-offset-4 transition-colors hover:text-destructive hover:decoration-destructive/60"
            >
              Open Settings
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
