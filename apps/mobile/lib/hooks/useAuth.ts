// auth-hooks.ts - Separate file for auth hooks that use tRPC
import { useAuthStore } from "@/lib/stores/auth-store";
import { supabase } from "@/lib/supabase/client";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { trpc } from "../trpc";

/**
 * useAuth - Primary auth hook with unified state management
 *
 * Combines Zustand store (session, user) with tRPC query (profile).
 * Profile data is synced to store to maintain single source of truth.
 */

export const useAuth = () => {
  const store = useAuthStore();
  const utils = trpc.useUtils();
  const { session, user, ready, loading } = store;

  const isAuthenticated = useMemo(() => !!session?.user, [session]);

  // Compute verification status directly from user object
  // This is more reliable than the RPC for initial email verification
  const isEmailVerified = useMemo(() => {
    if (!user) return false;
    return !!user.email_confirmed_at;
  }, [user]);

  // Source of truth for verification is Supabase's email_confirmed_at.
  const userStatus = useMemo(() => {
    if (!isAuthenticated) return null;
    return isEmailVerified ? ("verified" as const) : ("unverified" as const);
  }, [isAuthenticated, isEmailVerified]);

  // FIX: Use store methods directly in useEffect, don't include them in deps
  useEffect(() => {
    if (!ready && !loading) {
      store.initialize();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, loading]); // Only depend on primitive values

  // Use tRPC query for profile data - this gives you caching, refetching, etc.
  const profileQuery = trpc.profiles.get.useQuery(
    undefined, // or whatever parameters your profile query needs
    {
      enabled: ready && !!user && isAuthenticated, // Only fetch if auth store is ready and user is authenticated
      staleTime: 5 * 60 * 1000, // Consider data stale after 5 minutes
      retry: 3,
    },
  );

  // FIX: Sync profile from tRPC to store - use ref to track if we've already synced this data
  const lastSyncedProfileId = useRef<string | null>(null);
  const lastSyncedOnboarded = useRef<boolean | null>(null);

  useEffect(() => {
    if (profileQuery.data) {
      // Only update if data actually changed
      const profileId = profileQuery.data.id;
      const onboarded = profileQuery.data.onboarded;

      if (
        lastSyncedProfileId.current !== profileId ||
        lastSyncedOnboarded.current !== onboarded
      ) {
        // Prevent stale query data from overwriting optimistic 'true' status
        if (store.onboardingStatus === true && onboarded === false) {
          console.log(
            "🛡️ Preventing stale profile query from overwriting optimistic onboarding status",
          );
        } else {
          store.setProfile(profileQuery.data);
          store.setOnboardingStatus(onboarded);
          lastSyncedProfileId.current = profileId;
          lastSyncedOnboarded.current = onboarded;
        }
      }
    } else if (profileQuery.isError || !isAuthenticated) {
      // Clear profile if query fails or user logs out
      if (lastSyncedProfileId.current !== null) {
        store.setProfile(null);
        store.setOnboardingStatus(null);
        lastSyncedProfileId.current = null;
        lastSyncedOnboarded.current = null;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileQuery.data, profileQuery.isError, isAuthenticated]); // Don't include store methods

  // FIX: Delete account - stable callback
  const deleteAccount = useCallback(async () => {
    try {
      const { error } = await supabase.rpc("delete_own_account");
      if (error) throw error;
      await useAuthStore.getState().clearSession();
    } catch (e) {
      console.error("Error deleting account:", e);
      throw e;
    }
  }, []); // No dependencies needed

  // FIX: Complete onboarding - stable callback
  const completeOnboarding = useCallback(async () => {
    if (!user) return;
    try {
      // Note: The DB update is now handled by the completeOnboarding TRPC mutation.
      // This function simply updates the local store to reflect the change immediately
      // and prevent navigation loops while the profile query re-fetches.
      const currentStore = useAuthStore.getState();
      currentStore.setOnboardingStatus(true);

      // Also update the profile in store if it exists
      if (currentStore.profile) {
        currentStore.setProfile({ ...currentStore.profile, onboarded: true });
      }

      // Invalidate profile query to fetch fresh data.
      // We intentionally don't await this to keep the UI responsive.
      void utils.profiles.get.invalidate();
    } catch (e) {
      console.error("Error completing onboarding:", e);
      throw e;
    }
  }, [user, utils]);

  return {
    // Auth state from Zustand (single source of truth)
    user,
    session,
    profile: store.profile, // Now from store (synced from tRPC)
    // Use computed email verification status for more reliable routing
    userStatus,
    onboardingStatus: store.onboardingStatus,
    loading: store.loading,
    ready: store.ready,
    error: store.error,
    isAuthenticated,
    isEmailVerified,

    // Actions
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
