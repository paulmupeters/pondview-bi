"use client";

import { useEffect } from "react";
import { applyCustomCss, clearCustomCss } from "@/lib/custom-css";

export function CustomCssLoader() {
  useEffect(() => {
    try {
      const savedCss = localStorage.getItem("CUSTOM_CSS") || "";
      if (savedCss) {
        applyCustomCss(savedCss);
      } else {
        clearCustomCss();
      }
    } catch {
      // no-op
    }
  }, []);

  return null;
}


