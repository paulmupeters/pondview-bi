"use client";

import { useEffect } from "react";
import {
  applyCustomCss,
  clearCustomCss,
  getSelectedTheme,
  applyTheme,
} from "@/lib/custom-css";

export function CustomCssLoader() {
  useEffect(() => {
    try {
      // Check for selected theme first (theme takes precedence)
      const selectedTheme = getSelectedTheme();
      if (selectedTheme) {
        applyTheme(selectedTheme);
      } else {
        // Fall back to custom CSS if no theme is selected
        const savedCss = localStorage.getItem("CUSTOM_CSS") || "";
        if (savedCss) {
          applyCustomCss(savedCss);
        } else {
          clearCustomCss();
        }
      }
    } catch {
      // no-op
    }
  }, []);

  return null;
}


