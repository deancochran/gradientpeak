// auth-hooks.ts - Separate file for auth hooks that use API

import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { AppState } from "react-native";
import {
  deleteMobileAccount,
  updateMobileEmail,
  updateMobilePassword,
} from "@/lib/auth/account-management";
import { refreshMobileAuthSession } from "@/lib/auth/client";
import { useAuthStore } from "@/lib/stores/auth-store";
import { api } from "../api";

/**
 * useAuth - Primary auth hook with unified state management
 *
 * Combines Zustand store (session, user) with API query (profile).
 * Profile data is synced to store to maintain single source of truth.
 */

export const useAuth = () => {
  const store = useAuthStore();
  const utils = api.useUtils();
  const { session, user, ready, loading } = store;

  const isAuthenticated = useMemo(() => !!session?.user, [session]);

  // Compute verification status directly from user object
  // This is more reliable than the RPC for initial email verification
  const isEmailVerified = useMemo(() => {
    if (!user) return false;
    return !!user.emailVerified;
  }, [user]);

  // Source of truth for verification is Better Auth's emailVerified flag.
  const userStatus = useMemo(() => {
    if (!isAuthenticated) return null;
    return isEmailVerified ? ("verified" as const) : ("unverified" as const);
  }, [isAuthenticated, isEmailVerified]);

  // Use API query for profile data - this gives you caching, refetching, etc.
  const profileQuery = api.profiles.get.useQuery(
    undefined, // or whatever parameters your profile query needs
    {
      enabled: ready && !!user && isAuthenticated, // Only fetch if auth store is ready and user is authenticated
      staleTime: 5 * 60 * 1000, // Consider data stale after 5 minutes
      retry: false,
    },
  );

  useEffect(() => {
    if (!AppState?.addEventListener) {
      return;
    }

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active" && isAuthenticated) {
        void refreshMobileAuthSession();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [isAuthenticated]);

  // FIX: Sync profile from API to store - use ref to track if we've already synced this data
  const lastSyncedProfileId = useRef<string | null>(null);
  const lastSyncedOnboarded = useRef<boolean | null>(null);

  useEffect(() => {
    if (profileQuery.data) {
      // Only update if data actually changed
      const profileId = profileQuery.data.id;
      const onboarded = profileQuery.data.onboarded;

      if (lastSyncedProfileId.current !== profileId || lastSyncedOnboarded.current !== onboarded) {
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
      const result = await deleteMobileAccount();
      if (result.error) throw result.error;
      await useAuthStore.getState().clearSession();
    } catch (e) {
      console.error("Error deleting account:", e);
      throw e;
    }
  }, []); // No dependencies needed

  const updatePassword = useCallback(
    async (input: { currentPassword?: string; newPassword: string }) => {
      if (!user?.email) {
        throw new Error("No authenticated user found");
      }

      if (!input.currentPassword) {
        throw new Error("Current password is required");
      }

      const result = await updateMobilePassword({
        currentPassword: input.currentPassword,
        newPassword: input.newPassword,
      });

      if (result.error) {
        throw result.error;
      }
    },
    [user?.email],
  );

  const canUpdateEmail = true;
  const updateEmailUnavailableReason = null;

  const updateEmail = useCallback(async (input: { newEmail: string }) => {
    const result = await updateMobileEmail(input);

    if (result.error) {
      throw result.error;
    }

    return result;
  }, []);

  // FIX: Complete onboarding - stable callback
  const completeOnboarding = useCallback(async () => {
    if (!user) return;
    try {
      // Note: The DB update is now handled by the completeOnboarding API mutation.
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
    profile: store.profile ?? profileQuery.data,
    // Use computed email verification status for more reliable routing
    userStatus,
    onboardingStatus:
      store.onboardingStatus === true
        ? true
        : (profileQuery.data?.onboarded ?? store.onboardingStatus),
    loading: store.loading,
    ready: store.ready,
    error: store.error,
    isAuthenticated,
    isEmailVerified,

    // Actions
    deleteAccount,
    updateEmail,
    updatePassword,
    completeOnboarding,
    canUpdateEmail,
    updateEmailUnavailableReason,

    // Profile query status (for loading/error states)
    profileLoading: profileQuery.isLoading,
    profileError: profileQuery.error,
    refreshProfile: profileQuery.refetch,
    authUserLoading: false,
    authUserError: null,

    // Combined loading state
    isFullyLoaded: store.ready && !store.loading,
  };
};
