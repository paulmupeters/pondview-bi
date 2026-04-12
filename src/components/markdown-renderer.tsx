import hljs from "highlight.js/lib/core";
import sqlLanguage from "highlight.js/lib/languages/sql";
import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useEffect,
  useRef,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

if (!hljs.getLanguage("sql")) {
  hljs.registerLanguage("sql", sqlLanguage);
}

const SQL_LANGUAGE_CLASS = /\blanguage-sql\b/i;

type MarkdownRendererProps = {
  children: string;
  className?: string;
};

type ExtractedCode = {
  code: string;
  className?: string;
  isSql: boolean;
};

function extractCodeFromPre(children: ReactNode): ExtractedCode | null {
  const nodes = Children.toArray(children);
  if (nodes.length !== 1) {
    return null;
  }

  const node = nodes[0];
  if (!isValidElement(node) || node.type !== "code") {
    return null;
  }

  const codeElement = node as ReactElement<{
    className?: string;
    children?: ReactNode;
  }>;
  const className =
    typeof codeElement.props.className === "string"
      ? codeElement.props.className
      : "";
  const code = String(codeElement.props.children ?? "").replace(/\n$/, "");

  return {
    code,
    className,
    isSql: SQL_LANGUAGE_CLASS.test(className),
  };
}

function SqlHighlightedCode({
  code,
  className,
}: {
  code: string;
  className?: string;
}) {
  const codeRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const element = codeRef.current;
    if (!element) {
      return;
    }

    element.textContent = code;
    hljs.highlightElement(element);
  }, [code]);

  return (
    <code
      ref={codeRef}
      className={cn("hljs language-sql font-mono text-sm", className)}
    >
      {code}
    </code>
  );
}

export function MarkdownRenderer({
  children,
  className,
}: MarkdownRendererProps) {
  return (
    <div
      className={cn(
        "markdown-renderer text-sm leading-6 text-foreground",
        "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ className: elementClassName, ...props }) => (
            <h1
              className={cn(
                "mb-3 mt-6 text-xl font-semibold",
                elementClassName,
              )}
              {...props}
            />
          ),
          h2: ({ className: elementClassName, ...props }) => (
            <h2
              className={cn(
                "mb-3 mt-5 text-lg font-semibold",
                elementClassName,
              )}
              {...props}
            />
          ),
          h3: ({ className: elementClassName, ...props }) => (
            <h3
              className={cn(
                "mb-2 mt-4 text-base font-semibold",
                elementClassName,
              )}
              {...props}
            />
          ),
          p: ({ className: elementClassName, ...props }) => (
            <p className={cn("mb-3", elementClassName)} {...props} />
          ),
          a: ({ className: elementClassName, ...props }) => (
            <a
              className={cn(
                "text-primary underline underline-offset-4 hover:text-primary/80",
                elementClassName,
              )}
              {...props}
            />
          ),
          ul: ({ className: elementClassName, ...props }) => (
            <ul
              className={cn("mb-3 list-disc pl-5", elementClassName)}
              {...props}
            />
          ),
          ol: ({ className: elementClassName, ...props }) => (
            <ol
              className={cn("mb-3 list-decimal pl-5", elementClassName)}
              {...props}
            />
          ),
          li: ({ className: elementClassName, ...props }) => (
            <li className={cn("my-1", elementClassName)} {...props} />
          ),
          blockquote: ({ className: elementClassName, ...props }) => (
            <blockquote
              className={cn(
                "my-4 border-l-2 border-border pl-4 italic text-muted-foreground",
                elementClassName,
              )}
              {...props}
            />
          ),
          table: ({ className: elementClassName, ...props }) => (
            <table
              className={cn(
                "my-4 w-full border-collapse rounded-md border border-border text-sm",
                elementClassName,
              )}
              {...props}
            />
          ),
          thead: ({ className: elementClassName, ...props }) => (
            <thead className={cn("bg-muted/50", elementClassName)} {...props} />
          ),
          th: ({ className: elementClassName, ...props }) => (
            <th
              className={cn(
                "border border-border px-3 py-2 text-left font-medium",
                elementClassName,
              )}
              {...props}
            />
          ),
          td: ({ className: elementClassName, ...props }) => (
            <td
              className={cn(
                "border border-border px-3 py-2 align-top",
                elementClassName,
              )}
              {...props}
            />
          ),
          hr: ({ className: elementClassName, ...props }) => (
            <hr
              className={cn("my-4 border-border", elementClassName)}
              {...props}
            />
          ),
          pre: ({
            className: elementClassName,
            children: elementChildren,
            ...props
          }) => {
            const extractedCode = extractCodeFromPre(elementChildren);
            if (!extractedCode) {
              return (
                <pre
                  className={cn(
                    "mb-4 overflow-x-auto rounded-md border border-border bg-muted/40 p-3",
                    elementClassName,
                  )}
                  {...props}
                >
                  {elementChildren}
                </pre>
              );
            }

            if (extractedCode.isSql) {
              return (
                <pre
                  className={cn(
                    "mb-4 overflow-x-auto rounded-md border border-border bg-muted/40 p-3",
                    elementClassName,
                  )}
                  {...props}
                >
                  <SqlHighlightedCode
                    code={extractedCode.code}
                    className={extractedCode.className}
                  />
                </pre>
              );
            }

            return (
              <pre
                className={cn(
                  "mb-4 overflow-x-auto rounded-md border border-border bg-muted/40 p-3",
                  elementClassName,
                )}
                {...props}
              >
                <code
                  className={cn("font-mono text-sm", extractedCode.className)}
                >
                  {extractedCode.code}
                </code>
              </pre>
            );
          },
          code: ({ className: elementClassName, ...props }) => (
            <code
              className={cn("font-mono text-[0.92em]", elementClassName)}
              {...props}
            />
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
