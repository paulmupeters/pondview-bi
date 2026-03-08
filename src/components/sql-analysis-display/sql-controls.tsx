import type { ReactNode } from "react";

interface SqlControlsProps {
  extraControls?: ReactNode;
  className?: string;
}

export function SqlControls({
  extraControls,
  className,
}: SqlControlsProps) {
  if (!extraControls) {
    return null;
  }

  return (
    <div
      className={
        className ??
        "absolute right-2 top-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100"
      }
    >
      {extraControls}
    </div>
  );
}
