import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Pondview Docs",
  description:
    "Documentation for Pondview — getting started, workflows, and technical reference.",

  themeConfig: {
    nav: [{ text: "Home", link: "/" }],

    sidebar: [
      // User-facing topics first
      { text: "What Pondview Is", link: "/user/what-is-pondview" },
      { text: "Getting Started", link: "/user/getting-started" },
      { text: "Main Workflows", link: "/user/workflows" },
      { text: "Dashboards", link: "/guide/dashboards" },
      { text: "FAQ", link: "/user/faq" },
      { text: "Troubleshooting", link: "/user/troubleshooting" },
      // Setup and runtime reference
      {
        text: "AI Provider Configuration",
        link: "/guide/ai-provider-configuration",
      },
      { text: "Connected Data Sources", link: "/guide/connected-data-sources" },
      {
        text: "Uploads and Browser Storage",
        link: "/guide/uploads-and-browser-storage",
      },
      { text: "SQL Runtime Backends", link: "/guide/sql-runtime-backends" },
      { text: "Workspace Persistence", link: "/guide/workspace-persistence" },
      {
        text: "Git-Backed Project Artifacts",
        link: "/guide/git-backed-project-artifacts",
      },
      // DuckDB internals
      {
        text: "DuckDB Extension Connections",
        link: "/guide/duckdb-extension-connections",
      },
      { text: "DuckDB Usage Overview", link: "/guide/duckdb-usage-overview" },
      { text: "DuckDB WASM Usage", link: "/guide/duckdb-wasm-usage" },
      {
        text: "Semantic Layer Materialization",
        link: "/guide/semantic-layer-materialization",
      },
    ],

    socialLinks: [],
  },
});
