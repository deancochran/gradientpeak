import type {
  PortableWebRecordingArtifact,
  PortableWebRecordingReview,
  PortableWebRecordingSubmissionJob,
} from "@repo/core";
import {
  closeMeasuredWindow,
  emptyMeasuredJournal,
  MEASURED_BATCH_SIZE,
  MeasuredNotificationAppender,
  type MeasuredRecordingJournal,
  MeasuredRecordingLimitError,
  measuredRecordingPoints,
  openMeasuredWindow,
} from "@repo/core/recording/measured-journal";
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
  IndexedDbTimerDraftStorage,
  LegacyRecordingRecoveryRequiredError,
  loadTimerDraft,
  TimerDraftStorageInUseError,
  TimerDraftStorageUnavailableError,
  UnsupportedRecordingContractError,
  type WebRecordingStorage,
} from "./draft-storage";
import {
  finalizeTimerRecordingArtifact,
  sessionRpeOperationIdForReview,
} from "./finalized-artifact";
import { drainWebRecordingSubmissionQueue, type SubmitWebRecording } from "./submission-queue";
import {
  adjustTimerOnlyIntensity,
  advanceTimerOnlyRecording,
  captureTimerOnlyLap,
  changeTimerOnlyPlan,
  changeTimerOnlyRoute,
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
  type TimerOnlyRecordingPlanConfiguration,
  type TimerOnlyRecordingState,
  type TimerOnlyRecordingTransition,
} from "./timer-runtime";
import { useWebBluetoothRecorder } from "./use-web-bluetooth-recorder";
import type { WebBluetoothState } from "./web-bluetooth";

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
  changePlan: (plan: TimerOnlyRecordingPlanConfiguration | null) => Promise<boolean>;
  changeRoute: (routeId: string | null) => Promise<boolean>;
  adjustIntensity: (scale: number) => Promise<boolean>;
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
  cancel: (options?: { confirmed?: boolean }) => Promise<void>;
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
  legacyRecoveryAvailable: boolean;
  downloadLegacyArchive: () => Promise<void>;
  sensors: {
    state: WebBluetoothState;
    connect: () => Promise<void>;
    disconnect: () => void;
    requestControl: () => Promise<boolean>;
    setTargetPower: (watts: number) => Promise<boolean>;
  };
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
  const bluetooth = useWebBluetoothRecorder();
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
  const finalizationInFlight = useRef(false);
  const checkpointGeneration = useRef(0);
  const drainInFlight = useRef(false);
  const enabledRef = useRef(enabled);
  const recordingRef = useRef(providerState.recording);
  const lastConfirmedRecordingRef = useRef(providerState.recording);
  const measuredJournalRef = useRef<MeasuredRecordingJournal>(emptyMeasuredJournal());
  const confirmedJournalRef = useRef<MeasuredRecordingJournal>(emptyMeasuredJournal());
  const sampleCaptureFenced = useRef(false);
  const sampleAppender = useRef(new MeasuredNotificationAppender());
  const sampleFlushInFlight = useRef(false);
  const confirmedJournalSession = useRef<string | null>(null);
  const recoveryBlocked = useRef(true);
  const legacyRecoveryAvailable = useRef(false);
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
      void navigate({
        to: "/record/session",
        search: { activity_category: "run", gps: "off" },
        replace: true,
      });
    }
    return () => {
      delete document.documentElement.dataset.recordingLocked;
      window.dispatchEvent(new Event("gradientpeak-recording-lock"));
    };
  }, [hasActiveSession, location.pathname, navigate, providerState.hydrationStatus]);

  const hydrate = useCallback(async () => {
    if (!draftStorage) return;
    recoveryBlocked.current = true;
    sampleCaptureFenced.current = true;
    bluetooth.recorder.pauseSessionMetrics();
    setProviderState((current) => ({ ...current, hydrationStatus: "hydrating" }));
    try {
      await durableCommandQueue.current.catch(() => undefined);
      await storageQueue.current.catch(() => undefined);
      const result = await loadTimerDraft(draftStorage, ownerId);
      legacyRecoveryAvailable.current = Boolean(await draftStorage.getLegacyArchive());
      const history = await draftStorage.listArtifacts();
      const artifact = await draftStorage.loadLatestArtifact();
      const submissionJob = artifact
        ? await draftStorage.getSubmissionJob(artifact.recordingSessionId)
        : null;
      const hydratedAtMs = Date.now();
      setNowMs(hydratedAtMs);

      if (result.draft) {
        const recovered = recoverTimerOnlyRecording(result.draft);
        const recoveredJournal = closeMeasuredWindow(
          result.draft.measuredJournal ?? emptyMeasuredJournal(),
          result.draft.timing.updatedAt,
        );
        measuredJournalRef.current = {
          ...recoveredJournal,
          entries: [...recoveredJournal.entries],
        };
        confirmedJournalRef.current = recoveredJournal;
        confirmedJournalSession.current = result.draft.sessionSnapshot.identity.sessionId;
        const totals = measuredRecordingPoints(recoveredJournal);
        bluetooth.recorder.beginSessionMetrics({
          distanceMeters: totals.distanceMeters,
          calories: totals.calories,
        });
        bluetooth.recorder.pauseSessionMetrics();
        sampleCaptureFenced.current = true;
        recordingRef.current = recovered.state;
        lastConfirmedRecordingRef.current = recovered.state;
        durabilityFenced.current = false;
        recoveryBlocked.current = false;
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
        ? restoreFinishedTimerOnlyRecording({
            snapshot: artifact.snapshot,
            startedAt: artifact.startedAt,
            finishedAt: artifact.finishedAt,
            elapsedMs: artifact.elapsedMs,
            movingMs: artifact.movingMs,
            ...(artifact.planExecution ? { planExecution: artifact.planExecution } : {}),
            ...(artifact.guidance ? { guidance: artifact.guidance } : {}),
          })
        : lastConfirmedRecordingRef.current.reducer.lifecycle === "pending"
          ? lastConfirmedRecordingRef.current
          : createInitialTimerOnlyRecordingState();
      recordingRef.current = restoredRecording;
      lastConfirmedRecordingRef.current = restoredRecording;
      measuredJournalRef.current = artifact?.measuredJournal ?? emptyMeasuredJournal();
      confirmedJournalRef.current = measuredJournalRef.current;
      confirmedJournalSession.current = artifact?.recordingSessionId ?? null;
      sampleCaptureFenced.current = true;
      bluetooth.recorder.endSessionMetrics();
      durabilityFenced.current = false;
      recoveryBlocked.current = false;
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
            ? "An invalid saved timer recording was discarded."
            : null,
      }));
    } catch (error) {
      if (error instanceof LegacyRecordingRecoveryRequiredError)
        legacyRecoveryAvailable.current = true;
      recoveryBlocked.current = true;
      durabilityFenced.current = true;
      sampleCaptureFenced.current = true;
      bluetooth.recorder.pauseSessionMetrics();
      recordingRef.current = lastConfirmedRecordingRef.current;
      measuredJournalRef.current = {
        ...confirmedJournalRef.current,
        entries: [...confirmedJournalRef.current.entries],
      };
      setProviderState((current) => ({
        ...current,
        recording: lastConfirmedRecordingRef.current,
        hydrationStatus: "error",
        canTakeOver: error instanceof TimerDraftStorageInUseError,
        error:
          error instanceof UnsupportedRecordingContractError
            ? error.message
            : error instanceof LegacyRecordingRecoveryRequiredError
              ? error.message
              : error instanceof TimerDraftStorageInUseError
                ? "This timer is active in another tab. Take over only if that tab is no longer recording."
                : error instanceof TimerDraftStorageUnavailableError
                  ? "This browser cannot provide durable timer recovery because IndexedDB is unavailable."
                  : "Saved timer recovery is unavailable.",
      }));
    }
  }, [bluetooth.recorder, draftStorage, ownerId]);

  const fenceDurabilityFailure = useCallback(
    (error: unknown) => {
      if (durabilityFenced.current) return;
      durabilityFenced.current = true;
      sampleCaptureFenced.current = true;
      measuredJournalRef.current = {
        ...confirmedJournalRef.current,
        entries: [...confirmedJournalRef.current.entries],
      };
      const totals = measuredRecordingPoints(confirmedJournalRef.current);
      bluetooth.recorder.beginSessionMetrics({
        distanceMeters: totals.distanceMeters,
        calories: totals.calories,
      });
      bluetooth.recorder.pauseSessionMetrics();
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
          error instanceof MeasuredRecordingLimitError
            ? error.message
            : error instanceof TimerDraftStorageInUseError
              ? "Durable timer ownership moved to another tab. Unsaved changes were rolled back to the last local checkpoint."
              : error instanceof TimerDraftStorageUnavailableError
                ? "Durable timer recovery became unavailable. Unsaved changes were rolled back to the last local checkpoint."
                : "The latest recorder checkpoint could not be confirmed. Reload local saving to recover the committed prefix.",
        statusMessage:
          rollback.reducer.lifecycle === "finished"
            ? "The finished recording is retained; local saving needs attention."
            : "Recording paused at its last confirmed local checkpoint.",
        savingCommand: false,
        backgroundPaused: false,
      }));
    },
    [bluetooth.recorder],
  );

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

  const persistMeasuredPrefix = useCallback(
    async (
      state: TimerOnlyRecordingState,
      at: number,
      journal: MeasuredRecordingJournal,
      count: number,
    ) => {
      if (!draftStorage)
        throw new TimerDraftStorageUnavailableError("Local storage is unavailable.");
      const draft = createTimerOnlyRecordingDraft(state, at, ownerId);
      if (!draft) {
        await draftStorage.remove();
        lastConfirmedRecordingRef.current = state;
        return;
      }
      const sessionId = draft.sessionSnapshot.identity.sessionId;
      let cursor =
        confirmedJournalSession.current === sessionId
          ? confirmedJournalRef.current.entries.length
          : 0;
      if (cursor > count) return; // An obsolete periodic checkpoint must not rewind a newer prefix.
      do {
        if (durabilityFenced.current) return;
        const entries = journal.entries.slice(
          cursor,
          Math.min(count, cursor + MEASURED_BATCH_SIZE),
        );
        const header = {
          version: journal.version,
          provenance: journal.provenance,
          windows: journal.windows,
        };
        const committed = await draftStorage.appendMeasuredCheckpoint(draft, {
          header,
          expectedCursor: cursor,
          entries,
        });
        if (committed !== cursor + entries.length)
          throw new Error("Measured storage returned an invalid committed cursor.");
        if (confirmedJournalSession.current !== sessionId) {
          confirmedJournalSession.current = sessionId;
          confirmedJournalRef.current = emptyMeasuredJournal();
        }
        const durableEntries = confirmedJournalRef.current.entries;
        durableEntries.push(...entries);
        confirmedJournalRef.current = closeMeasuredWindow(
          { ...header, entries: durableEntries },
          draft.timing.updatedAt,
        );
        lastConfirmedRecordingRef.current = toConfirmedRecoveryState(state, at, ownerId);
        cursor = committed;
        if (!entries.length) break;
      } while (cursor < count);
    },
    [draftStorage, ownerId],
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
      const journal = measuredJournalRef.current;
      const count = journal.entries.length;
      void enqueueStorage(async () => {
        if (
          commandInFlight.current ||
          durabilityFenced.current ||
          generation !== checkpointGeneration.current
        )
          return;
        await persistMeasuredPrefix(state, nowMs, journal, count);
      });
    },
    [draftStorage, enqueueStorage, persistMeasuredPrefix],
  );

  const flushSamples = useCallback(() => {
    const state = recordingRef.current;
    if (
      sampleFlushInFlight.current ||
      commandInFlight.current ||
      durabilityFenced.current ||
      sampleCaptureFenced.current ||
      state.reducer.lifecycle !== "recording"
    )
      return;
    const journal = measuredJournalRef.current;
    const count = journal.entries.length;
    const committed =
      confirmedJournalSession.current === state.reducer.snapshot?.identity.sessionId
        ? confirmedJournalRef.current.entries.length
        : 0;
    if (count <= committed) return;
    sampleFlushInFlight.current = true;
    const at = Date.now();
    void enqueueStorage(() => persistMeasuredPrefix(state, at, journal, count)).finally(() => {
      sampleFlushInFlight.current = false;
    });
  }, [enqueueStorage, persistMeasuredPrefix]);

  useEffect(() => {
    if (lifecycle !== "recording") return;
    const timer = window.setInterval(flushSamples, 1_000);
    return () => window.clearInterval(timer);
  }, [flushSamples, lifecycle]);

  useEffect(
    () =>
      bluetooth.recorder.subscribeNotifications((notification) => {
        const state = recordingRef.current;
        if (
          !enabledRef.current ||
          !draftStorage ||
          providerState.hydrationStatus !== "ready" ||
          durabilityFenced.current ||
          sampleCaptureFenced.current ||
          state.reducer.lifecycle !== "recording"
        )
          return;
        try {
          const committed =
            confirmedJournalSession.current === state.reducer.snapshot?.identity.sessionId
              ? confirmedJournalRef.current.entries.length
              : 0;
          if (measuredJournalRef.current.entries.length - committed >= 4096)
            throw new MeasuredRecordingLimitError(
              "Measured recording storage cannot keep up with the sensor. Recording is paused; restore local saving before continuing.",
            );
          if (!sampleAppender.current.append(measuredJournalRef.current, notification)) return;
          if (measuredJournalRef.current.entries.length - committed >= MEASURED_BATCH_SIZE)
            flushSamples();
        } catch (error) {
          fenceDurabilityFailure(error);
        }
      }),
    [
      bluetooth.recorder,
      draftStorage,
      flushSamples,
      fenceDurabilityFailure,
      providerState.hydrationStatus,
    ],
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
      return result.rejectedReason === null;
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
        flushBeforeTransition?: boolean;
      } = {},
    ): Promise<void> => {
      if (!enabledRef.current) return Promise.resolve();
      if (finalizationInFlight.current) return Promise.resolve();
      if (durabilityFenced.current || recoveryBlocked.current) {
        setProviderState((current) => ({
          ...current,
          error: "Local saving must be restored before the recording can continue.",
          statusMessage: "Retry local saving or take over the recording before continuing.",
        }));
        return Promise.resolve();
      }
      const commandNowMs = Date.now();
      const previousState = recordingRef.current;
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
      const timestamp = new Date(commandNowMs).toISOString();
      try {
        if (
          previousState.reducer.snapshot?.identity.sessionId !==
          result.state.reducer.snapshot?.identity.sessionId
        ) {
          measuredJournalRef.current = emptyMeasuredJournal();
          bluetooth.recorder.beginSessionMetrics();
        }
        if (
          result.state.reducer.lifecycle === "recording" &&
          previousState.reducer.lifecycle !== "recording"
        ) {
          measuredJournalRef.current = openMeasuredWindow(measuredJournalRef.current, timestamp);
          bluetooth.recorder.resumeSessionMetrics();
          sampleCaptureFenced.current = false;
        } else if (result.state.reducer.lifecycle !== "recording") {
          measuredJournalRef.current = closeMeasuredWindow(measuredJournalRef.current, timestamp);
          bluetooth.recorder.pauseSessionMetrics();
          sampleCaptureFenced.current = true;
        }
      } catch (error) {
        fenceDurabilityFailure(error);
        return Promise.resolve();
      }
      const journal = measuredJournalRef.current;
      const journalCount = journal.entries.length;
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

      // Reserve the write in invocation order, before any later notification can enqueue.
      const write = storageQueue.current
        .catch(() => undefined)
        .then(async () => {
          if (!enabledRef.current || !draftStorage) {
            throw new TimerDraftStorageUnavailableError(
              "Durable recording storage is unavailable.",
            );
          }
          if (durabilityFenced.current) return;
          // Commit pending measurements against the old guidance before atomically
          // publishing the revision. A failed flush cannot partially attach a plan.
          if (options.flushBeforeTransition) {
            await persistMeasuredPrefix(previousState, commandNowMs, journal, journalCount);
          }
          await persistMeasuredPrefix(result.state, commandNowMs, journal, journalCount);
        });
      storageQueue.current = write.catch((error: unknown) => {
        fenceDurabilityFailure(error);
      });
      const operation = write
        .then(() => {
          if (durabilityFenced.current) return;
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
    [bluetooth.recorder, draftStorage, fenceDurabilityFailure, persistMeasuredPrefix],
  );

  useEffect(() => {
    if (lifecycle !== "recording" && lifecycle !== "paused") return;

    const interval = window.setInterval(() => {
      const tickNowMs = Date.now();
      setNowMs(tickNowMs);
      if (
        durabilityFenced.current ||
        sampleCaptureFenced.current ||
        recordingRef.current.reducer.lifecycle !== "recording"
      ) {
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
      return applyTransition((state) => configureTimerOnlyRecording(state, configuration));
    },
    [applyTransition, hasActiveSession],
  );
  const applyGuidance = useCallback(
    async (
      transition: (state: TimerOnlyRecordingState, at: number) => TimerOnlyRecordingTransition,
      message: string,
    ) => {
      if (
        !enabledRef.current ||
        finalizationInFlight.current ||
        durabilityFenced.current ||
        recoveryBlocked.current
      )
        return false;
      let accepted = false;
      await applyDurableTransition(
        (state, at) => {
          const result = transition(state, at);
          accepted = result.rejectedReason === null;
          return result;
        },
        message,
        { flushBeforeTransition: true },
      );
      return accepted && !durabilityFenced.current;
    },
    [applyDurableTransition],
  );
  const changePlan = useCallback(
    (plan: TimerOnlyRecordingPlanConfiguration | null) =>
      applyGuidance(
        (state, at) => changeTimerOnlyPlan(state, at, plan),
        plan ? "Plan guidance attached and saved." : "Plan guidance detached and saved.",
      ),
    [applyGuidance],
  );
  const changeRoute = useCallback(
    (routeId: string | null) =>
      applyGuidance(
        (state, at) => changeTimerOnlyRoute(state, at, routeId),
        "Route guidance saved.",
      ),
    [applyGuidance],
  );
  const adjustIntensity = useCallback(
    (scale: number) =>
      applyGuidance(
        (state, at) => adjustTimerOnlyIntensity(state, at, scale),
        "Session intensity saved.",
      ),
    [applyGuidance],
  );
  const start = useCallback(() => {
    return applyDurableTransition(
      (state, commandNowMs) => startTimerOnlyRecording(state, commandNowMs, createSessionId()),
      "Recording started and saved locally. Sensor samples checkpoint in batches; only the committed prefix survives interruption.",
    );
  }, [applyDurableTransition]);
  const pause = useCallback(
    () => applyDurableTransition(pauseTimerOnlyRecording, "Recording paused."),
    [applyDurableTransition],
  );
  const resume = useCallback(
    () =>
      applyDurableTransition(
        resumeTimerOnlyRecording,
        "Recording resumed. Sensor samples checkpoint in batches; only the committed prefix survives interruption.",
        {
          backgroundPaused: false,
          clearRecovered: true,
        },
      ),
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
      if (document.visibilityState !== "hidden") return;
      bluetooth.recorder.disconnect();
      if (lifecycle !== "recording" || recordingRef.current.reducer.lifecycle !== "recording")
        return;
      void applyDurableTransition(
        pauseTimerOnlyRecording,
        "Recording paused because this tab moved to the background. Return and Resume explicitly.",
        { backgroundPaused: true, announceImmediately: true },
      );
    };
    document.addEventListener("visibilitychange", pauseWhenHidden);
    pauseWhenHidden();
    return () => document.removeEventListener("visibilitychange", pauseWhenHidden);
  }, [applyDurableTransition, bluetooth.recorder, lifecycle]);

  const finish = useCallback(async () => {
    if (!enabledRef.current || !draftStorage) return;
    if (recoveryBlocked.current) return;
    if (recordingRef.current.reducer.lifecycle === "finished") return;
    if (durabilityFenced.current) {
      setProviderState((current) => ({
        ...current,
        error: "Restore local saving before finishing this recording.",
      }));
      return;
    }
    if (commandInFlight.current) return;
    finalizationInFlight.current = true;
    commandInFlight.current = true;
    setProviderState((current) => ({ ...current, busy: true, error: null }));
    try {
      const now = Date.now();
      const finished = finishTimerOnlyRecording(recordingRef.current, now);
      if (finished.rejectedReason) throw new Error(finished.rejectedReason);
      sampleCaptureFenced.current = true;
      bluetooth.recorder.pauseSessionMetrics();
      checkpointGeneration.current += 1;
      const stopped =
        recordingRef.current.reducer.lifecycle === "recording"
          ? pauseTimerOnlyRecording(recordingRef.current, now).state
          : recordingRef.current;
      recordingRef.current = stopped;
      const journal = closeMeasuredWindow(measuredJournalRef.current, new Date(now).toISOString());
      measuredJournalRef.current = journal;
      setProviderState((current) => ({ ...current, recording: stopped }));
      await storageQueue.current;
      if (durabilityFenced.current)
        throw new Error(
          "Measured samples could not be saved. Restore local saving before finishing.",
        );
      try {
        await persistMeasuredPrefix(stopped, now, journal, journal.entries.length);
      } catch (error) {
        fenceDurabilityFailure(error);
        throw error;
      }
      const sensorDeltas = measuredRecordingPoints(journal);
      const activityCategory =
        finished.state.reducer.snapshot?.activity.activity_category ?? "other";
      const artifact = await finalizeTimerRecordingArtifact({
        state: finished.state,
        measuredJournal: journal,
        ownerId,
        segmentId: createSessionId(),
        review: {
          name:
            finished.state.reducer.snapshot?.planExecution?.name ??
            `${activityCategory[0]?.toUpperCase() ?? ""}${activityCategory.slice(1)} recording`,
          notes: null,
          perceivedEffort: null,
          distanceMeters: Math.max(0, Math.round(sensorDeltas.distanceMeters ?? 0)),
          calories:
            sensorDeltas.calories === null ? null : Math.max(0, Math.round(sensorDeltas.calories)),
          distanceEnteredManually: false,
          caloriesEnteredManually: false,
        },
        sessionRpeOperationId: null,
      });
      await draftStorage.finalize(artifact);
      lastConfirmedRecordingRef.current = finished.state;
      confirmedJournalRef.current = { ...journal, entries: [...journal.entries] };
      bluetooth.recorder.endSessionMetrics();
      // The artifact commit is authoritative; a history refresh failure must not
      // turn an acknowledged finish into a second, differently timed recording.
      const history = await draftStorage.listArtifacts().catch(() => null);
      recordingRef.current = finished.state;
      setProviderState((current) => ({
        ...current,
        recording: finished.state,
        artifact,
        submissionJob: null,
        history: history ?? current.history,
        hasRecoveredDraft: false,
        busy: false,
        error: history
          ? null
          : "Recording saved locally, but local history could not be refreshed.",
        statusMessage: "Recording finished and saved locally for review.",
        backgroundPaused: false,
      }));
    } catch (error) {
      setProviderState((current) => ({
        ...current,
        busy: false,
        error: durabilityFenced.current
          ? "The measured checkpoint could not be confirmed. Reload the committed prefix before finishing."
          : error instanceof TimerDraftStorageInUseError
            ? "Another tab took over this timer. Finalization was fenced and the recovery recording was retained."
            : error instanceof Error
              ? error.message
              : "The recording could not be finalized durably.",
        statusMessage: "Recording could not be finished.",
      }));
    } finally {
      finalizationInFlight.current = false;
      commandInFlight.current = false;
    }
  }, [bluetooth.recorder, draftStorage, fenceDurabilityFailure, ownerId, persistMeasuredPrefix]);

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
          measuredJournal: providerState.artifact.measuredJournal,
          ownerId,
          segmentId: providerState.artifact.segmentId,
          review,
          sessionRpeOperationId,
        });
        const submissionJob = await draftStorage.enqueueSubmission(
          artifact,
          new Date().toISOString(),
        );
        const history = await draftStorage.listArtifacts().catch(() => null);
        setProviderState((current) => ({
          ...current,
          artifact,
          submissionJob,
          history: history ?? current.history,
          busy: false,
          error: history
            ? null
            : "Review saved to the queue, but local history could not be refreshed.",
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
    if (recoveryBlocked.current || commandInFlight.current) return;
    const phase = recordingRef.current.reducer.lifecycle;
    if (phase === "recording" || phase === "paused" || phase === "finishing") return;
    const result = resetTimerOnlyRecording();
    bluetooth.recorder.endSessionMetrics();
    measuredJournalRef.current = emptyMeasuredJournal();
    confirmedJournalRef.current = emptyMeasuredJournal();
    sampleCaptureFenced.current = true;
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
  }, [bluetooth.recorder, draftStorage, enqueueStorage]);
  const cancel = useCallback(
    async (options?: { confirmed?: boolean }) => {
      if (!enabledRef.current || !draftStorage) return;
      if (
        !options?.confirmed &&
        !window.confirm("Cancel this recording? Its saved timer will be deleted.")
      )
        return;
      if (commandInFlight.current) return;
      measuredJournalRef.current = closeMeasuredWindow(
        measuredJournalRef.current,
        new Date(Date.now()).toISOString(),
      );
      sampleCaptureFenced.current = true;
      bluetooth.recorder.pauseSessionMetrics();
      commandInFlight.current = true;
      checkpointGeneration.current += 1;
      setProviderState((current) => ({ ...current, busy: true, error: null }));
      try {
        const cleanup = storageQueue.current
          .catch(() => undefined)
          .then(() => draftStorage.remove());
        storageQueue.current = cleanup.catch(() => undefined);
        await cleanup;
        bluetooth.recorder.endSessionMetrics();
        measuredJournalRef.current = emptyMeasuredJournal();
        confirmedJournalRef.current = emptyMeasuredJournal();
        sampleCaptureFenced.current = true;
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
        if (
          error instanceof TimerDraftStorageInUseError ||
          error instanceof TimerDraftStorageUnavailableError
        )
          fenceDurabilityFailure(error);
        else if (
          !durabilityFenced.current &&
          recordingRef.current.reducer.lifecycle === "recording"
        ) {
          measuredJournalRef.current = openMeasuredWindow(
            measuredJournalRef.current,
            new Date(Date.now()).toISOString(),
          );
          sampleCaptureFenced.current = false;
          bluetooth.recorder.resumeSessionMetrics();
        }
      } finally {
        commandInFlight.current = false;
      }
    },
    [bluetooth.recorder, draftStorage, fenceDurabilityFailure],
  );
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
    if (!enabledRef.current || !draftStorage || commandInFlight.current) return;
    sampleCaptureFenced.current = true;
    bluetooth.recorder.pauseSessionMetrics();
    await durableCommandQueue.current.catch(() => undefined);
    await storageQueue.current.catch(() => undefined);
    try {
      await draftStorage.takeOver();
      await hydrate();
    } catch (error) {
      setProviderState((current) => ({
        ...current,
        error:
          error instanceof Error
            ? error.message
            : "Recovery could not be copied. Original data was retained.",
      }));
    }
  }, [bluetooth.recorder, draftStorage, hydrate]);

  const downloadLegacyArchive = useCallback(async () => {
    if (!draftStorage) return;
    try {
      const archive = await draftStorage.getLegacyArchive();
      if (!archive) throw new Error("No older recorder archive is available.");
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(archive)], { type: "application/json" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "gradientpeak-legacy-recordings.json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (error) {
      setProviderState((current) => ({
        ...current,
        error:
          error instanceof Error
            ? error.message
            : "Legacy export is unavailable; original data is retained.",
      }));
    }
  }, [draftStorage]);

  const retryDurableStorage = useCallback(async () => {
    if (
      !enabledRef.current ||
      !draftStorage ||
      !durabilityFenced.current ||
      commandInFlight.current
    )
      return;
    if (recoveryBlocked.current) {
      await hydrate();
      return;
    }
    commandInFlight.current = true;
    setProviderState((current) => ({ ...current, savingCommand: true }));
    try {
      // A rejected acknowledgement can follow a committed transaction. Read the
      // authoritative cursor instead of overwriting it with an older RAM prefix.
      await hydrate();
      if (recoveryBlocked.current || durabilityFenced.current) return;
      const confirmed = recordingRef.current;
      recoveryBlocked.current = true;
      await persistMeasuredPrefix(
        confirmed,
        Date.now(),
        measuredJournalRef.current,
        measuredJournalRef.current.entries.length,
      );
      recoveryBlocked.current = false;
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
            : confirmed.reducer.lifecycle === "finished"
              ? "Local saving is restored. The finished recording is ready for review."
              : "Local saving is restored. You can start again.",
      }));
    } catch (error) {
      durabilityFenced.current = false;
      fenceDurabilityFailure(error);
    } finally {
      commandInFlight.current = false;
      setProviderState((current) => ({ ...current, savingCommand: false }));
    }
  }, [draftStorage, fenceDurabilityFailure, hydrate, persistMeasuredPrefix]);

  const retrySubmission = useCallback(async () => {
    if (
      !enabledRef.current ||
      !draftStorage ||
      recoveryBlocked.current ||
      providerState.hydrationStatus !== "ready"
    )
      return;
    if (!providerState.submissionJob) return;
    const submissionJob = await draftStorage.retrySubmissionNow(
      providerState.submissionJob.id,
      new Date().toISOString(),
    );
    setProviderState((current) => ({ ...current, submissionJob }));
  }, [draftStorage, providerState.hydrationStatus, providerState.submissionJob]);

  const drainSubmissionQueue = useCallback(
    async (submit: SubmitWebRecording) => {
      if (
        !enabledRef.current ||
        !draftStorage ||
        recoveryBlocked.current ||
        providerState.hydrationStatus !== "ready"
      )
        return;
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
    [draftStorage, providerState.artifact?.recordingSessionId, providerState.hydrationStatus],
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
        changePlan,
        changeRoute,
        adjustIntensity,
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
        legacyRecoveryAvailable: legacyRecoveryAvailable.current,
        downloadLegacyArchive,
        sensors: {
          state: bluetooth.state,
          connect: () => bluetooth.recorder.connect(),
          disconnect: () => bluetooth.recorder.disconnect(),
          requestControl: () => {
            const lifecycle = recordingRef.current.reducer.lifecycle;
            if (
              lifecycle === "finishing" ||
              lifecycle === "finished" ||
              commandInFlight.current ||
              finalizationInFlight.current ||
              durabilityFenced.current
            )
              return Promise.resolve(false);
            return bluetooth.recorder.requestControl();
          },
          setTargetPower: (watts) => {
            const lifecycle = recordingRef.current.reducer.lifecycle;
            if (
              lifecycle === "finishing" ||
              lifecycle === "finished" ||
              commandInFlight.current ||
              finalizationInFlight.current ||
              durabilityFenced.current
            )
              return Promise.resolve(false);
            return bluetooth.recorder.setTargetPower(watts);
          },
        },
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
