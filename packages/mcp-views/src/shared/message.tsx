import type { ReactNode } from "react";

export function Message({ children }: { children: ReactNode }) {
  return <p className="p-4 text-sm text-muted-foreground">{children}</p>;
}
