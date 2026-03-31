"use client";

import type { AuthUser } from "@repo/auth";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect } from "react";
import { api } from "@/lib/api/client";

type AuthState = {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  refreshSession: () => void;
};

const AuthContext = createContext<AuthState>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  refreshSession: () => {},
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const {
    data: session,
    isLoading,
    error,
    refetch,
  } = api.auth.getSession.useQuery(undefined, {
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const user = session?.user ?? null;
  const isAuthenticated = !!user;

  // Monitor authentication state changes
  useEffect(() => {
    if (!isLoading && error) {
      // User is not authenticated, could redirect here if needed
      console.log("Authentication lost:", error.message);
    }
  }, [isLoading, error]);

  const refreshSession = () => {
    void refetch();
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
    throw new Error("useSession must be used within a AuthProvider");
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
