import { lazy, Suspense, useMemo } from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { CommandPalette } from "@/components/CommandPalette";
import { CustomCssLoader } from "@/components/custom-css-loader";
import { DashboardModeNav } from "@/components/dashboard-mode-nav";
import { SidebarLayout } from "@/components/sidebar-layout";
import { SqlRuntimeBootstrap } from "@/components/sql-runtime-bootstrap";
import { TooltipProvider } from "@/components/ui/tooltip";
import { resolveDashboardMode } from "@/lib/dashboard-mode";
import { ThemeProvider } from "@/lib/theme-provider";

const AllAnalysesPage = lazy(() => import("@/app/analysis/all/page"));
const AnalysisPage = lazy(() => import("@/app/analysis/page"));
const DashboardsPage = lazy(() => import("@/app/dashboards/page"));
const DashboardViewPage = lazy(() => import("@/app/dashboards/view/page"));
const DataPage = lazy(() => import("@/app/data/page"));
const HomePage = lazy(() => import("@/app/page"));
const SettingsPage = lazy(() => import("@/app/settings/page"));
const SqlEditorPage = lazy(() => import("@/app/sql-editor/page"));

function ChatRedirect() {
  const [searchParams] = useSearchParams();
  const id = searchParams.get("id");
  const destination = id ? `/analysis?${searchParams.toString()}` : "/analysis";
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

export function isDashboardModeRoutePath(pathname: string): boolean {
  return pathname === "/dashboards" || pathname === "/dashboards/view";
}

function DashboardModeRoutes() {
  return (
    <div className="flex h-full w-full flex-col bg-background">
      <DashboardModeNav />
      <main className="min-h-0 flex-1 overflow-hidden">
        <Suspense fallback={null}>
          <Routes>
            <Route path="/dashboards" element={<DashboardsPage />} />
            <Route path="/dashboards/view" element={<DashboardViewPage />} />
            <Route
              path="/dashboards/:dashboardId"
              element={<LegacyDashboardDeepLinkRedirect />}
            />
            <Route path="*" element={<Navigate to="/dashboards" replace />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}

function AppRoutes() {
  return (
    <SidebarLayout>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/analysis" element={<AnalysisPage />} />
          <Route path="/analysis/all" element={<AllAnalysesPage />} />
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
      </Suspense>
    </SidebarLayout>
  );
}

export function App() {
  const location = useLocation();
  const isDashboardMode = useMemo(
    () => resolveDashboardMode(location.search),
    [location.search],
  );

  return (
    <ThemeProvider defaultTheme="system" storageKey="pondview-theme">
      <TooltipProvider>
        <CustomCssLoader />
        <SqlRuntimeBootstrap />
        {isDashboardMode ? (
          <DashboardModeRoutes />
        ) : (
          <>
            <CommandPalette />
            <AppRoutes />
          </>
        )}
      </TooltipProvider>
    </ThemeProvider>
  );
}
