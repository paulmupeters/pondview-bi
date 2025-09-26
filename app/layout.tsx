import type { Metadata } from "next";
import { Geist_Mono, Noto_Sans, Roboto } from "next/font/google";
import "./globals.css";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

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
  return (
    <html lang="en" className="h-full">
      <body
        className={`${notoSans.variable} ${geistMono.variable} antialiased h-full bg-background`}
      >
        <TooltipProvider>
          <SidebarProvider
            defaultOpen={true}
            style={
              {
                "--sidebar-width": "15rem",
                "--sidebar-width-icon": "5rem",
              } as React.CSSProperties
            }
          >
            <div className="flex h-full w-full">
              <AppSidebar />
              <SidebarInset className="flex-1 overflow-hidden">
                <div className="h-full bg-background/80 backdrop-blur-sm">
                  {children}
                </div>
              </SidebarInset>
            </div>
          </SidebarProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
