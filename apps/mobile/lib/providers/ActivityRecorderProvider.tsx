/**
 * ActivityRecorderProvider - Shared Service Context
 *
 * Maintains a single, stable ActivityRecorderService instance across the app.
 * This ensures that activity selections, sensor connections, and service state
 * remain consistent across all screens and modals.
 *
 * The service is recreated only when the profile ID changes, preventing
 * the issue where multiple component instances create separate services
 * that don't share state.
 */

import type {
  PublicProfilesRow
} from "@repo/supabase";
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { ActivityRecorderService } from "../services/ActivityRecorder";

interface ActivityRecorderContextValue {
  service: ActivityRecorderService | null;
}

const ActivityRecorderContext = createContext<
  ActivityRecorderContextValue | undefined
>(undefined);

/**
 * Provider that maintains a single, stable ActivityRecorderService instance
 * shared across components. This ensures activity selections, sensor connections,
 * and service state are consistent across all screens.
 *
 * Key features:
 * - Single service instance per profile
 * - Stable instance across re-renders (uses profile.id, not profile object)
 * - Automatic cleanup on profile change or unmount
 * - Event listeners work reliably since all components use the same service
 *
 * @example
 * ```tsx
 * // In a layout:
 * <ActivityRecorderProvider profile={profile}>
 *   <YourScreens />
 * </ActivityRecorderProvider>
 *
 * // In child components:
 * const service = useSharedActivityRecorder();
 * const { selectActivity } = useRecorderActions(service);
 * ```
 */
export function ActivityRecorderProvider({
  children,
  profile,
}: {
  children: React.ReactNode;
  profile: PublicProfilesRow | null;
}) {
  // Use refs to maintain service instance across renders
  const serviceRef = useRef<ActivityRecorderService | null>(null);
  const profileIdRef = useRef<string | null>(null);

  // Create or reuse service based on profile ID (stable)
  const service = useMemo(() => {
    const currentProfileId = profile?.id || null;

    // Reuse existing service if profile ID hasn't changed
    if (
      serviceRef.current &&
      profileIdRef.current === currentProfileId &&
      currentProfileId !== null
    ) {
      console.log(
        "[ActivityRecorderProvider] Reusing service for profile:",
        currentProfileId,
      );
      return serviceRef.current;
    }

    // Clean up old service if profile changed
    if (serviceRef.current) {
      console.log(
        "[ActivityRecorderProvider] Profile changed, cleaning up old service:",
        profileIdRef.current,
        "→",
        currentProfileId,
      );
      serviceRef.current.cleanup();
      serviceRef.current = null;
    }

    // Create new service if profile exists
    if (profile) {
      console.log(
        "[ActivityRecorderProvider] Creating new service for profile:",
        profile.id,
      );
      serviceRef.current = new ActivityRecorderService(profile);
      profileIdRef.current = profile.id;
      return serviceRef.current;
    }

    // No profile, no service
    profileIdRef.current = null;
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]); // Only recreate when profile ID changes (intentionally not full profile object)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (serviceRef.current) {
        console.log(
          "[ActivityRecorderProvider] Provider unmounting - cleanup service",
        );
        serviceRef.current.cleanup();
        serviceRef.current = null;
        profileIdRef.current = null;
      }
    };
  }, []);

  const value = useMemo(() => ({ service }), [service]);

  return (
    <ActivityRecorderContext.Provider value={value}>
      {children}
    </ActivityRecorderContext.Provider>
  );
}

/**
 * Hook to access the shared ActivityRecorderService instance.
 * Must be used within an ActivityRecorderProvider.
 *
 * @throws Error if used outside ActivityRecorderProvider
 *
 * @example
 * ```tsx
 * const { service } = useActivityRecorderService();
 * const { plan } = usePlan(service);
 * ```
 */
export function useActivityRecorderService(): ActivityRecorderContextValue {
  const context = useContext(ActivityRecorderContext);
  if (context === undefined) {
    throw new Error(
      "useActivityRecorderService must be used within ActivityRecorderProvider. " +
        "Wrap your component tree with <ActivityRecorderProvider>.",
    );
  }
  return context;
}

/**
 * Convenience hook that returns just the service instance.
 * Useful for backward compatibility with existing code.
 *
 * @example
 * ```tsx
 * const service = useSharedActivityRecorder();
 * const { selectActivity } = useRecorderActions(service);
 * ```
 */
export function useSharedActivityRecorder(): ActivityRecorderService | null {
  const { service } = useActivityRecorderService();
  return service;
}
