import type { Metadata } from "next";
import { Geist_Mono, Noto_Sans } from "next/font/google";
import "./globals.css";
import { CommandPalette } from "@/components/CommandPalette";
import { CustomCssLoader } from "@/components/custom-css-loader";
import { SidebarLayout } from "@/components/sidebar-layout";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  CUSTOM_CSS_KEY,
  CUSTOM_CSS_STYLE_ID,
  SELECTED_THEME_KEY,
  THEME_STYLE_ID,
} from "@/lib/custom-css";
import { listRecentChats } from "@/lib/repositories/chat";
import { ThemeProvider } from "@/lib/theme-provider";
import { themes } from "@/themes";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const notoSans = Noto_Sans({
  variable: "--font-noto-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Data Assistant - Analytics Dashboard",
  description: "Interactive data analysis and visualization platform",
};

const THEME_CSS_BY_NAME = Object.fromEntries(
  Object.values(themes).map((theme) => [theme.name, theme.css])
);

const THEME_BOOTSTRAP_SCRIPT = `(() => {
  try {
    const selectedTheme = localStorage.getItem(${JSON.stringify(SELECTED_THEME_KEY)});
    const customCss = localStorage.getItem(${JSON.stringify(CUSTOM_CSS_KEY)}) || "";
    const themeCssByName = ${JSON.stringify(THEME_CSS_BY_NAME)};
    const head = document.head;

    if (!head) return;

    const upsertStyle = (id, css) => {
      let styleElement = document.getElementById(id);
      if (!styleElement) {
        styleElement = document.createElement("style");
        styleElement.id = id;
        head.appendChild(styleElement);
      }
      styleElement.textContent = css;
    };

    if (selectedTheme && themeCssByName[selectedTheme]) {
      upsertStyle(${JSON.stringify(THEME_STYLE_ID)}, themeCssByName[selectedTheme]);
      upsertStyle(${JSON.stringify(CUSTOM_CSS_STYLE_ID)}, "");
      return;
    }

    if (customCss) {
      upsertStyle(${JSON.stringify(CUSTOM_CSS_STYLE_ID)}, customCss);
      upsertStyle(${JSON.stringify(THEME_STYLE_ID)}, "");
    }
  } catch {
    // no-op
  }
})();`;
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const initialChats = await listRecentChats().catch(() => []);

  return (
    <html lang="en" className="h-full">
      <head>
        <script id="theme-bootstrap">{THEME_BOOTSTRAP_SCRIPT}</script>
      </head>
      <body
        className={`${notoSans.variable} ${geistMono.variable} antialiased h-full bg-background`}
      >
        <ThemeProvider defaultTheme="system" storageKey="bi-chat-theme">
          <TooltipProvider>
            <CustomCssLoader />
            <CommandPalette />
            <SidebarLayout initialChats={initialChats}>
              {children}
            </SidebarLayout>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
