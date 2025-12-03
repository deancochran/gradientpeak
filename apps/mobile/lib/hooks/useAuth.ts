// auth-hooks.ts - Separate file for auth hooks that use tRPC
import { useAuthStore } from "@/lib/stores/auth-store";
import { useRouter } from "expo-router";
import { useEffect, useMemo } from "react";
import { trpc } from "../trpc";

/**
 * useAuth - Primary auth hook with unified state management
 *
 * Combines Zustand store (session, user) with tRPC query (profile).
 * Profile data is synced to store to maintain single source of truth.
 */

export const useAuth = () => {
  const store = useAuthStore();
  const { session, user } = store;

  const isAuthenticated = useMemo(() => !!session?.user, [session]);

  useEffect(() => {
    if (!store.ready && !store.loading) {
      store.initialize();
    }
  }, [store.ready, store.loading, store.initialize]);

  // Use tRPC query for profile data - this gives you caching, refetching, etc.
  const profileQuery = trpc.profiles.get.useQuery(
    undefined, // or whatever parameters your profile query needs
    {
      enabled: !!user && isAuthenticated, // Only fetch if user is authenticated
      staleTime: 5 * 60 * 1000, // Consider data stale after 5 minutes
      retry: 3,
    },
  );

  // Sync profile from tRPC to store to maintain single source of truth
  useEffect(() => {
    if (profileQuery.data) {
      store.setProfile(profileQuery.data);
    } else if (profileQuery.isError || !isAuthenticated) {
      // Clear profile if query fails or user logs out
      store.setProfile(null);
    }
  }, [
    profileQuery.data,
    profileQuery.isError,
    isAuthenticated,
    store.setProfile,
  ]);

  return {
    // Auth state from Zustand (single source of truth)
    user,
    session,
    profile: store.profile, // Now from store (synced from tRPC)
    loading: store.loading,
    ready: store.ready,
    error: store.error,
    isAuthenticated,

    // Profile query status (for loading/error states)
    profileLoading: profileQuery.isLoading,
    profileError: profileQuery.error,
    refreshProfile: profileQuery.refetch,

    // Combined loading state
    isFullyLoaded: store.ready && !store.loading && !profileQuery.isLoading,
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
