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
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
  discardRecovery: () => Promise<void> | undefined;
  service: ActivityRecorderService | null;
  recoveryCheckpoint: RecordingCheckpoint | null;
  resumeRecovery: () => Promise<void> | undefined;
}

const ActivityRecorderContext = createContext<ActivityRecorderContextValue | undefined>(undefined);

const RECORDER_CLEANUP_ATTEMPTS = 2;

async function cleanupRecorderService(service: ActivityRecorderService): Promise<void> {
  let failure: unknown;
  for (let attempt = 0; attempt < RECORDER_CLEANUP_ATTEMPTS; attempt += 1) {
    try {
      await service.cleanup({ dispose: true });
      return;
    } catch (error) {
      failure = error;
    }
  }
  throw failure;
}

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
 * const commands = useRecordingCommands(service);
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
  const teardownRequiredServiceRef = useRef<ActivityRecorderService | null>(null);
  const renderedProfileIdRef = useRef<string | null>(profile?.id ?? null);
  renderedProfileIdRef.current = profile?.id ?? null;
  if (serviceRef.current && profileIdRef.current !== renderedProfileIdRef.current) {
    teardownRequiredServiceRef.current = serviceRef.current;
  }
  const desiredProfileIdRef = useRef<string | null>(profile?.id ?? null);
  desiredProfileIdRef.current = profile?.id ?? null;
  const mountedRef = useRef(true);
  const lifecycleGenerationRef = useRef(0);
  const serviceTransitionRef = useRef<Promise<void>>(Promise.resolve());
  const recoveryTaskRef = useRef<{
    profileId: string;
    promise: Promise<void>;
    service: ActivityRecorderService;
  } | null>(null);
  const claimedRecoveryRef = useRef<{
    profileId: string;
    service: ActivityRecorderService;
    sessionId: string;
  } | null>(null);
  const [serviceTransitionRetry, setServiceTransitionRetry] = useState(0);
  const [serviceState, setServiceState] = useState<ActivityRecorderService | null>(null);
  const [recoveryCheckpoint, setRecoveryCheckpoint] = useState<RecordingCheckpoint | null>(null);
  const recoveryCheckpointRef = useRef<RecordingCheckpoint | null>(null);
  recoveryCheckpointRef.current = recoveryCheckpoint;
  const promptedRecoverySessionRef = useRef<string | null>(null);

  const releaseClaimForService = useCallback((owner: ActivityRecorderService) => {
    const claimed = claimedRecoveryRef.current;
    if (!claimed || claimed.service !== owner) return;
    releaseRecordingCheckpointClaim(claimed.sessionId);
    claimedRecoveryRef.current = null;
  }, []);

  const trackRecoveryTask = useCallback(
    (owner: ActivityRecorderService, profileId: string, promise: Promise<void>): Promise<void> => {
      const trackedTask = { profileId, promise, service: owner };
      recoveryTaskRef.current = trackedTask;
      const clearTrackedTask = () => {
        if (recoveryTaskRef.current === trackedTask) recoveryTaskRef.current = null;
      };
      void promise.then(clearTrackedTask, clearTrackedTask);
      return promise;
    },
    [],
  );

  useEffect(() => {
    void serviceTransitionRetry;
    const targetProfileId = profile?.id ?? null;
    const targetProfile: RecorderProfileRef | null = targetProfileId
      ? { id: targetProfileId }
      : null;
    let cancelled = false;
    desiredProfileIdRef.current = targetProfileId;
    const generation = lifecycleGenerationRef.current + 1;
    lifecycleGenerationRef.current = generation;

    // Hide profile-scoped state immediately. Promise callbacks from an old
    // recovery prompt also consult the ref and become harmless after this reset.
    if (profileIdRef.current !== targetProfileId) {
      recoveryCheckpointRef.current = null;
      setRecoveryCheckpoint(null);
      promptedRecoverySessionRef.current = null;
      setServiceState(null);
    }

    const transition = serviceTransitionRef.current
      .catch(() => undefined)
      .then(async () => {
        if (
          cancelled ||
          !mountedRef.current ||
          lifecycleGenerationRef.current !== generation ||
          desiredProfileIdRef.current !== targetProfileId
        ) {
          return;
        }
        const existingService = serviceRef.current;
        const serviceToDispose =
          teardownRequiredServiceRef.current ??
          (existingService && profileIdRef.current !== targetProfileId ? existingService : null);
        if (serviceToDispose) {
          const recoveryTask = recoveryTaskRef.current;
          if (recoveryTask?.service === serviceToDispose) {
            await recoveryTask.promise;
          }
          await cleanupRecorderService(serviceToDispose);
          releaseClaimForService(serviceToDispose);
          if (teardownRequiredServiceRef.current === serviceToDispose) {
            teardownRequiredServiceRef.current = null;
          }
          if (serviceRef.current === serviceToDispose) {
            serviceRef.current = null;
            profileIdRef.current = null;
          }
        }

        if (
          cancelled ||
          !mountedRef.current ||
          !targetProfile ||
          lifecycleGenerationRef.current !== generation ||
          desiredProfileIdRef.current !== targetProfileId
        ) {
          return;
        }
        if (serviceRef.current && profileIdRef.current === targetProfileId) {
          setServiceState(serviceRef.current);
          return;
        }

        const { ActivityRecorderService } =
          require("../services/ActivityRecorder") as typeof import("../services/ActivityRecorder");
        const nextService = new ActivityRecorderService(targetProfile);
        if (
          cancelled ||
          !mountedRef.current ||
          lifecycleGenerationRef.current !== generation ||
          desiredProfileIdRef.current !== targetProfileId
        ) {
          await cleanupRecorderService(nextService);
          return;
        }
        serviceRef.current = nextService;
        profileIdRef.current = targetProfileId;
        setServiceState(nextService);
      });
    serviceTransitionRef.current = transition.catch((error) => {
      console.error("[ActivityRecorderProvider] Failed to transition recorder service", error);
      if (
        mountedRef.current &&
        lifecycleGenerationRef.current === generation &&
        desiredProfileIdRef.current === targetProfileId
      ) {
        Alert.alert(
          "Recording service unavailable",
          "Recorder cleanup did not finish safely. Try again before starting another recording.",
          [
            {
              text: "Try again",
              onPress: () => {
                if (mountedRef.current && desiredProfileIdRef.current === targetProfileId) {
                  setServiceTransitionRetry((value) => value + 1);
                }
              },
            },
          ],
          { cancelable: false },
        );
      }
    });

    return () => {
      cancelled = true;
    };
  }, [profile?.id, releaseClaimForService, serviceTransitionRetry]);

  const service = profile?.id && profileIdRef.current === profile.id ? serviceState : null;

  const resumeRecoveryCommand = useCallback((): Promise<void> | undefined => {
    const owner = serviceRef.current;
    const checkpoint = recoveryCheckpointRef.current;
    if (
      !owner ||
      !checkpoint ||
      !mountedRef.current ||
      desiredProfileIdRef.current !== checkpoint.profileId ||
      profileIdRef.current !== checkpoint.profileId
    ) {
      return undefined;
    }
    const operation = owner.resumeRecoveredRecording().then(() => {
      if (
        mountedRef.current &&
        desiredProfileIdRef.current === checkpoint.profileId &&
        profileIdRef.current === checkpoint.profileId &&
        serviceRef.current === owner &&
        recoveryCheckpointRef.current?.sessionId === checkpoint.sessionId
      ) {
        recoveryCheckpointRef.current = null;
        setRecoveryCheckpoint(null);
      }
    });
    return trackRecoveryTask(owner, checkpoint.profileId, operation);
  }, [trackRecoveryTask]);

  const discardRecoveryCommand = useCallback((): Promise<void> | undefined => {
    const owner = serviceRef.current;
    const checkpoint = recoveryCheckpointRef.current;
    if (
      !owner ||
      !checkpoint ||
      !mountedRef.current ||
      desiredProfileIdRef.current !== checkpoint.profileId ||
      profileIdRef.current !== checkpoint.profileId
    ) {
      return undefined;
    }
    const operation = owner.discardRecoveredRecording().then(() => {
      if (claimedRecoveryRef.current?.sessionId === checkpoint.sessionId) {
        claimedRecoveryRef.current = null;
      }
      if (
        mountedRef.current &&
        desiredProfileIdRef.current === checkpoint.profileId &&
        profileIdRef.current === checkpoint.profileId &&
        serviceRef.current === owner &&
        recoveryCheckpointRef.current?.sessionId === checkpoint.sessionId
      ) {
        recoveryCheckpointRef.current = null;
        setRecoveryCheckpoint(null);
        promptedRecoverySessionRef.current = null;
      }
    });
    return trackRecoveryTask(owner, checkpoint.profileId, operation);
  }, [trackRecoveryTask]);

  useEffect(() => {
    if (!service || !profile?.id) return;
    const recoveryProfileId = profile.id;
    let cancelled = false;
    const isCurrentRecoveryOwner = () =>
      !cancelled &&
      mountedRef.current &&
      desiredProfileIdRef.current === recoveryProfileId &&
      profileIdRef.current === recoveryProfileId &&
      serviceRef.current === service;
    const task = (async () => {
      try {
        const { checkpoint } = await prepareMobileRecordingStartup(recoveryProfileId);
        if (!isCurrentRecoveryOwner() || checkpoint.status !== "recovered") return;
        const claimed = await loadAndClaimRecordingCheckpoint(recoveryProfileId);
        if (claimed.status !== "recovered") return;
        claimedRecoveryRef.current = {
          profileId: recoveryProfileId,
          service,
          sessionId: claimed.checkpoint.sessionId,
        };
        if (!isCurrentRecoveryOwner()) {
          releaseRecordingCheckpointClaim(claimed.checkpoint.sessionId);
          claimedRecoveryRef.current = null;
          return;
        }
        try {
          await service.stageRecoveredCheckpoint(claimed.checkpoint);
          if (isCurrentRecoveryOwner()) {
            recoveryCheckpointRef.current = claimed.checkpoint;
            setRecoveryCheckpoint(claimed.checkpoint);
          } else {
            releaseRecordingCheckpointClaim(claimed.checkpoint.sessionId);
            claimedRecoveryRef.current = null;
          }
        } catch (error) {
          const reason = error instanceof Error ? error.message : "Checkpoint replay failed";
          releaseRecordingCheckpointClaim(claimed.checkpoint.sessionId);
          claimedRecoveryRef.current = null;
          if (isCurrentRecoveryOwner()) {
            await quarantineActiveRecordingCheckpoint(reason, claimed.checkpoint.profileId);
            if (isCurrentRecoveryOwner()) {
              Alert.alert("Recording recovery unavailable", reason);
            }
          }
        }
      } catch (error) {
        if (isCurrentRecoveryOwner()) {
          console.warn(
            "[ActivityRecorderProvider] Unable to inspect saved recording recovery",
            error,
          );
        }
      }
    })();
    void trackRecoveryTask(service, recoveryProfileId, task);
    return () => {
      cancelled = true;
    };
  }, [profile?.id, service, trackRecoveryTask]);

  useEffect(() => {
    if (!service || !recoveryCheckpoint) return;
    if (promptedRecoverySessionRef.current === recoveryCheckpoint.sessionId) return;
    promptedRecoverySessionRef.current = recoveryCheckpoint.sessionId;
    const recoveryService = service;
    const recoveryProfileId = recoveryCheckpoint.profileId;
    const recoverySessionId = recoveryCheckpoint.sessionId;
    const isCurrentRecovery = () =>
      mountedRef.current &&
      desiredProfileIdRef.current === recoveryProfileId &&
      profileIdRef.current === recoveryProfileId &&
      serviceRef.current === recoveryService &&
      recoveryCheckpointRef.current?.sessionId === recoverySessionId;
    const isCurrentRecoveryService = () =>
      mountedRef.current &&
      desiredProfileIdRef.current === recoveryProfileId &&
      profileIdRef.current === recoveryProfileId &&
      serviceRef.current === recoveryService;

    function discardRecovery() {
      if (!isCurrentRecovery()) return;
      const operation = discardRecoveryCommand();
      if (!operation) return;
      void operation
        .then(() => {
          if (!isCurrentRecoveryService()) return;
          promptedRecoverySessionRef.current = null;
        })
        .catch((error) => {
          if (!isCurrentRecovery()) return;
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
            if (!isCurrentRecovery()) return;
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
            if (!isCurrentRecovery()) return;
            const operation = resumeRecoveryCommand();
            if (!operation) return;
            void operation
              .then(() => {
                if (!isCurrentRecoveryService()) return;
                router.replace("/record");
              })
              .catch((error) => {
                if (!isCurrentRecovery()) return;
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
  }, [discardRecoveryCommand, recoveryCheckpoint, resumeRecoveryCommand, service]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    desiredProfileIdRef.current = renderedProfileIdRef.current;
    return () => {
      mountedRef.current = false;
      desiredProfileIdRef.current = null;
      const generation = lifecycleGenerationRef.current + 1;
      lifecycleGenerationRef.current = generation;
      recoveryCheckpointRef.current = null;
      promptedRecoverySessionRef.current = null;
      serviceTransitionRef.current = serviceTransitionRef.current
        .catch(() => undefined)
        .then(async () => {
          if (mountedRef.current || lifecycleGenerationRef.current !== generation) return;
          const currentService = serviceRef.current;
          if (!currentService) return;
          const recoveryTask = recoveryTaskRef.current;
          if (recoveryTask?.service === currentService) {
            await recoveryTask.promise;
          }
          if (mountedRef.current || lifecycleGenerationRef.current !== generation) return;
          await cleanupRecorderService(currentService);
          releaseClaimForService(currentService);
          if (teardownRequiredServiceRef.current === currentService) {
            teardownRequiredServiceRef.current = null;
          }
          if (serviceRef.current === currentService) {
            serviceRef.current = null;
            profileIdRef.current = null;
          }
        })
        .catch((error) => {
          console.error("[ActivityRecorderProvider] Failed to dispose recorder service", error);
        });
    };
  }, [releaseClaimForService]);

  const value = useMemo(
    () => ({
      discardRecovery: discardRecoveryCommand,
      service,
      recoveryCheckpoint,
      resumeRecovery: resumeRecoveryCommand,
    }),
    [discardRecoveryCommand, recoveryCheckpoint, resumeRecoveryCommand, service],
  );

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
 * const { plan } = useSessionView(service) ?? {};
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
 * const commands = useRecordingCommands(service);
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
  const { discardRecovery, recoveryCheckpoint, resumeRecovery } = useActivityRecorderService();
  return {
    checkpoint: recoveryCheckpoint,
    isRecoveryAvailable: recoveryCheckpoint !== null,
    resume: resumeRecovery,
    discard: discardRecovery,
  };
}
