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
      rolldownOptions: {
        output: {
          codeSplitting: {
            minSize: 20_000,
            maxSize: 450_000,
            groups: [
              {
                name: "vendor-react",
                test: /node_modules\/(react|react-dom|react-router-dom|scheduler)\//,
              },
              {
                name: "vendor-ai",
                test: /node_modules\/(@ai-sdk|ai)\//,
              },
              {
                name: "vendor-duckdb",
                test: /node_modules\/@duckdb\//,
                maxSize: 2_000_000,
              },
              {
                name: "vendor-codemirror",
                test: /node_modules\/(@codemirror|@uiw|codemirror|@lezer)\//,
                maxSize: 2_000_000,
              },
              {
                name: "vendor-recharts",
                test: /node_modules\/(recharts|d3-|d3|victory|redux)\//,
                maxSize: 2_000_000,
              },
              {
                name: "vendor-radix",
                test: /node_modules\/@radix-ui\//,
              },
              {
                name: "vendor-aws",
                test: /node_modules\/@aws-sdk\//,
              },
            ],
          },
        },
      },
    },
  };
});
