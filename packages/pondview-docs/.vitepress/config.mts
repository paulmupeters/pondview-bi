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
        ],
      },
      {
        text: "CLI & Projects",
        items: [{ text: "Pondview CLI", link: "/guide/cli" }],
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
