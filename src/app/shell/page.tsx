"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { DuckdbRepl } from "@/components/duckdb-shell";
import { Button } from "@/components/ui/button";

export default function ShellPage() {
  return (
    <div className="flex h-full w-full flex-col gap-6 px-6 py-10">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold text-foreground">
            DuckDB Shell
          </h1>
          <p className="text-sm text-muted-foreground">
            Run ad-hoc SQL commands directly in your browser against the local
            DuckDB instance.
          </p>
        </div>
        <Button asChild variant="ghost">
          <Link href="/data" className="inline-flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to Data
          </Link>
        </Button>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-1">
        <DuckdbRepl className="h-[70vh]" />
      </main>
    </div>
  );
}
