import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const devGatewayApiKey =
    command === "serve" ? env.AI_GATEWAY_API_KEY : undefined;

  return {
    plugins: [react()],
    define: {
      __DEV_AI_GATEWAY_API_KEY__: JSON.stringify(devGatewayApiKey ?? ""),
    },
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
