// @vitest-environment jsdom

import type { PortableTimerRecordingDraft } from "@repo/core";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { IndexedDbTimerDraftStorage, type WebRecordingStorage } from "./draft-storage";
import { TimerOnlyRecordingProvider, useTimerOnlyRecording } from "./provider";

const mocks = vi.hoisted(() => ({ navigate: vi.fn() }));

vi.mock("@tanstack/react-router", () => ({
  useBlocker: vi.fn(),
  useLocation: () => ({ pathname: "/record/session" }),
  useNavigate: () => mocks.navigate,
}));

class ControlledStorage {
  draft: PortableTimerRecordingDraft | null = null;
  removeError: Error | null = null;
  saveError: Error | null = null;
  savedDrafts: PortableTimerRecordingDraft[] = [];
  loadCalls = 0;
  loadLatestArtifactCalls = 0;
  listArtifactsCalls = 0;
  listDueSubmissionJobsCalls = 0;
  removeCalls = 0;
  saveCalls = 0;
  private saveGate: (() => void) | null = null;
  readonly saveStarted = new Promise<void>((resolve) => {
    this.saveGate = resolve;
  });

  async load() {
    this.loadCalls += 1;
    return this.draft;
  }

  async loadLatestArtifact() {
    this.loadLatestArtifactCalls += 1;
    return null;
  }

  async listArtifacts() {
    this.listArtifactsCalls += 1;
    return [];
  }

  async listDueSubmissionJobs() {
    this.listDueSubmissionJobsCalls += 1;
    return [];
  }

  async save(draft: PortableTimerRecordingDraft) {
    this.saveCalls += 1;
    await this.saveStarted;
    if (this.saveError) throw this.saveError;
    this.draft = structuredClone(draft);
    this.savedDrafts.push(structuredClone(draft));
  }

  releaseSave() {
    this.saveGate?.();
  }

  async remove() {
    this.removeCalls += 1;
    if (this.removeError) throw this.removeError;
    this.draft = null;
  }
}

function storageForTest(storage: ControlledStorage): WebRecordingStorage {
  return {
    load: () => storage.load(),
    save: (draft) => storage.save(draft),
    remove: () => storage.remove(),
    takeOver: async () => undefined,
    finalize: async () => undefined,
    loadLatestArtifact: () => storage.loadLatestArtifact(),
    listArtifacts: () => storage.listArtifacts(),
    enqueueSubmission: async () => {
      throw new Error("Not used by this test");
    },
    getSubmissionJob: async () => null,
    listDueSubmissionJobs: () => storage.listDueSubmissionJobs(),
    claimSubmissionJob: async () => null,
    markSubmissionJobRetry: async () => null,
    markSubmissionJobReviewRequired: async () => null,
    markSubmissionJobSubmitted: async () => null,
    markSubmissionJobIngestionClaimed: async () => null,
    retrySubmissionNow: async () => {
      throw new Error("Not used by this test");
    },
    discardArtifact: async () => false,
  } as WebRecordingStorage;
}

let recording: ReturnType<typeof useTimerOnlyRecording> | null = null;

function Probe() {
  recording = useTimerOnlyRecording();
  return null;
}

function currentRecording(): ReturnType<typeof useTimerOnlyRecording> {
  if (!recording) throw new Error("Recording provider did not render.");
  return recording;
}

async function renderReadyProvider(storage: ControlledStorage) {
  render(
    <TimerOnlyRecordingProvider ownerId="profile-1" storage={storageForTest(storage)}>
      <Probe />
    </TimerOnlyRecordingProvider>,
  );
  await waitFor(() => expect(recording?.hydrationStatus).toBe("ready"));
}

async function startRecording() {
  act(() => {
    recording?.configure({ activity_category: "run" });
  });
  await waitFor(() => expect(recording?.state.configuration).not.toBeNull());
  await act(async () => currentRecording().start());
  await waitFor(() => expect(recording?.state.reducer.lifecycle).toBe("recording"));
}

async function startPlannedRecording({ timedFirstStep = false } = {}) {
  act(() => {
    recording?.configure({
      activity_category: "run",
      activityPlanId: "00000000-0000-4000-8000-000000000003",
      plan: {
        activityPlanId: "00000000-0000-4000-8000-000000000003",
        scheduledEventId: null,
        name: "Durable plan",
        description: null,
        activityPlanRevision: 1,
        structureHash: `v1:sha256:${"a".repeat(64)}`,
        structure: {
          version: 3,
          activity_category: "run",
          segments: [
            {
              id: "10000000-0000-4000-8000-000000000001",
              name: "Main",
              role: "activity",
              intervals: [
                {
                  id: "20000000-0000-4000-8000-000000000001",
                  name: "Set",
                  repetitions: 1,
                  steps: [
                    {
                      id: "30000000-0000-4000-8000-000000000001",
                      name: "First",
                      duration: timedFirstStep
                        ? { type: "time", seconds: 1 }
                        : { type: "distance", meters: 100 },
                      targets: [{ type: "RPE", intensity: 4 }],
                    },
                    {
                      id: "30000000-0000-4000-8000-000000000002",
                      name: "Second",
                      duration: { type: "repetitions", count: 5 },
                      targets: [{ type: "RPE", intensity: 6 }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    });
  });
  await waitFor(() => expect(recording?.state.configuration).not.toBeNull());
  await act(async () => currentRecording().start());
  await waitFor(() => expect(recording?.state.reducer.lifecycle).toBe("recording"));
}

afterEach(() => {
  cleanup();
  recording = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("timer-only recording cancellation", () => {
  it("deletes a saved draft and prevents it from recovering after reload", async () => {
    const storage = new ControlledStorage();
    storage.releaseSave();
    await renderReadyProvider(storage);
    await startRecording();
    await waitFor(() => expect(storage.draft).not.toBeNull());
    vi.spyOn(window, "confirm").mockReturnValue(true);

    const cancel = recording?.cancel();
    await cancel;
    await waitFor(() => expect(recording?.state.reducer.lifecycle).toBe("pending"));

    expect(storage.draft).toBeNull();
    expect(recording?.state.reducer.lifecycle).toBe("pending");

    cleanup();
    recording = null;
    await renderReadyProvider(storage);
    expect(currentRecording().state.reducer.lifecycle).toBe("pending");
  });

  it("keeps the recording locked when deletion fails", async () => {
    const storage = new ControlledStorage();
    storage.releaseSave();
    await renderReadyProvider(storage);
    await startRecording();
    await waitFor(() => expect(storage.draft).not.toBeNull());
    storage.removeError = new Error("Storage removal failed");
    vi.spyOn(window, "confirm").mockReturnValue(true);

    await act(async () => recording?.cancel());

    expect(recording?.state.reducer.lifecycle).toBe("recording");
    expect(recording?.error).toBe("Storage removal failed");
  });
});

describe("immediate recorder command durability", () => {
  it("makes Start recoverable as soon as its promise resolves", async () => {
    const storage = new ControlledStorage();
    storage.releaseSave();
    await renderReadyProvider(storage);

    act(() => {
      currentRecording().configure({ activity_category: "run" });
    });
    await act(async () => currentRecording().start());

    expect(storage.draft?.lifecycle).toBe("recording");
    expect(currentRecording().state.reducer.lifecycle).toBe("recording");

    cleanup();
    recording = null;
    await renderReadyProvider(storage);
    expect(currentRecording().state.reducer.lifecycle).toBe("paused");
  });

  it("rolls a failed Start back to the configured pending session", async () => {
    const storage = new ControlledStorage();
    storage.releaseSave();
    await renderReadyProvider(storage);
    act(() => {
      currentRecording().configure({ activity_category: "run" });
    });
    await waitFor(() => expect(currentRecording().state.configuration).not.toBeNull());
    storage.saveError = new Error("IndexedDB write failed");

    await act(async () => currentRecording().start());

    expect(currentRecording().state.reducer.lifecycle).toBe("pending");
    expect(currentRecording().state.configuration?.activity_category).toBe("run");
    expect(currentRecording().durabilityFenced).toBe(true);
    expect(storage.draft).toBeNull();
  });

  it("makes a captured lap recoverable immediately after the command promise resolves", async () => {
    const storage = new ControlledStorage();
    storage.releaseSave();
    await renderReadyProvider(storage);
    await startRecording();
    await waitFor(() => expect(storage.draft).not.toBeNull());

    await act(async () => currentRecording().lap());
    expect(storage.draft?.planExecution?.laps).toHaveLength(1);
    expect(currentRecording().savingCommand).toBe(false);
    expect(currentRecording().statusMessage).toBe("Lap captured and saved.");

    cleanup();
    recording = null;
    await renderReadyProvider(storage);
    expect(currentRecording().state.planExecution?.laps).toHaveLength(1);
    expect(currentRecording().state.reducer.lifecycle).toBe("paused");
  });

  it("serializes rapid complete, previous, skip, and lap checkpoints in command order", async () => {
    const storage = new ControlledStorage();
    storage.releaseSave();
    await renderReadyProvider(storage);
    await startPlannedRecording();
    await waitFor(() => expect(storage.draft).not.toBeNull());

    let operations: Promise<void>[] = [];
    act(() => {
      operations = [
        currentRecording().completeStep(),
        currentRecording().previousStep(),
        currentRecording().skipStep(),
        currentRecording().lap(),
      ];
    });
    await act(async () => Promise.all(operations));

    expect(storage.draft?.planExecution?.transitions.map((transition) => transition.type)).toEqual([
      "complete",
      "previous",
      "skip",
    ]);
    expect(storage.draft?.planExecution?.laps).toMatchObject([
      { lapNumber: 1, occurrenceIndex: 1 },
    ]);
    expect(storage.savedDrafts.at(-1)?.planExecution).toEqual(storage.draft?.planExecution);
  });

  it("rolls back and fences progression when a command write fails", async () => {
    const storage = new ControlledStorage();
    storage.releaseSave();
    await renderReadyProvider(storage);
    await startRecording();
    await waitFor(() => expect(storage.draft).not.toBeNull());
    const durableBefore = structuredClone(storage.draft);
    storage.saveError = new Error("IndexedDB write failed");

    await act(async () => currentRecording().lap());

    expect(currentRecording().state.reducer.lifecycle).toBe("paused");
    expect(currentRecording().state.planExecution?.laps).toHaveLength(0);
    expect(currentRecording().durabilityFenced).toBe(true);
    expect(currentRecording().error).toContain("rolled back");
    expect(storage.draft).toEqual(durableBefore);

    const saveCallsAfterFailure = storage.saveCalls;
    await act(async () => currentRecording().lap());
    expect(storage.saveCalls).toBe(saveCallsAfterFailure);
    expect(currentRecording().state.planExecution?.laps).toHaveLength(0);

    storage.saveError = null;
    cleanup();
    recording = null;
    await renderReadyProvider(storage);
    expect(currentRecording().state.planExecution?.laps).toHaveLength(0);
  });

  it("retries the last confirmed checkpoint before allowing the timer to resume", async () => {
    const storage = new ControlledStorage();
    storage.releaseSave();
    await renderReadyProvider(storage);
    await startRecording();
    await waitFor(() => expect(storage.draft).not.toBeNull());
    storage.saveError = new Error("IndexedDB write failed");
    await act(async () => currentRecording().lap());
    expect(currentRecording().durabilityFenced).toBe(true);

    storage.saveError = null;
    await act(async () => currentRecording().retryDurableStorage());

    expect(currentRecording().durabilityFenced).toBe(false);
    expect(currentRecording().state.reducer.lifecycle).toBe("paused");
    expect(storage.draft?.lifecycle).toBe("paused");
    expect(currentRecording().statusMessage).toContain("saving is restored");

    await act(async () => currentRecording().resume());
    expect(currentRecording().state.reducer.lifecycle).toBe("recording");
    expect(storage.draft?.lifecycle).toBe("recording");
  });

  it("saves an automatic timed-step transition before recovery can observe it", async () => {
    const storage = new ControlledStorage();
    storage.releaseSave();
    await renderReadyProvider(storage);
    await startPlannedRecording({ timedFirstStep: true });

    await waitFor(
      () => {
        expect(storage.draft?.planExecution?.transitions[0]?.type).toBe("auto");
      },
      { timeout: 2_500 },
    );
    expect(storage.draft?.planExecution?.currentOccurrenceIndex).toBe(1);

    cleanup();
    recording = null;
    await renderReadyProvider(storage);
    expect(currentRecording().state.planExecution?.currentOccurrenceIndex).toBe(1);
    expect(currentRecording().state.planExecution?.transitions[0]?.type).toBe("auto");
  });

  it("rolls back and fences a timed-step transition when its immediate save fails", async () => {
    const storage = new ControlledStorage();
    storage.releaseSave();
    await renderReadyProvider(storage);
    await startPlannedRecording({ timedFirstStep: true });
    expect(storage.draft?.planExecution?.currentOccurrenceIndex).toBe(0);
    storage.saveError = new Error("IndexedDB write failed");

    await waitFor(
      () => {
        expect(currentRecording().durabilityFenced).toBe(true);
      },
      { timeout: 2_500 },
    );

    expect(currentRecording().state.reducer.lifecycle).toBe("paused");
    expect(currentRecording().state.planExecution?.currentOccurrenceIndex).toBe(0);
    expect(storage.draft?.planExecution?.currentOccurrenceIndex).toBe(0);
  });

  it("pauses and checkpoints when the document becomes hidden, requiring explicit resume", async () => {
    const storage = new ControlledStorage();
    storage.releaseSave();
    await renderReadyProvider(storage);
    await startRecording();
    await waitFor(() => expect(storage.draft).not.toBeNull());
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");

    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await waitFor(() => expect(currentRecording().state.reducer.lifecycle).toBe("paused"));
    await waitFor(() => expect(storage.draft?.lifecycle).toBe("paused"));

    expect(currentRecording().backgroundPaused).toBe(true);
    expect(currentRecording().statusMessage).toContain("tab moved to the background");
    visibility.mockReturnValue("visible");
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(currentRecording().state.reducer.lifecycle).toBe("paused");
  });
});

describe("timer-only recording storage readiness", () => {
  it("does not touch session storage when initially disabled", () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    render(
      <TimerOnlyRecordingProvider enabled={false} ownerId="profile-1">
        <Probe />
      </TimerOnlyRecordingProvider>,
    );

    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
  });

  it("does not hydrate or access storage until enabled", async () => {
    const storage = new ControlledStorage();
    storage.releaseSave();
    const rendered = render(
      <TimerOnlyRecordingProvider
        enabled={false}
        ownerId="profile-1"
        storage={storageForTest(storage)}
      >
        <Probe />
      </TimerOnlyRecordingProvider>,
    );

    expect(recording?.hydrationStatus).toBe("hydrating");
    expect(storage.loadCalls).toBe(0);
    expect(storage.listArtifactsCalls).toBe(0);
    expect(storage.loadLatestArtifactCalls).toBe(0);
    expect(storage.listDueSubmissionJobsCalls).toBe(0);
    expect(storage.removeCalls).toBe(0);
    expect(storage.saveCalls).toBe(0);

    rendered.rerender(
      <TimerOnlyRecordingProvider enabled ownerId="profile-1" storage={storageForTest(storage)}>
        <Probe />
      </TimerOnlyRecordingProvider>,
    );

    await waitFor(() => expect(recording?.hydrationStatus).toBe("ready"));
    expect(storage.loadCalls).toBe(1);
    expect(storage.listArtifactsCalls).toBe(1);
    expect(storage.loadLatestArtifactCalls).toBe(1);

    rendered.rerender(
      <TimerOnlyRecordingProvider enabled ownerId="profile-1" storage={storageForTest(storage)}>
        <Probe />
      </TimerOnlyRecordingProvider>,
    );
    expect(storage.loadCalls).toBe(1);
  });

  it("creates default storage only after enabling with the stable tab identity", async () => {
    window.sessionStorage.clear();
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const load = vi.spyOn(IndexedDbTimerDraftStorage.prototype, "load");
    const rendered = render(
      <TimerOnlyRecordingProvider enabled={false} ownerId="profile-1">
        <Probe />
      </TimerOnlyRecordingProvider>,
    );

    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();

    rendered.rerender(
      <TimerOnlyRecordingProvider enabled ownerId="profile-1">
        <Probe />
      </TimerOnlyRecordingProvider>,
    );

    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    expect(getItem).toHaveBeenCalledWith("gradientpeak.recording.instance-id");
    expect(setItem).toHaveBeenCalledWith("gradientpeak.recording.instance-id", expect.any(String));
    expect(getItem.mock.invocationCallOrder[0]).toBeLessThan(load.mock.invocationCallOrder[0] ?? 0);
  });

  it("reuses the persisted tab identity after remounting", async () => {
    window.sessionStorage.clear();
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    const first = render(
      <TimerOnlyRecordingProvider ownerId="profile-1">
        <Probe />
      </TimerOnlyRecordingProvider>,
    );
    await waitFor(() => expect(setItem).toHaveBeenCalledTimes(1));
    first.unmount();

    render(
      <TimerOnlyRecordingProvider ownerId="profile-1">
        <Probe />
      </TimerOnlyRecordingProvider>,
    );
    await waitFor(() => expect(recording?.hydrationStatus).not.toBe("hydrating"));

    expect(setItem).toHaveBeenCalledTimes(1);
  });

  it("does not drain storage while disabled", async () => {
    vi.useFakeTimers();
    const storage = new ControlledStorage();
    storage.releaseSave();
    render(
      <TimerOnlyRecordingProvider
        enabled={false}
        ownerId="profile-1"
        storage={storageForTest(storage)}
      >
        <Probe />
      </TimerOnlyRecordingProvider>,
    );

    act(() => {
      recording?.configure({ activity_category: "run" });
      void recording?.start();
      window.dispatchEvent(new Event("online"));
      vi.advanceTimersByTime(16_000);
    });
    await recording?.drainSubmissionQueue(async () => ({ activityId: "activity-1" }));

    expect(storage.loadCalls).toBe(0);
    expect(storage.saveCalls).toBe(0);
    expect(storage.listDueSubmissionJobsCalls).toBe(0);
  });
});
