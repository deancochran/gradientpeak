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

import type { RecordingCheckpoint } from "@repo/core";
import { router } from "expo-router";
import type React from "react";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "react-native";
import type { ActivityRecorderService } from "../services/ActivityRecorder";
import {
  loadAndClaimRecordingCheckpoint,
  quarantineActiveRecordingCheckpoint,
  releaseRecordingCheckpointClaim,
} from "../services/ActivityRecorder/checkpointStorage";
import type { RecorderProfileRef } from "../services/ActivityRecorder/types";
import { prepareMobileRecordingStartup } from "../services/mobileRecordingStartup";

interface ActivityRecorderContextValue {
  service: ActivityRecorderService | null;
  recoveryCheckpoint: RecordingCheckpoint | null;
}

const ActivityRecorderContext = createContext<ActivityRecorderContextValue | undefined>(undefined);

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
  profile: RecorderProfileRef | null;
}) {
  // Use refs to maintain service instance across renders
  const serviceRef = useRef<ActivityRecorderService | null>(null);
  const profileIdRef = useRef<string | null>(null);
  const [recoveryCheckpoint, setRecoveryCheckpoint] = useState<RecordingCheckpoint | null>(null);
  const recoveryCheckpointRef = useRef<RecordingCheckpoint | null>(null);
  recoveryCheckpointRef.current = recoveryCheckpoint;
  const promptedRecoverySessionRef = useRef<string | null>(null);
  const protectedQuarantineRef = useRef(false);

  // Create or reuse service based on profile ID (stable)
  const service = useMemo(() => {
    const currentProfileId = profile?.id || null;

    // Reuse existing service if profile ID hasn't changed
    if (
      serviceRef.current &&
      profileIdRef.current === currentProfileId &&
      currentProfileId !== null
    ) {
      console.log("[ActivityRecorderProvider] Reusing service for profile:", currentProfileId);
      return serviceRef.current;
    }

    // Keep configured/active sessions alive until a higher-level flow explicitly resolves them.
    if (serviceRef.current?.hasConfiguredRecordingSetup) {
      console.warn(
        "[ActivityRecorderProvider] Recorder setup is active; keeping existing service during profile change",
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
      void serviceRef.current.cleanup({ dispose: true }).catch((error) => {
        console.error("[ActivityRecorderProvider] Failed to dispose recorder service", error);
      });
      serviceRef.current = null;
    }

    // Create new service if profile exists
    if (profile) {
      const { ActivityRecorderService } =
        require("../services/ActivityRecorder") as typeof import("../services/ActivityRecorder");
      console.log("[ActivityRecorderProvider] Creating new service for profile:", profile.id);
      serviceRef.current = new ActivityRecorderService(profile);
      profileIdRef.current = profile.id;
      return serviceRef.current;
    }

    // No profile, no service
    profileIdRef.current = null;
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, profile]); // Only recreate when profile ID changes (intentionally not full profile object)

  useEffect(() => {
    if (!service || !profile?.id) return;
    let cancelled = false;
    void prepareMobileRecordingStartup(profile.id)
      .then(async ({ checkpoint }) => {
        if (cancelled || checkpoint.status !== "recovered") return;
        const claimed = await loadAndClaimRecordingCheckpoint(profile.id);
        if (cancelled || claimed.status !== "recovered") return;
        try {
          await service.stageRecoveredCheckpoint(claimed.checkpoint);
          if (!cancelled) setRecoveryCheckpoint(claimed.checkpoint);
        } catch (error) {
          const reason = error instanceof Error ? error.message : "Checkpoint replay failed";
          await quarantineActiveRecordingCheckpoint(reason);
          protectedQuarantineRef.current = true;
          releaseRecordingCheckpointClaim(claimed.checkpoint.sessionId);
          if (!cancelled) Alert.alert("Recording recovery unavailable", reason);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          Alert.alert(
            "Recording recovery unavailable",
            error instanceof Error ? error.message : "Unable to inspect the saved recording",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [profile?.id, service]);

  useEffect(() => {
    if (!service || !recoveryCheckpoint) return;
    if (promptedRecoverySessionRef.current === recoveryCheckpoint.sessionId) return;
    promptedRecoverySessionRef.current = recoveryCheckpoint.sessionId;
    const recoveryService = service;

    function discardRecovery() {
      void recoveryService
        .discardRecoveredRecording()
        .then(() => {
          setRecoveryCheckpoint(null);
          promptedRecoverySessionRef.current = null;
        })
        .catch((error) => {
          promptedRecoverySessionRef.current = null;
          Alert.alert(
            "Unable to discard",
            error instanceof Error ? error.message : "The recovered recording was not discarded",
            [
              { text: "Keep", style: "cancel" },
              { text: "Try again", style: "destructive", onPress: discardRecovery },
            ],
          );
        });
    }

    Alert.alert(
      "Resume recording?",
      "A recording was interrupted. Resume from its last committed segment boundary or discard its local data.",
      [
        {
          text: "Discard",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "Discard recovered recording?",
              "This permanently removes the checkpoint and its recoverable stream files.",
              [
                { text: "Keep", style: "cancel" },
                {
                  text: "Discard",
                  style: "destructive",
                  onPress: discardRecovery,
                },
              ],
            );
          },
        },
        {
          text: "Resume",
          onPress: () => {
            void service
              .resumeRecoveredRecording()
              .then(() => {
                setRecoveryCheckpoint(null);
                router.replace("/record");
              })
              .catch((error) => {
                promptedRecoverySessionRef.current = null;
                Alert.alert(
                  "Unable to resume",
                  error instanceof Error ? error.message : "Recording recovery failed",
                );
              });
          },
        },
      ],
      { cancelable: false },
    );
  }, [recoveryCheckpoint, service]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (serviceRef.current) {
        if (recoveryCheckpointRef.current || protectedQuarantineRef.current) {
          if (recoveryCheckpointRef.current) {
            releaseRecordingCheckpointClaim(recoveryCheckpointRef.current.sessionId);
          }
          serviceRef.current = null;
          profileIdRef.current = null;
          return;
        }
        console.log("[ActivityRecorderProvider] Provider unmounting - cleanup service");
        void serviceRef.current.cleanup({ dispose: true }).catch((error) => {
          console.error("[ActivityRecorderProvider] Failed to dispose recorder service", error);
        });
        serviceRef.current = null;
        profileIdRef.current = null;
      }
    };
  }, []);

  const value = useMemo(() => ({ service, recoveryCheckpoint }), [recoveryCheckpoint, service]);

  return (
    <ActivityRecorderContext.Provider value={value}>{children}</ActivityRecorderContext.Provider>
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

export function useOptionalSharedActivityRecorder(): ActivityRecorderService | null {
  const context = useContext(ActivityRecorderContext);
  return context?.service ?? null;
}

export function useRecordingRecovery() {
  const { service, recoveryCheckpoint } = useActivityRecorderService();
  return {
    checkpoint: recoveryCheckpoint,
    isRecoveryAvailable: recoveryCheckpoint !== null,
    resume: () => service?.resumeRecoveredRecording(),
    discard: () => service?.discardRecoveredRecording(),
  };
}
