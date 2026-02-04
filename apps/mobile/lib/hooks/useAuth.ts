// auth-hooks.ts - Separate file for auth hooks that use tRPC
import { useAuthStore } from "@/lib/stores/auth-store";
import { supabase } from "@/lib/supabase/client";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo } from "react";
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
      enabled: store.ready && !!user && isAuthenticated, // Only fetch if auth store is ready and user is authenticated
      staleTime: 5 * 60 * 1000, // Consider data stale after 5 minutes
      retry: 3,
    },
  );

  // Sync profile from tRPC to store to maintain single source of truth
  useEffect(() => {
    if (profileQuery.data) {
      store.setProfile(profileQuery.data);
      // Sync onboarding status from profile
      store.setOnboardingStatus(profileQuery.data.onboarded);
    } else if (profileQuery.isError || !isAuthenticated) {
      // Clear profile if query fails or user logs out
      store.setProfile(null);
      store.setOnboardingStatus(null);
    }
  }, [
    profileQuery.data,
    profileQuery.isError,
    isAuthenticated,
    store.setProfile,
    store.setOnboardingStatus,
  ]);

  // Check user status (verified/unverified)
  const checkUserStatus = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase.rpc("get_user_status");
      if (error) throw error;
      store.setUserStatus(data as "verified" | "unverified");
    } catch (e) {
      console.error("Error checking user status:", e);
    }
  }, [user, store]);

  // Delete account
  const deleteAccount = useCallback(async () => {
    try {
      const { error } = await supabase.rpc("delete_own_account");
      if (error) throw error;
      await store.clearSession();
    } catch (e) {
      console.error("Error deleting account:", e);
      throw e;
    }
  }, [store]);

  // Complete onboarding
  const completeOnboarding = useCallback(async () => {
    if (!user) return;
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ onboarded: true })
        .eq("id", user.id);

      if (error) throw error;

      store.setOnboardingStatus(true);
      // Also update the profile in store if it exists
      if (store.profile) {
        store.setProfile({ ...store.profile, onboarded: true });
      }
    } catch (e) {
      console.error("Error completing onboarding:", e);
      throw e;
    }
  }, [user, store]);

  // Check status on mount/auth
  useEffect(() => {
    if (isAuthenticated) {
      checkUserStatus();
    }
  }, [isAuthenticated, checkUserStatus]);

  return {
    // Auth state from Zustand (single source of truth)
    user,
    session,
    profile: store.profile, // Now from store (synced from tRPC)
    userStatus: store.userStatus,
    onboardingStatus: store.onboardingStatus,
    loading: store.loading,
    ready: store.ready,
    error: store.error,
    isAuthenticated,

    // Actions
    checkUserStatus,
    deleteAccount,
    completeOnboarding,

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
    console.log("🔄 useRedirectIfAuthenticated:", {
      loading: auth.loading,
      isAuthenticated: auth.isAuthenticated,
      ready: auth.ready,
      hasSession: !!auth.session,
      hasUser: !!auth.user,
    });

    if (auth.ready && !auth.loading && auth.isAuthenticated) {
      console.log("✅ Redirecting to:", redirectTo);
      router.replace(redirectTo);
    }
  }, [auth.ready, auth.loading, auth.isAuthenticated, router, redirectTo]);

  return auth;
};
