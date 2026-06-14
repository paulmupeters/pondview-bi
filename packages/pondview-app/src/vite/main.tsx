import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "@/app/globals.css";
import {
  CUSTOM_CSS_KEY,
  CUSTOM_CSS_STYLE_ID,
  SELECTED_THEME_KEY,
  THEME_STYLE_ID,
} from "@/lib/custom-css";
import { themes } from "@/themes";
import { App } from "./App";

function upsertStyleElement(id: string, css: string): void {
  let styleElement = document.getElementById(id);
  if (!styleElement) {
    styleElement = document.createElement("style");
    styleElement.id = id;
    document.head.appendChild(styleElement);
  }
  styleElement.textContent = css;
}

function bootstrapTheme(): void {
  try {
    const selectedTheme = localStorage.getItem(SELECTED_THEME_KEY);
    const customCss = localStorage.getItem(CUSTOM_CSS_KEY) || "";
    const selectedThemeCss = selectedTheme ? themes[selectedTheme]?.css : "";

    if (selectedThemeCss) {
      upsertStyleElement(THEME_STYLE_ID, selectedThemeCss);
      upsertStyleElement(CUSTOM_CSS_STYLE_ID, "");
      return;
    }

    if (customCss) {
      upsertStyleElement(CUSTOM_CSS_STYLE_ID, customCss);
      upsertStyleElement(THEME_STYLE_ID, "");
    }
  } catch {
    // no-op
  }
}

bootstrapTheme();

if (import.meta.env.DEV) {
  window.addEventListener("error", (event) => {
    console.error("[pondview:window-error]", {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: event.error instanceof Error ? event.error.stack : event.error,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    console.error("[pondview:unhandled-rejection]", {
      message: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : reason,
    });
  });
}

const root = document.getElementById("root");
if (!root) {
  throw new Error("Missing #root element");
}

createRoot(root).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
);
