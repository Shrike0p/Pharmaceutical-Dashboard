import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
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

function Router() {
  return (
    <Routes>
      {/* The marketing landing page lives at "/" and is built in the next
          pass; for now it simply sends visitors on to sign in. */}
      <Route path="/" element={<Navigate to="/signin" replace />} />

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
