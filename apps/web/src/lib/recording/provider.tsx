import type {
  PortableWebRecordingArtifact,
  PortableWebRecordingReview,
  PortableWebRecordingSubmissionJob,
} from "@repo/core";
import { useBlocker, useLocation, useNavigate } from "@tanstack/react-router";
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  checkpointTimerDraft,
  IndexedDbTimerDraftStorage,
  loadTimerDraft,
  TimerDraftStorageInUseError,
  TimerDraftStorageUnavailableError,
  type WebRecordingStorage,
} from "./draft-storage";
import {
  finalizeTimerRecordingArtifact,
  sessionRpeOperationIdForReview,
} from "./finalized-artifact";
import { drainWebRecordingSubmissionQueue, type SubmitWebRecording } from "./submission-queue";
import {
  advanceTimerOnlyRecording,
  captureTimerOnlyLap,
  completeCurrentPlanStep,
  configureTimerOnlyRecording,
  createInitialTimerOnlyRecordingState,
  createTimerOnlyRecordingDraft,
  finishTimerOnlyRecording,
  getTimerOnlyPlanStatus,
  getTimerOnlyRecordingTimes,
  pauseTimerOnlyRecording,
  previousPlanStep,
  recoverTimerOnlyRecording,
  resetTimerOnlyRecording,
  restoreFinishedTimerOnlyRecording,
  resumeTimerOnlyRecording,
  skipCurrentPlanStep,
  startTimerOnlyRecording,
  type TimerOnlyPlanStatus,
  type TimerOnlyRecordingConfiguration,
  type TimerOnlyRecordingState,
  type TimerOnlyRecordingTransition,
} from "./timer-runtime";

type TimerOnlyRecordingContextValue = {
  state: TimerOnlyRecordingState;
  elapsedSeconds: number;
  activeSeconds: number;
  movingSeconds: number;
  planStatus: TimerOnlyPlanStatus | null;
  error: string | null;
  statusMessage: string | null;
  savingCommand: boolean;
  durabilityFenced: boolean;
  backgroundPaused: boolean;
  hydrationStatus: "hydrating" | "ready" | "error";
  hasRecoveredDraft: boolean;
  configure: (configuration: TimerOnlyRecordingConfiguration) => boolean;
  start: () => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  completeStep: () => Promise<void>;
  previousStep: () => Promise<void>;
  skipStep: () => Promise<void>;
  lap: () => Promise<void>;
  finish: () => Promise<void>;
  save: (review: PortableWebRecordingReview) => Promise<void>;
  reset: () => void;
  cancel: () => Promise<void>;
  discardFinalizedArtifact: () => Promise<void>;
  takeOver: () => Promise<void>;
  retryDurableStorage: () => Promise<void>;
  retrySubmission: () => Promise<void>;
  drainSubmissionQueue: (submit: SubmitWebRecording) => Promise<void>;
  artifact: PortableWebRecordingArtifact | null;
  submissionJob: PortableWebRecordingSubmissionJob | null;
  history: PortableWebRecordingArtifact[];
  busy: boolean;
  canTakeOver: boolean;
};

type ProviderState = {
  recording: TimerOnlyRecordingState;
  error: string | null;
  statusMessage: string | null;
  savingCommand: boolean;
  backgroundPaused: boolean;
  hydrationStatus: "hydrating" | "ready" | "error";
  hasRecoveredDraft: boolean;
  artifact: PortableWebRecordingArtifact | null;
  submissionJob: PortableWebRecordingSubmissionJob | null;
  history: PortableWebRecordingArtifact[];
  busy: boolean;
  canTakeOver: boolean;
};

const TimerOnlyRecordingContext = createContext<TimerOnlyRecordingContextValue | null>(null);

type TimerOnlyRecordingProviderProps = PropsWithChildren<{
  ownerId: string;
  storage?: WebRecordingStorage;
  enabled?: boolean;
}>;

export function TimerOnlyRecordingProvider({
  children,
  ownerId,
  storage,
  enabled = true,
}: TimerOnlyRecordingProviderProps) {
  const [draftStorage, setDraftStorage] = useState<WebRecordingStorage | null>(
    () =>
      storage ??
      (enabled ? new IndexedDbTimerDraftStorage(ownerId, getRecordingInstanceId()) : null),
  );
  const [providerState, setProviderState] = useState<ProviderState>(() => ({
    recording: createInitialTimerOnlyRecordingState(),
    error: null,
    statusMessage: null,
    savingCommand: false,
    backgroundPaused: false,
    hydrationStatus: "hydrating",
    hasRecoveredDraft: false,
    artifact: null,
    submissionJob: null,
    history: [],
    busy: false,
    canTakeOver: false,
  }));
  const [nowMs, setNowMs] = useState(() => Date.now());
  const storageQueue = useRef<Promise<void>>(Promise.resolve());
  const durableCommandQueue = useRef<Promise<void>>(Promise.resolve());
  const durableCommandGeneration = useRef(0);
  const durabilityFenced = useRef(false);
  const commandInFlight = useRef(false);
  const checkpointGeneration = useRef(0);
  const drainInFlight = useRef(false);
  const enabledRef = useRef(enabled);
  const recordingRef = useRef(providerState.recording);
  const lastConfirmedRecordingRef = useRef(providerState.recording);
  const location = useLocation();
  const navigate = useNavigate();
  recordingRef.current = providerState.recording;
  enabledRef.current = enabled;
  const lifecycle = providerState.recording.reducer.lifecycle;
  const hasActiveSession =
    lifecycle === "recording" || lifecycle === "paused" || lifecycle === "finishing";

  useBlocker({
    disabled: !hasActiveSession,
    enableBeforeUnload: hasActiveSession,
    shouldBlockFn: ({ next }) => next.pathname !== "/record/session",
  });

  useEffect(() => {
    document.documentElement.dataset.recordingLocked = hasActiveSession ? "true" : "false";
    window.dispatchEvent(new Event("gradientpeak-recording-lock"));
    if (
      hasActiveSession &&
      providerState.hydrationStatus === "ready" &&
      location.pathname !== "/record/session"
    ) {
      void navigate({ to: "/record/session", replace: true });
    }
    return () => {
      delete document.documentElement.dataset.recordingLocked;
      window.dispatchEvent(new Event("gradientpeak-recording-lock"));
    };
  }, [hasActiveSession, location.pathname, navigate, providerState.hydrationStatus]);

  const hydrate = useCallback(async () => {
    if (!draftStorage) return;
    try {
      const result = await loadTimerDraft(draftStorage, ownerId);
      const history = await draftStorage.listArtifacts();
      const artifact = await draftStorage.loadLatestArtifact();
      const submissionJob = artifact
        ? await draftStorage.getSubmissionJob(artifact.recordingSessionId)
        : null;
      const hydratedAtMs = Date.now();
      setNowMs(hydratedAtMs);

      if (result.draft) {
        const recovered = recoverTimerOnlyRecording(result.draft);
        recordingRef.current = recovered.state;
        lastConfirmedRecordingRef.current = recovered.state;
        durabilityFenced.current = false;
        setProviderState({
          recording: recovered.state,
          error: recovered.rejectedReason,
          statusMessage: recovered.rejectedReason
            ? null
            : "Recording recovered at its last saved checkpoint and paused.",
          savingCommand: false,
          backgroundPaused: false,
          hydrationStatus: recovered.rejectedReason ? "error" : "ready",
          hasRecoveredDraft: !recovered.rejectedReason,
          artifact: null,
          submissionJob: null,
          history,
          busy: false,
          canTakeOver: false,
        });
        return;
      }

      const restoredRecording = artifact
        ? restoreFinishedTimerOnlyRecording(artifact)
        : createInitialTimerOnlyRecordingState();
      recordingRef.current = restoredRecording;
      lastConfirmedRecordingRef.current = restoredRecording;
      durabilityFenced.current = false;
      setProviderState((current) => ({
        ...current,
        recording: restoredRecording,
        artifact,
        submissionJob,
        history,
        hasRecoveredDraft: false,
        hydrationStatus: "ready",
        canTakeOver: false,
        statusMessage: null,
        savingCommand: false,
        backgroundPaused: false,
        error:
          result.status === "discarded-invalid"
            ? "An invalid saved timer draft was discarded."
            : null,
      }));
    } catch (error) {
      setProviderState((current) => ({
        ...current,
        hydrationStatus: "error",
        canTakeOver: error instanceof TimerDraftStorageInUseError,
        error:
          error instanceof TimerDraftStorageInUseError
            ? "This timer is active in another tab. Take over only if that tab is no longer recording."
            : error instanceof TimerDraftStorageUnavailableError
              ? "This browser cannot provide durable timer recovery because IndexedDB is unavailable."
              : "Saved timer recovery is unavailable.",
      }));
    }
  }, [draftStorage, ownerId]);

  const fenceDurabilityFailure = useCallback((error: unknown) => {
    if (durabilityFenced.current) return;
    durabilityFenced.current = true;
    const rollback = lastConfirmedRecordingRef.current;
    recordingRef.current = rollback;
    setProviderState((current) => ({
      ...current,
      recording: rollback,
      hydrationStatus:
        error instanceof TimerDraftStorageInUseError ||
        error instanceof TimerDraftStorageUnavailableError
          ? "error"
          : current.hydrationStatus,
      canTakeOver: error instanceof TimerDraftStorageInUseError,
      error:
        error instanceof TimerDraftStorageInUseError
          ? "Durable timer ownership moved to another tab. Unsaved changes were rolled back to the last local checkpoint."
          : error instanceof TimerDraftStorageUnavailableError
            ? "Durable timer recovery became unavailable. Unsaved changes were rolled back to the last local checkpoint."
            : "The latest recorder change could not be saved. Unsaved changes were rolled back to the last local checkpoint.",
      statusMessage: "Recording paused at its last confirmed local checkpoint.",
      savingCommand: false,
      backgroundPaused: false,
    }));
  }, []);

  useEffect(() => {
    if (!enabled || draftStorage) return;
    setDraftStorage(new IndexedDbTimerDraftStorage(ownerId, getRecordingInstanceId()));
  }, [draftStorage, enabled, ownerId]);

  useEffect(() => {
    if (!enabled || !draftStorage) return;
    void hydrate();
  }, [draftStorage, enabled, hydrate]);

  const enqueueStorage = useCallback(
    (operation: () => Promise<void>): Promise<void> => {
      if (!enabledRef.current) return Promise.resolve();
      storageQueue.current = storageQueue.current
        .catch(() => undefined)
        .then(async () => {
          if (!enabledRef.current || durabilityFenced.current) return;
          await operation();
        })
        .catch((error: unknown) => {
          fenceDurabilityFailure(error);
        });
      return storageQueue.current;
    },
    [fenceDurabilityFailure],
  );

  const checkpoint = useCallback(
    (state: TimerOnlyRecordingState, nowMs: number) => {
      if (
        !enabledRef.current ||
        !draftStorage ||
        commandInFlight.current ||
        durabilityFenced.current
      )
        return;
      const generation = checkpointGeneration.current;
      void enqueueStorage(async () => {
        if (
          commandInFlight.current ||
          durabilityFenced.current ||
          generation !== checkpointGeneration.current
        )
          return;
        await checkpointTimerDraft(draftStorage, state, nowMs, ownerId);
        lastConfirmedRecordingRef.current = toConfirmedRecoveryState(state, nowMs, ownerId);
      });
    },
    [draftStorage, enqueueStorage, ownerId],
  );

  useEffect(() => {
    if (providerState.hydrationStatus !== "ready") return;
    checkpoint(providerState.recording, Date.now());
  }, [checkpoint, providerState.hydrationStatus, providerState.recording]);

  useEffect(() => {
    if (
      (lifecycle !== "recording" && lifecycle !== "paused") ||
      providerState.hydrationStatus !== "ready"
    )
      return;

    const interval = window.setInterval(() => {
      checkpoint(providerState.recording, Date.now());
    }, 15_000);
    return () => window.clearInterval(interval);
  }, [lifecycle, checkpoint, providerState.hydrationStatus, providerState.recording]);

  const applyTransition = useCallback(
    (
      transition: (state: TimerOnlyRecordingState, nowMs: number) => TimerOnlyRecordingTransition,
    ) => {
      const commandNowMs = Date.now();
      const result = transition(recordingRef.current, commandNowMs);
      recordingRef.current = result.state;
      if (
        result.state.reducer.lifecycle !== "recording" &&
        result.state.reducer.lifecycle !== "paused"
      ) {
        lastConfirmedRecordingRef.current = result.state;
      }
      setNowMs(commandNowMs);
      setProviderState((current) => ({
        ...current,
        recording: result.state,
        error: result.rejectedReason,
      }));
    },
    [],
  );

  const applyDurableTransition = useCallback(
    (
      transition: (state: TimerOnlyRecordingState, nowMs: number) => TimerOnlyRecordingTransition,
      successMessage: string,
      options: {
        backgroundPaused?: boolean;
        clearRecovered?: boolean;
        announceImmediately?: boolean;
      } = {},
    ): Promise<void> => {
      if (!enabledRef.current) return Promise.resolve();
      if (durabilityFenced.current) {
        setProviderState((current) => ({
          ...current,
          error: "Local saving must be restored before the recording can continue.",
          statusMessage: "Retry local saving or take over the recording before continuing.",
        }));
        return Promise.resolve();
      }
      const commandNowMs = Date.now();
      const result = transition(recordingRef.current, commandNowMs);
      if (result.rejectedReason) {
        setProviderState((current) => ({
          ...current,
          error: result.rejectedReason,
          statusMessage: result.rejectedReason,
        }));
        return Promise.resolve();
      }

      const generation = ++durableCommandGeneration.current;
      commandInFlight.current = true;
      checkpointGeneration.current += 1;
      recordingRef.current = result.state;
      setNowMs(commandNowMs);
      setProviderState((current) => ({
        ...current,
        recording: result.state,
        error: null,
        savingCommand: true,
        ...(options.backgroundPaused === undefined
          ? {}
          : { backgroundPaused: options.backgroundPaused }),
        ...(options.clearRecovered ? { hasRecoveredDraft: false } : {}),
        ...(options.announceImmediately ? { statusMessage: successMessage } : {}),
      }));

      const operation = durableCommandQueue.current
        .catch(() => undefined)
        .then(async () => {
          if (!enabledRef.current || !draftStorage) {
            throw new TimerDraftStorageUnavailableError(
              "Durable recording storage is unavailable.",
            );
          }
          const write = storageQueue.current
            .catch(() => undefined)
            .then(async () => {
              if (durabilityFenced.current) return;
              await checkpointTimerDraft(draftStorage, result.state, commandNowMs, ownerId);
            });
          storageQueue.current = write.catch(() => undefined);
          await write;
          if (durabilityFenced.current) return;
          lastConfirmedRecordingRef.current = toConfirmedRecoveryState(
            result.state,
            commandNowMs,
            ownerId,
          );
          setProviderState((current) => ({
            ...current,
            error: null,
            statusMessage: successMessage,
          }));
        })
        .catch((error: unknown) => {
          fenceDurabilityFailure(error);
        })
        .finally(() => {
          if (durableCommandGeneration.current !== generation) return;
          commandInFlight.current = false;
          setProviderState((current) => ({ ...current, savingCommand: false }));
        });
      durableCommandQueue.current = operation;
      return operation;
    },
    [draftStorage, fenceDurabilityFailure, ownerId],
  );

  useEffect(() => {
    if (lifecycle !== "recording" && lifecycle !== "paused") return;

    const interval = window.setInterval(() => {
      const tickNowMs = Date.now();
      setNowMs(tickNowMs);
      if (durabilityFenced.current || recordingRef.current.reducer.lifecycle !== "recording") {
        return;
      }
      const previousOccurrenceIndex = recordingRef.current.planExecution?.currentOccurrenceIndex;
      const advanced = advanceTimerOnlyRecording(recordingRef.current, tickNowMs);
      const nextOccurrenceIndex = advanced.state.planExecution?.currentOccurrenceIndex;
      if (advanced.state === recordingRef.current) return;
      const successMessage =
        nextOccurrenceIndex === null
          ? "Plan steps completed automatically and saved."
          : typeof nextOccurrenceIndex === "number"
            ? `Advanced automatically to step ${nextOccurrenceIndex + 1} and saved.`
            : "Plan step advanced automatically and saved.";
      if (previousOccurrenceIndex !== nextOccurrenceIndex) {
        void applyDurableTransition(advanceTimerOnlyRecording, successMessage);
      }
    }, 250);
    return () => window.clearInterval(interval);
  }, [applyDurableTransition, lifecycle]);

  const configure = useCallback(
    (configuration: TimerOnlyRecordingConfiguration) => {
      if (hasActiveSession) return false;
      applyTransition((state) => configureTimerOnlyRecording(state, configuration));
      return true;
    },
    [applyTransition, hasActiveSession],
  );
  const start = useCallback(
    () =>
      applyDurableTransition(
        (state, commandNowMs) => startTimerOnlyRecording(state, commandNowMs, createSessionId()),
        "Recording started and saved locally.",
      ),
    [applyDurableTransition],
  );
  const pause = useCallback(
    () => applyDurableTransition(pauseTimerOnlyRecording, "Recording paused."),
    [applyDurableTransition],
  );
  const resume = useCallback(
    () =>
      applyDurableTransition(resumeTimerOnlyRecording, "Recording resumed.", {
        backgroundPaused: false,
        clearRecovered: true,
      }),
    [applyDurableTransition],
  );
  const completeStep = useCallback(
    () => applyDurableTransition(completeCurrentPlanStep, "Step completed and saved."),
    [applyDurableTransition],
  );
  const previousStep = useCallback(
    () => applyDurableTransition(previousPlanStep, "Previous step restored and saved."),
    [applyDurableTransition],
  );
  const skipStep = useCallback(
    () => applyDurableTransition(skipCurrentPlanStep, "Step skipped and saved."),
    [applyDurableTransition],
  );
  const lap = useCallback(
    () => applyDurableTransition(captureTimerOnlyLap, "Lap captured and saved."),
    [applyDurableTransition],
  );

  useEffect(() => {
    const pauseWhenHidden = () => {
      if (
        document.visibilityState !== "hidden" ||
        lifecycle !== "recording" ||
        recordingRef.current.reducer.lifecycle !== "recording"
      ) {
        return;
      }
      void applyDurableTransition(
        pauseTimerOnlyRecording,
        "Recording paused because this tab moved to the background. Return and Resume explicitly.",
        { backgroundPaused: true, announceImmediately: true },
      );
    };
    document.addEventListener("visibilitychange", pauseWhenHidden);
    pauseWhenHidden();
    return () => document.removeEventListener("visibilitychange", pauseWhenHidden);
  }, [applyDurableTransition, lifecycle]);

  const finish = useCallback(async () => {
    if (!enabledRef.current || !draftStorage) return;
    if (durabilityFenced.current) {
      setProviderState((current) => ({
        ...current,
        error: "Restore local saving before finishing this recording.",
      }));
      return;
    }
    if (commandInFlight.current) return;
    commandInFlight.current = true;
    setProviderState((current) => ({ ...current, busy: true, error: null }));
    try {
      const now = Date.now();
      const finished = finishTimerOnlyRecording(recordingRef.current, now);
      if (finished.rejectedReason) throw new Error(finished.rejectedReason);
      const activityCategory =
        finished.state.reducer.snapshot?.activity.activity_category ?? "other";
      const artifact = await finalizeTimerRecordingArtifact({
        state: finished.state,
        ownerId,
        segmentId: createSessionId(),
        review: {
          name:
            finished.state.reducer.snapshot?.planExecution?.name ??
            `${activityCategory[0]?.toUpperCase() ?? ""}${activityCategory.slice(1)} recording`,
          notes: null,
          perceivedEffort: null,
          distanceMeters: 0,
          calories: null,
          distanceEnteredManually: false,
          caloriesEnteredManually: false,
        },
        sessionRpeOperationId: null,
      });
      await storageQueue.current;
      await draftStorage.finalize(artifact);
      const history = await draftStorage.listArtifacts();
      setProviderState((current) => ({
        ...current,
        recording: finished.state,
        artifact,
        submissionJob: null,
        history,
        hasRecoveredDraft: false,
        busy: false,
        error: null,
        statusMessage: "Recording finished and saved locally for review.",
        backgroundPaused: false,
      }));
    } catch (error) {
      setProviderState((current) => ({
        ...current,
        busy: false,
        error:
          error instanceof TimerDraftStorageInUseError
            ? "Another tab took over this timer. Finalization was fenced and the recovery draft was retained."
            : error instanceof Error
              ? error.message
              : "The recording could not be finalized durably.",
        statusMessage: "Recording could not be finished.",
      }));
    } finally {
      commandInFlight.current = false;
    }
  }, [draftStorage, ownerId]);

  const save = useCallback(
    async (review: PortableWebRecordingReview) => {
      if (!enabledRef.current || !draftStorage) return;
      if (
        commandInFlight.current ||
        !providerState.artifact ||
        providerState.submissionJob?.activityId
      ) {
        return;
      }
      commandInFlight.current = true;
      setProviderState((current) => ({ ...current, busy: true, error: null }));
      try {
        const sessionRpeOperationId = sessionRpeOperationIdForReview({
          previous: providerState.artifact,
          perceivedEffort: review.perceivedEffort,
          createOperationId: createSessionId,
        });
        const artifact = await finalizeTimerRecordingArtifact({
          state: recordingRef.current,
          ownerId,
          segmentId: providerState.artifact.segmentId,
          review,
          sessionRpeOperationId,
        });
        const submissionJob = await draftStorage.enqueueSubmission(
          artifact,
          new Date().toISOString(),
        );
        const history = await draftStorage.listArtifacts();
        setProviderState((current) => ({
          ...current,
          artifact,
          submissionJob,
          history,
          busy: false,
          statusMessage: "Activity review saved to the submission queue.",
        }));
      } catch (error) {
        setProviderState((current) => ({
          ...current,
          busy: false,
          error: error instanceof Error ? error.message : "The recording could not be queued.",
          statusMessage: "Activity review could not be saved.",
        }));
      } finally {
        commandInFlight.current = false;
      }
    },
    [draftStorage, ownerId, providerState.artifact, providerState.submissionJob?.activityId],
  );
  const reset = useCallback(() => {
    if (!enabledRef.current || !draftStorage) return;
    const result = resetTimerOnlyRecording();
    recordingRef.current = result.state;
    lastConfirmedRecordingRef.current = result.state;
    durabilityFenced.current = false;
    setNowMs(Date.now());
    setProviderState((current) => ({
      ...current,
      recording: result.state,
      error: result.rejectedReason,
      hasRecoveredDraft: false,
      artifact: null,
      submissionJob: null,
      statusMessage: null,
      backgroundPaused: false,
      savingCommand: false,
    }));
    void enqueueStorage(() => draftStorage.remove());
  }, [draftStorage, enqueueStorage]);
  const cancel = useCallback(async () => {
    if (!enabledRef.current || !draftStorage) return;
    if (!window.confirm("Cancel this recording? Its saved timer will be deleted.")) return;
    if (commandInFlight.current) return;
    commandInFlight.current = true;
    checkpointGeneration.current += 1;
    setProviderState((current) => ({ ...current, busy: true, error: null }));
    try {
      const cleanup = storageQueue.current.catch(() => undefined).then(() => draftStorage.remove());
      storageQueue.current = cleanup.catch(() => undefined);
      await cleanup;
      const initial = createInitialTimerOnlyRecordingState();
      recordingRef.current = initial;
      lastConfirmedRecordingRef.current = initial;
      durabilityFenced.current = false;
      setNowMs(Date.now());
      setProviderState((current) => ({
        ...current,
        recording: initial,
        error: null,
        hasRecoveredDraft: false,
        artifact: null,
        submissionJob: null,
        busy: false,
        statusMessage: "Recording cancelled.",
        backgroundPaused: false,
        savingCommand: false,
      }));
    } catch (error) {
      setProviderState((current) => ({
        ...current,
        busy: false,
        error: error instanceof Error ? error.message : "The recording could not be cancelled.",
      }));
    } finally {
      commandInFlight.current = false;
    }
  }, [draftStorage]);
  const discardFinalizedArtifact = useCallback(async () => {
    if (!enabledRef.current || !draftStorage) return;
    const artifact = providerState.artifact;
    if (!artifact || commandInFlight.current) return;
    commandInFlight.current = true;
    setProviderState((current) => ({ ...current, busy: true, error: null }));
    try {
      const discarded = await draftStorage.discardArtifact(artifact.recordingSessionId);
      if (!discarded) throw new Error("A submitted recording is retained in local history.");
      const history = await draftStorage.listArtifacts();
      setProviderState((current) => ({
        ...current,
        recording: createInitialTimerOnlyRecordingState(),
        artifact: null,
        submissionJob: null,
        history,
        busy: false,
      }));
    } catch (error) {
      setProviderState((current) => ({
        ...current,
        busy: false,
        error: error instanceof Error ? error.message : "The recording could not be discarded.",
      }));
    } finally {
      commandInFlight.current = false;
    }
  }, [draftStorage, providerState.artifact]);

  const takeOver = useCallback(async () => {
    if (!enabledRef.current || !draftStorage) return;
    await draftStorage.takeOver();
    await hydrate();
  }, [draftStorage, hydrate]);

  const retryDurableStorage = useCallback(async () => {
    if (!enabledRef.current || !draftStorage || !durabilityFenced.current) return;
    commandInFlight.current = true;
    setProviderState((current) => ({ ...current, savingCommand: true }));
    try {
      await durableCommandQueue.current.catch(() => undefined);
      const confirmed = lastConfirmedRecordingRef.current;
      const retryNowMs = Date.now();
      const write = storageQueue.current
        .catch(() => undefined)
        .then(() => checkpointTimerDraft(draftStorage, confirmed, retryNowMs, ownerId));
      storageQueue.current = write.catch(() => undefined);
      await write;
      lastConfirmedRecordingRef.current = toConfirmedRecoveryState(confirmed, retryNowMs, ownerId);
      durabilityFenced.current = false;
      setProviderState((current) => ({
        ...current,
        recording: confirmed,
        error: null,
        hydrationStatus: "ready",
        canTakeOver: false,
        savingCommand: false,
        statusMessage:
          confirmed.reducer.lifecycle === "paused"
            ? "Local saving is restored. Resume when you are ready."
            : "Local saving is restored. You can start again.",
      }));
    } catch (error) {
      durabilityFenced.current = false;
      fenceDurabilityFailure(error);
    } finally {
      commandInFlight.current = false;
      setProviderState((current) => ({ ...current, savingCommand: false }));
    }
  }, [draftStorage, fenceDurabilityFailure, ownerId]);

  const retrySubmission = useCallback(async () => {
    if (!enabledRef.current || !draftStorage) return;
    if (!providerState.submissionJob) return;
    const submissionJob = await draftStorage.retrySubmissionNow(
      providerState.submissionJob.id,
      new Date().toISOString(),
    );
    setProviderState((current) => ({ ...current, submissionJob }));
  }, [draftStorage, providerState.submissionJob]);

  const drainSubmissionQueue = useCallback(
    async (submit: SubmitWebRecording) => {
      if (!enabledRef.current || !draftStorage) return;
      if (drainInFlight.current || commandInFlight.current) return;
      drainInFlight.current = true;
      commandInFlight.current = true;
      setProviderState((current) => ({
        ...current,
        busy: true,
        error: null,
        submissionJob:
          current.submissionJob &&
          current.submissionJob.status !== "submitted" &&
          current.submissionJob.status !== "review_required"
            ? { ...current.submissionJob, status: "submitting", nextAttemptAt: null }
            : current.submissionJob,
      }));
      try {
        const updates = await drainWebRecordingSubmissionQueue(draftStorage, submit);
        const currentId = providerState.artifact?.recordingSessionId;
        const submissionJob = currentId
          ? (updates.find((job) => job.id === currentId) ??
            (await draftStorage.getSubmissionJob(currentId)))
          : null;
        const history = await draftStorage.listArtifacts();
        const artifact = currentId
          ? (history.find((candidate) => candidate.recordingSessionId === currentId) ?? null)
          : null;
        setProviderState((current) => ({
          ...current,
          artifact,
          submissionJob,
          history,
          busy: false,
        }));
      } catch (error) {
        setProviderState((current) => ({
          ...current,
          busy: false,
          error:
            error instanceof Error
              ? error.message
              : "The recording submission could not be resumed.",
        }));
      } finally {
        drainInFlight.current = false;
        commandInFlight.current = false;
      }
    },
    [draftStorage, providerState.artifact?.recordingSessionId],
  );
  const times = getTimerOnlyRecordingTimes(providerState.recording, nowMs);
  const planStatus = getTimerOnlyPlanStatus(providerState.recording, nowMs);

  return (
    <TimerOnlyRecordingContext.Provider
      value={{
        state: providerState.recording,
        elapsedSeconds: times.elapsedSeconds,
        activeSeconds: times.activeSeconds,
        movingSeconds: times.movingSeconds,
        planStatus,
        error: providerState.error,
        statusMessage: providerState.statusMessage,
        savingCommand: providerState.savingCommand,
        durabilityFenced: durabilityFenced.current,
        backgroundPaused: providerState.backgroundPaused,
        hydrationStatus: providerState.hydrationStatus,
        hasRecoveredDraft: providerState.hasRecoveredDraft,
        configure,
        start,
        pause,
        resume,
        completeStep,
        previousStep,
        skipStep,
        lap,
        finish,
        save,
        reset,
        cancel,
        discardFinalizedArtifact,
        takeOver,
        retryDurableStorage,
        retrySubmission,
        drainSubmissionQueue,
        artifact: providerState.artifact,
        submissionJob: providerState.submissionJob,
        history: providerState.history,
        busy: providerState.busy,
        canTakeOver: providerState.canTakeOver,
      }}
    >
      {children}
    </TimerOnlyRecordingContext.Provider>
  );
}

export function useTimerOnlyRecording(): TimerOnlyRecordingContextValue {
  const recording = useContext(TimerOnlyRecordingContext);
  if (!recording) {
    throw new Error("useTimerOnlyRecording must be used within TimerOnlyRecordingProvider.");
  }
  return recording;
}

function createSessionId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error("Secure UUID generation is unavailable in this runtime.");
  }
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const versionByte = bytes[6];
  const variantByte = bytes[8];
  if (versionByte === undefined || variantByte === undefined) {
    throw new Error("Secure UUID generation returned insufficient entropy.");
  }
  bytes[6] = (versionByte & 0x0f) | 0x40;
  bytes[8] = (variantByte & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function toConfirmedRecoveryState(
  state: TimerOnlyRecordingState,
  nowMs: number,
  ownerId: string,
): TimerOnlyRecordingState {
  const draft = createTimerOnlyRecordingDraft(state, nowMs, ownerId);
  if (!draft) return state;
  const recovered = recoverTimerOnlyRecording(draft);
  if (recovered.rejectedReason) {
    throw new Error(recovered.rejectedReason);
  }
  return recovered.state;
}

const RECORDING_INSTANCE_STORAGE_KEY = "gradientpeak.recording.instance-id";

function getRecordingInstanceId(): string {
  if (typeof window === "undefined") return createSessionId();
  const existing = window.sessionStorage.getItem(RECORDING_INSTANCE_STORAGE_KEY);
  if (existing) return existing;
  const instanceId = createSessionId();
  window.sessionStorage.setItem(RECORDING_INSTANCE_STORAGE_KEY, instanceId);
  return instanceId;
}
