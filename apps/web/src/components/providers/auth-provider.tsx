import type { AuthUser } from "@repo/auth/session";
import { createContext, useCallback, useContext, useEffect, useMemo } from "react";

import { authClient, normalizeWebAuthSession } from "../../lib/auth/client";

type AuthState = {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  refreshSession: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { data, isPending, error, refetch } = authClient.useSession();

  const session = normalizeWebAuthSession(data);
  const user = session?.user ?? null;
  const isAuthenticated = Boolean(user);

  useEffect(() => {
    if (!isPending && error) {
      console.log("Authentication lost:", error.message);
    }
  }, [error, isPending]);

  const refreshSession = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const value = useMemo(
    () => ({
      user,
      isLoading: isPending,
      isAuthenticated,
      refreshSession,
    }),
    [isAuthenticated, isPending, refreshSession, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
}
