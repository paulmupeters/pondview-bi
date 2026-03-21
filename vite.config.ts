import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(async ({ command }) => {
  const plugins = [react()];

  if (command === "build") {
    const { visualizer } = await import("rollup-plugin-visualizer");
    plugins.push(visualizer());
  }

  return {
    plugins,
    resolve: {
      // CodeMirror extensions rely on instanceof checks, so mixed bundle copies
      // of these packages cause "Unrecognized extension value" at runtime.
      dedupe: [
        "@codemirror/autocomplete",
        "@codemirror/commands",
        "@codemirror/language",
        "@codemirror/lint",
        "@codemirror/search",
        "@codemirror/state",
        "@codemirror/theme-one-dark",
        "@codemirror/view",
        "codemirror",
      ],
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    build: {
      outDir: "dist",
    },
  };
});
