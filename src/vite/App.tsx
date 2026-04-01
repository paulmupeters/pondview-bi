import { Navigate, Route, Routes, useParams, useSearchParams } from "react-router-dom";
import AnalysisPage from "@/app/analysis/page";
import DashboardsPage from "@/app/dashboards/page";
import DashboardViewPage from "@/app/dashboards/view/page";
import DataPage from "@/app/data/page";
import HomePage from "@/app/page";
import SettingsPage from "@/app/settings/page";
import SqlEditorPage from "@/app/sql-editor/page";
import { CommandPalette } from "@/components/CommandPalette";
import { CustomCssLoader } from "@/components/custom-css-loader";
import { SidebarLayout } from "@/components/sidebar-layout";
import { SqlRuntimeBootstrap } from "@/components/sql-runtime-bootstrap";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme-provider";

function ChatRedirect() {
  const [searchParams] = useSearchParams();
  const id = searchParams.get("id");
  const destination = id
    ? `/analysis?${searchParams.toString()}`
    : "/analysis";
  return <Navigate to={destination} replace />;
}

function LegacyDashboardDeepLinkRedirect() {
  const params = useParams<{ dashboardId: string }>();
  const dashboardId = params.dashboardId;
  if (!dashboardId) {
    return <Navigate to="/dashboards" replace />;
  }
  return (
    <Navigate
      to={`/dashboards/view?id=${encodeURIComponent(dashboardId)}`}
      replace
    />
  );
}

export function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="bi-chat-theme">
      <TooltipProvider>
        <CustomCssLoader />
        <SqlRuntimeBootstrap />
        <CommandPalette />
        <SidebarLayout>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/analysis" element={<AnalysisPage />} />
            <Route path="/chat" element={<ChatRedirect />} />
            <Route path="/dashboards" element={<DashboardsPage />} />
            <Route path="/dashboards/view" element={<DashboardViewPage />} />
            <Route
              path="/dashboards/:dashboardId"
              element={<LegacyDashboardDeepLinkRedirect />}
            />
            <Route path="/data" element={<DataPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/sql-editor" element={<SqlEditorPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </SidebarLayout>
      </TooltipProvider>
    </ThemeProvider>
  );
}
