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
  type TimerDraftStorage,
  TimerDraftStorageInUseError,
  TimerDraftStorageUnavailableError,
} from "./draft-storage";
import {
  configureTimerOnlyRecording,
  createInitialTimerOnlyRecordingState,
  finishTimerOnlyRecording,
  getTimerOnlyRecordingTimes,
  pauseTimerOnlyRecording,
  recoverTimerOnlyRecording,
  resetTimerOnlyRecording,
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
  finish: () => void;
  reset: () => void;
  discardRecoveredDraft: () => void;
};

type ProviderState = {
  recording: TimerOnlyRecordingState;
  error: string | null;
  hydrationStatus: "hydrating" | "ready" | "error";
  hasRecoveredDraft: boolean;
};

const TimerOnlyRecordingContext = createContext<TimerOnlyRecordingContextValue | null>(null);

type TimerOnlyRecordingProviderProps = PropsWithChildren<{
  ownerId: string;
  storage?: TimerDraftStorage;
}>;

export function TimerOnlyRecordingProvider({
  children,
  ownerId,
  storage,
}: TimerOnlyRecordingProviderProps) {
  const [draftStorage] = useState<TimerDraftStorage>(
    () => storage ?? new IndexedDbTimerDraftStorage(ownerId, createSessionId()),
  );
  const [providerState, setProviderState] = useState<ProviderState>(() => ({
    recording: createInitialTimerOnlyRecordingState(),
    error: null,
    hydrationStatus: "hydrating",
    hasRecoveredDraft: false,
  }));
  const [nowMs, setNowMs] = useState(() => Date.now());
  const storageQueue = useRef<Promise<void>>(Promise.resolve());
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

  useEffect(() => {
    let cancelled = false;

    void loadTimerDraft(draftStorage, ownerId)
      .then((result) => {
        if (cancelled) return;
        const hydratedAtMs = Date.now();
        setNowMs(hydratedAtMs);

        if (result.draft) {
          const recovered = recoverTimerOnlyRecording(result.draft, hydratedAtMs);
          setProviderState({
            recording: recovered.state,
            error: recovered.rejectedReason,
            hydrationStatus: recovered.rejectedReason ? "error" : "ready",
            hasRecoveredDraft: !recovered.rejectedReason,
          });
          return;
        }

        setProviderState((current) => ({
          ...current,
          hydrationStatus: "ready",
          error:
            result.status === "discarded-invalid"
              ? "An invalid saved timer draft was discarded."
              : current.error,
        }));
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setProviderState((current) => ({
          ...current,
          hydrationStatus: "error",
          error:
            error instanceof TimerDraftStorageInUseError
              ? "This timer is open in another browser tab. Close that recorder before continuing here."
              : error instanceof TimerDraftStorageUnavailableError
                ? "This browser cannot provide durable timer recovery because IndexedDB is unavailable."
                : "Saved timer recovery is unavailable.",
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [draftStorage, ownerId]);

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
  const finish = useCallback(() => applyTransition(finishTimerOnlyRecording), [applyTransition]);
  const reset = useCallback(() => {
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
        reset,
        discardRecoveredDraft,
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
  return globalThis.crypto?.randomUUID?.() ?? `web-${Date.now().toString(36)}`;
}
