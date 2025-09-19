// auth-hooks.ts - Separate file for auth hooks that use tRPC
import { useAuthStore } from "@/lib/stores/auth-store";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { trpc } from "../trpc";

export const useAuth = () => {
  const store = useAuthStore();

  if (store.hydrated && !store.initialized) {
    store.initialize();
  }

  // Use tRPC query for profile data - this gives you caching, refetching, etc.
  const profileQuery = trpc.profiles.get.useQuery(
    undefined, // or whatever parameters your profile query needs
    {
      enabled: !!store.user && store.isAuthenticated, // Only fetch if user is authenticated
      staleTime: 5 * 60 * 1000, // Consider data stale after 5 minutes
      retry: 3,
    },
  );

  return {
    // Auth state from Zustand
    user: store.user,
    session: store.session,
    loading: store.loading,
    error: store.error,
    isAuthenticated: store.isAuthenticated,

    // Profile data from tRPC/React Query
    profile: profileQuery.data,
    profileLoading: profileQuery.isLoading,
    profileError: profileQuery.error,
    refreshProfile: profileQuery.refetch,

    // Combined loading state
    isFullyLoaded: !store.loading && !profileQuery.isLoading,
  };
};

/**
 * Hook that enforces authentication and redirects to login if not authenticated
 * Use this in protected routes
 */
export const useRequireAuth = (redirectTo = "/(external)/sign-in" as const) => {
  const auth = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!auth.loading && !auth.isAuthenticated) {
      router.replace(redirectTo);
    }
  }, [auth.loading, auth.isAuthenticated, router, redirectTo]);

  return auth;
};

/**
 * Hook that redirects authenticated users away from public pages
 * Use this in public routes like login/signup
 */
export const useRedirectIfAuthenticated = (
  redirectTo = "/(internal)/(tabs)" as const,
) => {
  const auth = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!auth.loading && auth.isAuthenticated) {
      router.replace(redirectTo);
    }
  }, [auth.loading, auth.isAuthenticated, router, redirectTo]);

  return auth;
};
