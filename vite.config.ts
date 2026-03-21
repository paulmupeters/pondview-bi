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
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    build: {
      outDir: "dist",
    },
  };
});
