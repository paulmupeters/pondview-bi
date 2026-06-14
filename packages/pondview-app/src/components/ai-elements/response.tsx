import { type ComponentProps, memo } from "react";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { cn } from "@/lib/utils";

type ResponseProps = ComponentProps<typeof MarkdownRenderer>;

export const Response = memo(
  ({ className, ...props }: ResponseProps) => (
    <MarkdownRenderer
      className={cn(
        "size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        className,
      )}
      {...props}
    />
  ),
  (prevProps, nextProps) => prevProps.children === nextProps.children,
);

Response.displayName = "Response";
