import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ROLE_LABELS } from "@ecl/shared";
import { Button } from "./components/ui";
import { AuthProvider, useAuth } from "./lib/auth";
import { LoginPage } from "./features/auth/LoginPage";
import { EquipmentListPage } from "./features/equipment/EquipmentListPage";
import { EquipmentDetailPage } from "./features/equipment/EquipmentDetailPage";

function AppShell() {
  const { user, signOut } = useAuth();
  if (!user) return null;

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-semibold text-slate-900">Equipment Cleaning Log</span>
          <span className="hidden text-xs text-slate-400 sm:inline">GxP audit trail</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-sm leading-tight font-medium text-slate-800">{user.name}</p>
            <p className="text-xs leading-tight text-slate-500">{ROLE_LABELS[user.role]}</p>
          </div>
          <Button variant="secondary" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}

function AuthenticatedApp() {
  const { user, isLoading } = useAuth();

  // Hold the shell back until the stored token has been checked, so the user
  // is not bounced to the login screen and back on every refresh.
  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <span
          aria-label="Loading"
          className="size-6 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600"
        />
      </div>
    );
  }

  if (!user) return <LoginPage />;

  return (
    <div className="min-h-dvh">
      <AppShell />
      <main>
        <Routes>
          <Route path="/" element={<EquipmentListPage />} />
          <Route path="/equipment/:equipmentId" element={<EquipmentDetailPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AuthenticatedApp />
      </AuthProvider>
    </BrowserRouter>
  );
}
