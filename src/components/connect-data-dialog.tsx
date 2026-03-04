import * as Dialog from "@radix-ui/react-dialog";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";

type DatabaseType =
  | "duckdb"
  | "motherduck"
  | "postgres"
  | "mysql"
  | "sqlite"
  | "httpfs"
  | "extension"
  | "snowflake"
  | "databricks"
  | "supabase"
  | "ducklake"
  | "iceberg"
  | "delta_lake"
  | "google_sheets"
  | "sharepoint"
  | "aws"
  | "web"
  | null;

type ConnectDataDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialSelectedDatabase?: DatabaseType;
  initialDatabasePath?: string;
};

export function ConnectDataDialog({
  open,
  onOpenChange,
  initialSelectedDatabase: _initialSelectedDatabase,
  initialDatabasePath: _initialDatabasePath,
}: ConnectDataDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-xl -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card shadow-2xl focus:outline-hidden">
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <div>
              <Dialog.Title className="text-lg font-semibold text-foreground">
                Connect Data Source
              </Dialog.Title>
              <Dialog.Description className="text-sm text-muted-foreground">
                This flow is deferred in browser mode.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="size-8 rounded-full text-muted-foreground transition hover:bg-accent hover:text-accent-foreground"
                aria-label="Close"
              >
                <XMarkIcon className="size-4" />
              </button>
            </Dialog.Close>
          </div>

          <div className="space-y-3 px-6 py-5">
            <p className="text-sm text-muted-foreground">
              Guided source connection and schema browsing previously depended on server APIs (`/api/tables` and semantic-layer routes).
              In Phase 6 browser mode, these server-backed flows are intentionally disabled.
            </p>
            <p className="text-sm text-muted-foreground">
              You can still query connected data manually through the SQL shell and DuckDB bridge endpoints.
            </p>
          </div>

          <div className="flex items-center justify-end border-t border-border px-6 py-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
