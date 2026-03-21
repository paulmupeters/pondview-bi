import { getTheme } from "@/themes";

export const THEME_STYLE_ID = "theme-style";
export const CUSTOM_CSS_STYLE_ID = "custom-css-style";
export const SELECTED_THEME_KEY = "SELECTED_THEME";
export const CUSTOM_CSS_KEY = "CUSTOM_CSS";

export function applyCustomCss(css: string) {
  if (typeof document === "undefined") return;
  // Clear theme selection when custom CSS is applied
  clearTheme();
  let styleElement = document.getElementById(CUSTOM_CSS_STYLE_ID);
  if (!styleElement) {
    styleElement = document.createElement("style");
    styleElement.id = CUSTOM_CSS_STYLE_ID;
    document.head.appendChild(styleElement);
  }
  styleElement.textContent = css;
}

export function clearCustomCss() {
  if (typeof document === "undefined") return;
  const styleElement = document.getElementById(CUSTOM_CSS_STYLE_ID);
  if (styleElement) {
    styleElement.textContent = "";
  }
}

export function getSelectedTheme(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(SELECTED_THEME_KEY);
}

export function setSelectedTheme(themeName: string | null) {
  if (typeof window === "undefined") return;
  if (themeName === null) {
    localStorage.removeItem(SELECTED_THEME_KEY);
  } else {
    localStorage.setItem(SELECTED_THEME_KEY, themeName);
  }
}

export function applyTheme(themeName: string) {
  if (typeof document === "undefined") return;

  const theme = getTheme(themeName);
  if (!theme) {
    console.warn(`Theme "${themeName}" not found`);
    return;
  }

  // Clear custom CSS when applying a theme
  clearCustomCss();

  // Apply theme CSS
  let styleElement = document.getElementById(THEME_STYLE_ID);
  if (!styleElement) {
    styleElement = document.createElement("style");
    styleElement.id = THEME_STYLE_ID;
    document.head.appendChild(styleElement);
  }
  styleElement.textContent = theme.css;

  // Save theme selection
  setSelectedTheme(themeName);
}

export function clearTheme() {
  if (typeof document === "undefined") return;
  const styleElement = document.getElementById(THEME_STYLE_ID);
  if (styleElement) {
    styleElement.textContent = "";
  }
  setSelectedTheme(null);
}
