"use client";

import type { AuthUser } from "@repo/auth/session";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect } from "react";
import { authClient } from "@/lib/auth-client";

type AuthState = {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  refreshSession: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  refreshSession: async () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const { data: session, isPending: isLoading, error, refetch } = authClient.useSession();

  const user = session?.user ?? null;
  const isAuthenticated = !!user;

  // Monitor authentication state changes
  useEffect(() => {
    if (!isLoading && error) {
      // User is not authenticated, could redirect here if needed
      console.log("Authentication lost:", error.message);
    }
  }, [isLoading, error]);

  const refreshSession = async () => {
    await refetch();
  };

  return (
    <AuthContext.Provider
      value={{
        user: user || null,
        isLoading,
        isAuthenticated,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
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
      router.push(redirectTo);
    }
  }, [isLoading, isAuthenticated, router, redirectTo]);

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
      router.push(redirectTo);
    }
  }, [isLoading, isAuthenticated, router, redirectTo]);

  return { isLoading, isAuthenticated };
};
