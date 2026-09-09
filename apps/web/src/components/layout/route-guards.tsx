import { Navigate, Outlet, useLocation } from "react-router-dom";
import { LoaderCircle } from "lucide-react";
import { useAuth, useIsSupervisor } from "@/lib/auth";

/** Holds the shell back until the stored token has been checked against the
 *  server, so a refresh does not flash the sign-in screen before bouncing
 *  back to wherever the user actually was. */
export function RequireAuth() {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <LoaderCircle className="size-6 animate-spin text-muted-foreground" aria-label="Loading" />
      </div>
    );
  }

  if (!user) return <Navigate to="/signin" state={{ from: location }} replace />;
  return <Outlet />;
}

/** Sends an already-signed-in visitor straight past the marketing/sign-in
 *  pages rather than making them sign in twice. */
export function RedirectIfAuthenticated({ to = "/app" }: { to?: string }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  return user ? <Navigate to={to} replace /> : <Outlet />;
}

/** Guards the Users settings page. Hidden from the sidebar for non-supervisors
 *  already, but the route itself must refuse a direct URL visit too. */
export function RequireSupervisor() {
  const isSupervisor = useIsSupervisor();
  return isSupervisor ? <Outlet /> : <Navigate to="/app/settings/profile" replace />;
}
