import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// Each MCP App view ships as one self-contained HTML file because hosts render
// it in a sandboxed iframe without network access. Single-file output cannot
// span multiple entries, so views are built one at a time via VIEW=<name>.
const view = process.env.VIEW ?? "visual";

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      // Phase 1 reuses chart components from the app in place; they move into
      // this package when the app is slimmed down.
      "@": fileURLToPath(new URL("../pondview-app/src", import.meta.url)),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: false,
    rolldownOptions: {
      input: fileURLToPath(new URL(`./${view}.html`, import.meta.url)),
    },
  },
});
