"use client";

import type { AuthUser } from "@repo/auth/session";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo } from "react";
import { authClient, normalizeWebAuthSession } from "@/lib/auth/client";

type AuthState = {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  refreshSession: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const { data, isPending, error, refetch } = authClient.useSession();

  const session = normalizeWebAuthSession(data);

  const user = session?.user ?? null;
  const isAuthenticated = !!user;

  useEffect(() => {
    if (!isPending && error) {
      console.log("Authentication lost:", error.message);
    }
  }, [isPending, error]);

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
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

/**
 * Hook that enforces authentication and redirects to login if not authenticated
 */
export const useRequireAuth = (redirectTo: string = "/auth/login") => {
  const { user, isLoading, isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace(redirectTo);
    }
  }, [isLoading, isAuthenticated, redirectTo, router]);

  return { user, isLoading, isAuthenticated };
};

/**
 * Hook that redirects authenticated users away from public pages
 */
export const useRedirectIfAuthenticated = (redirectTo: string = "/") => {
  const { isLoading, isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace(redirectTo);
    }
  }, [isAuthenticated, isLoading, redirectTo, router]);

  return { isLoading, isAuthenticated };
};
