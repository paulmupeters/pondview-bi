import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Pondview Docs",
  description:
    "Documentation for Pondview — getting started, workflows, data sources, dashboards, and app setup.",

  themeConfig: {
    nav: [
      { text: "Home", link: "/" },
      { text: "Guide", link: "/guide/" },
    ],

    sidebar: [
      { text: "Guide Home", link: "/guide/" },
      { text: "What Pondview Is", link: "/guide/what-is-pondview" },
      { text: "Getting Started", link: "/guide/getting-started" },
      { text: "Main Workflows", link: "/guide/workflows" },
      { text: "Dashboards", link: "/guide/dashboards" },
      { text: "FAQ", link: "/guide/faq" },
      { text: "Troubleshooting", link: "/guide/troubleshooting" },
      {
        text: "AI Provider Configuration",
        link: "/guide/ai-provider-configuration",
      },
      { text: "Pondview CLI", link: "/guide/cli" },
      { text: "Connected Data Sources", link: "/guide/connected-data-sources" },
      {
        text: "Uploads and Browser Storage",
        link: "/guide/uploads-and-browser-storage",
      },
      { text: "SQL Runtime Backends", link: "/guide/sql-runtime-backends" },
      { text: "Workspace Persistence", link: "/guide/workspace-persistence" },
      { text: "Sharing Dashboards", link: "/guide/sharing-dashboards" },
      {
        text: "Git-Backed Project Artifacts",
        link: "/guide/git-backed-project-artifacts",
      },
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
