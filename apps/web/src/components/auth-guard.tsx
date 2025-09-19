"use client";

import { useRequireAuth } from "@/components/providers/auth-provider";
import { Loader2 } from "lucide-react";

interface AuthGuardProps {
  children: React.ReactNode;
  redirectTo?: string;
  fallback?: React.ReactNode;
}

/**
 * AuthGuard component that protects routes by requiring authentication
 * Automatically redirects unauthenticated users to the login page
 */
export const AuthGuard = ({
  children,
  redirectTo = "/auth/login",
  fallback,
}: AuthGuardProps) => {
  const { isLoading, isAuthenticated } = useRequireAuth(redirectTo);

  if (isLoading) {
    return (
      fallback || (
        <div className="flex h-svh w-full items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      )
    );
  }

  if (!isAuthenticated) {
    // Component will redirect via useRequireAuth hook
    return null;
  }

  return <>{children}</>;
};
