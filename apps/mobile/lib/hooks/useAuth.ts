// auth-hooks.ts - Separate file for auth hooks that use API

import type { OnboardingStatus } from "@repo/core/schemas/onboarding";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { updateMobileEmail, updateMobilePassword } from "@/lib/auth/account-management";
import { hasSessionAuthCredentials } from "@/lib/auth/auth-headers";
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
  const { session, user, ready } = store;

  const isAuthenticated = useMemo(() => !!session?.user, [session]);
  const hasAuthCredentials = useMemo(() => hasSessionAuthCredentials(), []);

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

  const authState = useMemo(() => {
    if (!isAuthenticated) {
      return "anonymous" as const;
    }

    return isEmailVerified
      ? ("authenticated-verified" as const)
      : ("authenticated-unverified" as const);
  }, [isAuthenticated, isEmailVerified]);

  const shouldFetchProfile =
    ready && !!user && isAuthenticated && hasAuthCredentials && userStatus === "verified";

  // Use API query for profile data - this gives you caching, refetching, etc.
  const profileQuery = api.profiles.get.useQuery(
    undefined, // or whatever parameters your profile query needs
    {
      enabled: shouldFetchProfile, // Verified users should have profile access; unverified users stay on verify flow.
      staleTime: 5 * 60 * 1000, // Consider data stale after 5 minutes
      retry: false,
    },
  );

  // FIX: Sync profile from API to store - use ref to track if we've already synced this data
  const lastSyncedProfileId = useRef<string | null>(null);
  const lastSyncedOnboardingStatus = useRef<OnboardingStatus | null>(null);
  const lastSyncedUpdatedAt = useRef<string | null>(null);

  useEffect(() => {
    if (profileQuery.data) {
      // Only update if data actually changed
      const profileId = profileQuery.data.id;
      const onboardingStatus = profileQuery.data.onboarding_status;
      const updatedAt = profileQuery.data.updated_at ?? null;

      if (
        lastSyncedProfileId.current !== profileId ||
        lastSyncedOnboardingStatus.current !== onboardingStatus ||
        lastSyncedUpdatedAt.current !== updatedAt
      ) {
        store.setProfile(profileQuery.data);
        store.setOnboardingStatus(onboardingStatus);
        lastSyncedProfileId.current = profileId;
        lastSyncedOnboardingStatus.current = onboardingStatus;
        lastSyncedUpdatedAt.current = updatedAt;
      }
    } else if (profileQuery.isError || !isAuthenticated) {
      // Clear profile if query fails or user logs out
      if (lastSyncedProfileId.current !== null) {
        store.setProfile(null);
        store.setOnboardingStatus(null);
        lastSyncedProfileId.current = null;
        lastSyncedOnboardingStatus.current = null;
        lastSyncedUpdatedAt.current = null;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    profileQuery.data,
    profileQuery.isError,
    isAuthenticated,
    store.onboardingStatus,
    store.setOnboardingStatus,
    store.setProfile,
  ]); // Don't include store methods

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

  const refreshOnboardingStatus = useCallback(async () => {
    await utils.profiles.get.invalidate();
    const result = await profileQuery.refetch();
    if (result.data) {
      useAuthStore.getState().setProfile(result.data);
      useAuthStore.getState().setOnboardingStatus(result.data.onboarding_status);
    }
  }, [profileQuery, utils.profiles.get]);

  return {
    // Auth state from Zustand (single source of truth)
    user,
    session,
    authState,
    profile: store.profile ?? profileQuery.data,
    // Use computed email verification status for more reliable routing
    userStatus,
    onboardingStatus: profileQuery.data?.onboarding_status ?? store.onboardingStatus,
    loading: store.loading,
    ready: store.ready,
    error: store.error,
    isAuthenticated,
    isEmailVerified,

    // Actions
    updateEmail,
    updatePassword,
    refreshOnboardingStatus,
    completeOnboarding: refreshOnboardingStatus,
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
