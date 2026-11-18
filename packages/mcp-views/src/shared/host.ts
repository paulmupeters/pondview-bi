import type { McpUiHostContext } from "@modelcontextprotocol/ext-apps";
import { type CSSProperties, useEffect } from "react";

const BASE_PADDING = 16;

// Mirrors the host's light/dark preference onto the Tailwind `dark` class.
export function useThemeClass(theme: McpUiHostContext["theme"]) {
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);
}

// Pads the view so content clears notches and system bars on mobile hosts.
export function safeAreaStyle(
  insets: McpUiHostContext["safeAreaInsets"],
): CSSProperties | undefined {
  if (!insets) return undefined;
  return {
    paddingTop: insets.top + BASE_PADDING,
    paddingRight: insets.right + BASE_PADDING,
    paddingBottom: insets.bottom + BASE_PADDING,
    paddingLeft: insets.left + BASE_PADDING,
  };
}

export function textFromContent(
  content: Array<{ type: string; text?: string }> | undefined,
): string | null {
  const text = content
    ?.filter((block) => block.type === "text" && block.text)
    .map((block) => block.text)
    .join("\n");
  return text || null;
}
