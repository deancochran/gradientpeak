import type {
  PortableWebRecordingArtifact,
  PortableWebRecordingReview,
  PortableWebRecordingSubmissionJob,
} from "@repo/core";
import { useBlocker } from "@tanstack/react-router";
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
  configureTimerOnlyRecording,
  createInitialTimerOnlyRecordingState,
  finishTimerOnlyRecording,
  getTimerOnlyRecordingTimes,
  pauseTimerOnlyRecording,
  recoverTimerOnlyRecording,
  resetTimerOnlyRecording,
  restoreFinishedTimerOnlyRecording,
  resumeTimerOnlyRecording,
  startTimerOnlyRecording,
  type TimerOnlyRecordingConfiguration,
  type TimerOnlyRecordingState,
  type TimerOnlyRecordingTransition,
} from "./timer-runtime";

type TimerOnlyRecordingContextValue = {
  state: TimerOnlyRecordingState;
  elapsedSeconds: number;
  movingSeconds: number;
  error: string | null;
  hydrationStatus: "hydrating" | "ready" | "error";
  hasRecoveredDraft: boolean;
  configure: (configuration: TimerOnlyRecordingConfiguration) => boolean;
  start: () => void;
  pause: () => void;
  resume: () => void;
  finish: () => Promise<void>;
  save: (review: PortableWebRecordingReview) => Promise<void>;
  reset: () => void;
  discardRecoveredDraft: () => void;
  discardFinalizedArtifact: () => Promise<void>;
  takeOver: () => Promise<void>;
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
}>;

export function TimerOnlyRecordingProvider({
  children,
  ownerId,
  storage,
}: TimerOnlyRecordingProviderProps) {
  const [draftStorage] = useState<WebRecordingStorage>(
    () => storage ?? new IndexedDbTimerDraftStorage(ownerId, getRecordingInstanceId()),
  );
  const [providerState, setProviderState] = useState<ProviderState>(() => ({
    recording: createInitialTimerOnlyRecordingState(),
    error: null,
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
  const commandInFlight = useRef(false);
  const drainInFlight = useRef(false);
  const recordingRef = useRef(providerState.recording);
  recordingRef.current = providerState.recording;
  const lifecycle = providerState.recording.reducer.lifecycle;
  const hasActiveSession =
    lifecycle === "recording" || lifecycle === "paused" || lifecycle === "finishing";

  useBlocker({
    disabled: !hasActiveSession,
    enableBeforeUnload: hasActiveSession,
    shouldBlockFn: ({ next }) => {
      if (next.pathname.startsWith("/record")) return false;
      return !window.confirm(
        "Leave the recorder? The current timer will be saved as a paused recovery draft.",
      );
    },
  });

  const hydrate = useCallback(async () => {
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
        const recovered = recoverTimerOnlyRecording(result.draft, hydratedAtMs);
        setProviderState({
          recording: recovered.state,
          error: recovered.rejectedReason,
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

      setProviderState((current) => ({
        ...current,
        recording: artifact
          ? restoreFinishedTimerOnlyRecording(artifact)
          : createInitialTimerOnlyRecordingState(),
        artifact,
        submissionJob,
        history,
        hasRecoveredDraft: false,
        hydrationStatus: "ready",
        canTakeOver: false,
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

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const enqueueStorage = useCallback((operation: () => Promise<void>) => {
    storageQueue.current = storageQueue.current
      .catch(() => undefined)
      .then(operation)
      .catch((error: unknown) => {
        setProviderState((current) => ({
          ...current,
          recording:
            current.recording.reducer.lifecycle === "recording"
              ? pauseTimerOnlyRecording(current.recording, Date.now()).state
              : current.recording,
          hydrationStatus:
            error instanceof TimerDraftStorageInUseError ||
            error instanceof TimerDraftStorageUnavailableError
              ? "error"
              : current.hydrationStatus,
          error:
            error instanceof TimerDraftStorageInUseError
              ? "Durable timer ownership moved to another tab. This session was paused to prevent conflicting drafts."
              : error instanceof TimerDraftStorageUnavailableError
                ? "Durable timer recovery became unavailable. This session was paused."
                : "The timer draft could not be saved.",
        }));
      });
  }, []);

  useEffect(() => {
    if (providerState.hydrationStatus !== "ready") return;
    enqueueStorage(() =>
      checkpointTimerDraft(draftStorage, providerState.recording, Date.now(), ownerId),
    );
  }, [
    draftStorage,
    enqueueStorage,
    ownerId,
    providerState.hydrationStatus,
    providerState.recording,
  ]);

  useEffect(() => {
    if (lifecycle !== "recording" && lifecycle !== "paused") return;

    const interval = window.setInterval(() => setNowMs(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, [lifecycle]);

  useEffect(() => {
    if (
      (lifecycle !== "recording" && lifecycle !== "paused") ||
      providerState.hydrationStatus !== "ready"
    )
      return;

    const interval = window.setInterval(() => {
      if (commandInFlight.current) return;
      enqueueStorage(() =>
        checkpointTimerDraft(draftStorage, providerState.recording, Date.now(), ownerId),
      );
    }, 15_000);
    return () => window.clearInterval(interval);
  }, [
    draftStorage,
    enqueueStorage,
    lifecycle,
    ownerId,
    providerState.hydrationStatus,
    providerState.recording,
  ]);

  const applyTransition = useCallback(
    (
      transition: (state: TimerOnlyRecordingState, nowMs: number) => TimerOnlyRecordingTransition,
    ) => {
      const commandNowMs = Date.now();
      setNowMs(commandNowMs);
      setProviderState((current) => {
        const result = transition(current.recording, commandNowMs);
        return { ...current, recording: result.state, error: result.rejectedReason };
      });
    },
    [],
  );

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
      applyTransition((state, commandNowMs) =>
        startTimerOnlyRecording(state, commandNowMs, createSessionId()),
      ),
    [applyTransition],
  );
  const pause = useCallback(() => applyTransition(pauseTimerOnlyRecording), [applyTransition]);
  const resume = useCallback(() => {
    setProviderState((current) => ({ ...current, hasRecoveredDraft: false }));
    applyTransition(resumeTimerOnlyRecording);
  }, [applyTransition]);
  const finish = useCallback(async () => {
    if (commandInFlight.current) return;
    commandInFlight.current = true;
    setProviderState((current) => ({ ...current, busy: true, error: null }));
    try {
      const now = Date.now();
      const finished = finishTimerOnlyRecording(recordingRef.current, now);
      if (finished.rejectedReason) throw new Error(finished.rejectedReason);
      const category = finished.state.reducer.snapshot?.activity.category ?? "other";
      const artifact = await finalizeTimerRecordingArtifact({
        state: finished.state,
        ownerId,
        segmentId: createSessionId(),
        review: {
          name: `${category[0]?.toUpperCase() ?? ""}${category.slice(1)} recording`,
          notes: null,
          perceivedEffort: null,
          distanceMeters: 0,
          calories: null,
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
      }));
    } finally {
      commandInFlight.current = false;
    }
  }, [draftStorage, ownerId]);

  const save = useCallback(
    async (review: PortableWebRecordingReview) => {
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
        }));
      } catch (error) {
        setProviderState((current) => ({
          ...current,
          busy: false,
          error: error instanceof Error ? error.message : "The recording could not be queued.",
        }));
      } finally {
        commandInFlight.current = false;
      }
    },
    [draftStorage, ownerId, providerState.artifact, providerState.submissionJob?.activityId],
  );
  const reset = useCallback(() => {
    const result = resetTimerOnlyRecording();
    setNowMs(Date.now());
    setProviderState((current) => ({
      ...current,
      recording: result.state,
      error: result.rejectedReason,
      hasRecoveredDraft: false,
      artifact: null,
      submissionJob: null,
    }));
    enqueueStorage(() => draftStorage.remove());
  }, [draftStorage, enqueueStorage]);
  const discardRecoveredDraft = useCallback(() => {
    const result = resetTimerOnlyRecording();
    setNowMs(Date.now());
    setProviderState((current) => ({
      ...current,
      recording: result.state,
      error: result.rejectedReason,
      hasRecoveredDraft: false,
    }));
    enqueueStorage(() => draftStorage.remove());
  }, [draftStorage, enqueueStorage]);
  const discardFinalizedArtifact = useCallback(async () => {
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
    await draftStorage.takeOver();
    await hydrate();
  }, [draftStorage, hydrate]);

  const retrySubmission = useCallback(async () => {
    if (!providerState.submissionJob) return;
    const submissionJob = await draftStorage.retrySubmissionNow(
      providerState.submissionJob.id,
      new Date().toISOString(),
    );
    setProviderState((current) => ({ ...current, submissionJob }));
  }, [draftStorage, providerState.submissionJob]);

  const drainSubmissionQueue = useCallback(
    async (submit: SubmitWebRecording) => {
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

  return (
    <TimerOnlyRecordingContext.Provider
      value={{
        state: providerState.recording,
        elapsedSeconds: times.elapsedSeconds,
        movingSeconds: times.movingSeconds,
        error: providerState.error,
        hydrationStatus: providerState.hydrationStatus,
        hasRecoveredDraft: providerState.hasRecoveredDraft,
        configure,
        start,
        pause,
        resume,
        finish,
        save,
        reset,
        discardRecoveredDraft,
        discardFinalizedArtifact,
        takeOver,
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

const RECORDING_INSTANCE_STORAGE_KEY = "gradientpeak.recording.instance-id";

function getRecordingInstanceId(): string {
  if (typeof window === "undefined") return createSessionId();
  const existing = window.sessionStorage.getItem(RECORDING_INSTANCE_STORAGE_KEY);
  if (existing) return existing;
  const instanceId = createSessionId();
  window.sessionStorage.setItem(RECORDING_INSTANCE_STORAGE_KEY, instanceId);
  return instanceId;
}
