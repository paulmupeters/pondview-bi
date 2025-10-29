import type { Metadata } from "next";
import { Geist_Mono, Noto_Sans } from "next/font/google";
import "./globals.css";
import { CommandPalette } from "@/components/CommandPalette";
import { CustomCssLoader } from "@/components/custom-css-loader";
import { SidebarLayout } from "@/components/sidebar-layout";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme-provider";

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
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  console.log("layout rendered");
  return (
    <html lang="en" className="h-full">
      <body
        className={`${notoSans.variable} ${geistMono.variable} antialiased h-full bg-background`}
      >
        <ThemeProvider defaultTheme="system" storageKey="bi-chat-theme">
          <TooltipProvider>
            <CustomCssLoader />
            <CommandPalette />
            <SidebarLayout>{children}</SidebarLayout>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
