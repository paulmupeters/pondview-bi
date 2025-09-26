"use client";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useConnectedTables } from "@/hooks/use-connected-tables";

export default function ViewDataPage() {
  const tables = useConnectedTables();
  const hasTables = tables.length > 0;

  return (
    <div className="mx-auto flex h-full w-full max-w-5xl flex-col gap-8 overflow-y-auto px-6 py-10">
      <header className="space-y-3">
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Data Sources
        </span>
        <h1 className="text-3xl font-semibold text-foreground">
          Connected Tables
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Review the tables you have connected locally. These entries are stored
          in your browser&apos;s local storage and only visible to you.
        </p>
      </header>
      <Separator />

      {!hasTables ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 rounded-2xl border border-border/60 bg-muted/30 p-10 text-center">
          <div className="space-y-2">
            <h2 className="text-lg font-medium text-foreground">
              No connected tables yet
            </h2>
            <p className="text-sm text-muted-foreground">
              Connect to a DuckDB database and add tables using the
              sidebar&apos;s Connect Data action.
            </p>
          </div>
          <Button asChild>
            <a href="#connect-data">Connect Data Source</a>
          </Button>
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {tables.map((table) => (
            <li
              key={`${table.type}-${table.databasePath}-${table.table}`}
              className="group flex h-full flex-col justify-between rounded-2xl border border-border bg-card/60 p-5 shadow-sm transition hover:border-primary hover:shadow-md"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    {table.type.toUpperCase()}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {table.databasePath}
                  </span>
                </div>
                <h3 className="text-lg font-semibold text-foreground">
                  {table.table}
                </h3>
                {table.description ? (
                  <p className="text-sm text-muted-foreground line-clamp-3">
                    {table.description}
                  </p>
                ) : (
                  <p className="text-sm italic text-muted-foreground/80">
                    No description provided.
                  </p>
                )}
              </div>

              <div className="mt-4 flex items-center justify-end">
                <Button variant="outline" size="sm">
                  Copy Connection Info
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
