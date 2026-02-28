import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "next/navigation": fileURLToPath(
        new URL("./src/vite/next-navigation.ts", import.meta.url),
      ),
      "next/link": fileURLToPath(
        new URL("./src/vite/next-link.tsx", import.meta.url),
      ),
      "next/image": fileURLToPath(
        new URL("./src/vite/next-image.tsx", import.meta.url),
      ),
    },
  },
  build: {
    outDir: "dist",
  },
});
