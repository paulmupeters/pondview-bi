import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Pondview Docs",
  description:
    "Documentation for Pondview — getting started, workflows, data sources, dashboards, and app setup.",

  head: [
    ["link", { rel: "icon", type: "image/svg+xml", href: "/pondview.svg" }],
  ],

  themeConfig: {
    // nav: [
    //   { text: "Home", link: "/" },
    //   { text: "Guide", link: "/guide/" },
    // ],

    sidebar: [
      {
        text: "Getting Started",
        items: [
          { text: "What Is Pondview?", link: "/guide/what-is-pondview" },
          { text: "First Steps", link: "/guide/getting-started" },
          { text: "Main Workflows", link: "/guide/workflows" },
        ],
      },
      {
        text: "Features",
        items: [
          { text: "Dashboards", link: "/guide/dashboards" },
          { text: "Sharing Dashboards", link: "/guide/sharing-dashboards" },
          {
            text: "AI Provider Configuration",
            link: "/guide/ai-provider-configuration",
          },
        ],
      },
      {
        text: "Data & Runtime",
        items: [
          {
            text: "Connected Data Sources",
            link: "/guide/connected-data-sources",
          },
          {
            text: "Uploads and Browser Storage",
            link: "/guide/uploads-and-browser-storage",
          },
          { text: "SQL Runtime Backends", link: "/guide/sql-runtime-backends" },
          {
            text: "Workspace Persistence",
            link: "/guide/workspace-persistence",
          },
          {
            text: "DuckDB Extension Connections",
            link: "/guide/duckdb-extension-connections",
          },
          {
            text: "DuckDB Usage Overview",
            link: "/guide/duckdb-usage-overview",
          },
          { text: "DuckDB WASM Usage", link: "/guide/duckdb-wasm-usage" },
          {
            text: "Semantic Layer Materialization",
            link: "/guide/semantic-layer-materialization",
          },
        ],
      },
      {
        text: "CLI & Projects",
        items: [
          { text: "Pondview CLI", link: "/guide/cli" },
          {
            text: "Git-Backed Project Artifacts",
            link: "/guide/git-backed-project-artifacts",
          },
        ],
      },
      {
        text: "Help",
        items: [
          { text: "FAQ", link: "/guide/faq" },
          { text: "Troubleshooting", link: "/guide/troubleshooting" },
        ],
      },
    ],

    socialLinks: [],
  },
});
