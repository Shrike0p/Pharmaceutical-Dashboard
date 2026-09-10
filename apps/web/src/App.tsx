import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { LoaderCircle } from "lucide-react";
import { AuthProvider } from "./lib/auth";
import { AppShell } from "./components/layout/AppShell";
import { RedirectIfAuthenticated, RequireAuth, RequireSupervisor } from "./components/layout/route-guards";
import { SignInPage } from "./features/auth/SignInPage";
import { OverviewPage } from "./features/overview/OverviewPage";
import { EquipmentListPage } from "./features/equipment/EquipmentListPage";
import { EquipmentDetailPage } from "./features/equipment/EquipmentDetailPage";
import { RecordsPage } from "./features/cleaning-records/RecordsPage";
import { AuditPage } from "./features/audit/AuditPage";
import { ProfilePage } from "./features/settings/ProfilePage";
import { UsersPage } from "./features/settings/UsersPage";
import { PreferencesPage } from "./features/settings/PreferencesPage";

/**
 * Lazy, on its own chunk: the landing page pulls in three.js for the
 * scroll-driven audit-trail scene, which nobody who only ever signs in and
 * uses the app should have to download. Route-split the other direction too
 * — a visitor who only looks at "/" never fetches the dashboard bundle.
 */
const LandingPage = lazy(() =>
  import("./features/landing/LandingPage").then((module) => ({ default: module.LandingPage })),
);

function RouteFallback() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <LoaderCircle className="size-6 animate-spin text-muted-foreground" aria-label="Loading" />
    </div>
  );
}

function Router() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<LandingPage />} />

        <Route element={<RedirectIfAuthenticated />}>
          <Route path="/signin" element={<SignInPage />} />
        </Route>

        <Route element={<RequireAuth />}>
          <Route path="/app" element={<AppShell />}>
            <Route index element={<OverviewPage />} />
            <Route path="equipment" element={<EquipmentListPage />} />
            <Route path="equipment/:equipmentId" element={<EquipmentDetailPage />} />
            <Route path="records" element={<RecordsPage />} />
            <Route path="audit" element={<AuditPage />} />
            <Route path="settings/profile" element={<ProfilePage />} />
            <Route path="settings/preferences" element={<PreferencesPage />} />
            <Route element={<RequireSupervisor />}>
              <Route path="settings/users" element={<UsersPage />} />
            </Route>
          </Route>
          {/* The pre-redesign URL shape, kept working for anything already
              bookmarked or shared before the app grew a sidebar. */}
          <Route path="/equipment/:equipmentId" element={<LegacyEquipmentRedirect />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

function LegacyEquipmentRedirect() {
  const path = window.location.pathname.replace(/^\/equipment\//, "/app/equipment/");
  return <Navigate to={path} replace />;
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Router />
      </AuthProvider>
    </BrowserRouter>
  );
}
