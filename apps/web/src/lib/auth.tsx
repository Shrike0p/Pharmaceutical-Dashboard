import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { LoginInput, LoginResponse, UserSummaryDto } from "@ecl/shared";
import { apiRequest, tokenStore } from "./api-client";

interface AuthState {
  user: UserSummaryDto | null;
  /** True until the stored token has been checked against the server. */
  isLoading: boolean;
  signIn: (input: LoginInput) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserSummaryDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // A token in storage is only a claim. Verify it against /auth/me on start-up
  // so an expired or revoked session does not render a signed-in shell that
  // then fails on every request.
  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      if (!tokenStore.get()) {
        setIsLoading(false);
        return;
      }
      try {
        const response = await apiRequest<{ data: UserSummaryDto }>("/api/auth/me");
        if (!cancelled) setUser(response.data);
      } catch {
        tokenStore.clear();
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void restoreSession();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (input: LoginInput) => {
    const result = await apiRequest<LoginResponse>("/api/auth/login", { method: "POST", body: input });
    tokenStore.set(result.token);
    setUser(result.user);
  }, []);

  const signOut = useCallback(() => {
    tokenStore.clear();
    setUser(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, isLoading, signIn, signOut }),
    [user, isLoading, signIn, signOut],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside an AuthProvider");
  return context;
}

/** Convenience for the several places that gate on the supervisor role. */
export function useIsSupervisor(): boolean {
  return useAuth().user?.role === "SUPERVISOR";
}
