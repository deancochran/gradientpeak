// @vitest-environment jsdom
import {
  type PortableTimerRecordingDraft,
  type PortableWebRecordingArtifact,
  portableTimerRecordingDraftSchema,
} from "@repo/core";
import { parseActivityFile } from "@repo/core/activity-files/parser";
import type { MeasuredJournalBatch } from "@repo/core/recording/measured-journal";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  IndexedDbTimerDraftStorage,
  UnsupportedRecordingContractError,
  type WebRecordingStorage,
} from "./draft-storage";
import { nextMeasuredCursor, type StoredMeasuredCursor } from "./measured-commit";
import { TimerOnlyRecordingProvider, useTimerOnlyRecording } from "./provider";
import { createQueuedSubmissionJob } from "./submission-queue";

const mocks = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  useBlocker: vi.fn(),
  useLocation: () => ({ pathname: "/record/session" }),
  useNavigate: () => mocks.navigate,
}));
class ControlledStorage {
  measured: StoredMeasuredCursor | null = null;
  batchSizes: number[] = [];
  acknowledgeError: Error | null = null;
  draft: PortableTimerRecordingDraft | null = null;
  artifact: PortableWebRecordingArtifact | null = null;
  removeError: Error | null = null;
  saveError: Error | null = null;
  loadError: Error | null = null;
  dueSubmissionJobs: ReturnType<typeof createQueuedSubmissionJob>[] = [];
  claimSubmissionJobCalls = 0;
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
    if (this.loadError) throw this.loadError;
    return this.draft;
  }
  async loadLatestArtifact() {
    this.loadLatestArtifactCalls += 1;
    return structuredClone(this.artifact);
  }
  async listArtifacts() {
    this.listArtifactsCalls += 1;
    return this.artifact ? [structuredClone(this.artifact)] : [];
  }
  async listDueSubmissionJobs() {
    this.listDueSubmissionJobsCalls += 1;
    return structuredClone(this.dueSubmissionJobs);
  }
  async save(draft: PortableTimerRecordingDraft) {
    this.saveCalls += 1;
    await this.saveStarted;
    if (this.saveError) throw this.saveError;
    this.draft = portableTimerRecordingDraftSchema.parse(structuredClone(draft));
    this.savedDrafts.push(structuredClone(this.draft));
  }
  async append(draft: PortableTimerRecordingDraft, batch: MeasuredJournalBatch) {
    this.saveCalls += 1;
    await this.saveStarted;
    if (this.saveError) throw this.saveError;
    const same =
      this.draft?.sessionSnapshot.identity.sessionId === draft.sessionSnapshot.identity.sessionId;
    const measured = nextMeasuredCursor(
      same ? this.measured : null,
      batch,
      draft.timing.startedAt,
      draft.timing.updatedAt,
    );
    const entries = [
      ...(same ? (this.draft?.measuredJournal?.entries ?? []) : []),
      ...structuredClone(batch.entries),
    ];
    this.draft = portableTimerRecordingDraftSchema.parse({
      ...draft,
      measuredJournal: { ...batch.header, entries },
    });
    this.measured = measured;
    this.batchSizes.push(batch.entries.length);
    this.savedDrafts.push(structuredClone(this.draft));
    if (this.acknowledgeError) throw this.acknowledgeError;
    return measured.cursor;
  }
  releaseSave() {
    this.saveGate?.();
  }
  async remove() {
    this.removeCalls += 1;
    if (this.removeError) throw this.removeError;
    this.draft = null;
    this.measured = null;
  }
}
function storageForTest(storage: ControlledStorage): WebRecordingStorage {
  return {
    appendMeasuredCheckpoint: (draft, batch) => storage.append(draft, batch),
    getLegacyArchive: async () => null,
    load: () => storage.load(),
    save: (draft) => storage.save(draft),
    remove: () => storage.remove(),
    takeOver: async () => undefined,
    finalize: async (artifact) => {
      storage.artifact = structuredClone(artifact);
      storage.draft = null;
    },
    loadLatestArtifact: () => storage.loadLatestArtifact(),
    listArtifacts: () => storage.listArtifacts(),
    enqueueSubmission: async () => {
      throw new Error("Not used by this test");
    },
    getSubmissionJob: async () => null,
    listDueSubmissionJobs: () => storage.listDueSubmissionJobs(),
    claimSubmissionJob: async () => {
      storage.claimSubmissionJobCalls += 1;
      return null;
    },
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
          version: 5,
          activity_category: "run",
          items: [
            {
              type: "step",
              id: "30000000-0000-4000-8000-000000000001",
              name: "First",
              duration: timedFirstStep
                ? { type: "time", seconds: 1 }
                : { type: "distance", meters: 100 },
              targets: [{ type: "RPE", intensity: 4 }],
            },
            {
              type: "step",
              id: "30000000-0000-4000-8000-000000000002",
              name: "Second",
              duration: { type: "repetitions", count: 5 },
              targets: [{ type: "RPE", intensity: 6 }],
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
  vi.unstubAllGlobals();
});
class MeasuredCharacteristic extends EventTarget {
  value: DataView | null = null;
  async startNotifications() {
    return this;
  }
  async stopNotifications() {
    return this;
  }
  emit(bytes: number[]) {
    this.value = new DataView(Uint8Array.from(bytes).buffer);
    this.dispatchEvent(new Event("characteristicvaluechanged"));
  }
}
function measuredBluetooth() {
  const indoor = new MeasuredCharacteristic();
  const heartRate = new MeasuredCharacteristic();
  const device = Object.assign(new EventTarget(), {
    gatt: {
      connected: true,
      disconnect: vi.fn(),
      connect: async () => ({
        getPrimaryService: async (service: string) => ({
          getCharacteristic: async (characteristic: string) => {
            if (service.includes("1826") && characteristic.includes("2ad2")) return indoor;
            if (service.includes("180d") && characteristic.includes("2a37")) return heartRate;
            throw new Error("Unavailable characteristic");
          },
        }),
      }),
    },
  });
  vi.stubGlobal("navigator", { bluetooth: { requestDevice: async () => device } });
  return {
    device,
    heartRate,
    emit: (distance: number, calories = 100) =>
      indoor.emit([
        0x54,
        3,
        0x10,
        0x0e,
        180,
        0,
        distance & 255,
        (distance >> 8) & 255,
        (distance >> 16) & 255,
        250,
        0,
        calories & 255,
        calories >> 8,
        0,
        0,
        0,
        150,
      ]),
  };
}
describe("durable measured notifications", () => {
  const epoch = Date.parse("2026-09-20T10:00:00Z");
  it("flushes measured notifications before a live route revision and keeps the whole prefix", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(epoch);
    const device = measuredBluetooth();
    const storage = new ControlledStorage();
    storage.releaseSave();
    await act(async () => {
      render(
        <TimerOnlyRecordingProvider ownerId="profile-1" storage={storageForTest(storage)}>
          <Probe />
        </TimerOnlyRecordingProvider>,
      );
    });
    act(() => currentRecording().configure({ activity_category: "bike" }));
    await act(async () => currentRecording().start());
    await act(async () => currentRecording().sensors.connect());
    await act(async () => {
      for (let index = 1; index <= 20; index++) {
        vi.setSystemTime(epoch + index);
        device.emit(1000 + index);
      }
      expect(await currentRecording().changeRoute("00000000-0000-4000-8000-000000000005")).toBe(
        true,
      );
    });
    const committed = storage.savedDrafts.findIndex((draft) => draft.guidance !== undefined);
    expect(storage.savedDrafts[committed - 1]?.measuredJournal?.entries).toHaveLength(20);
    expect(storage.savedDrafts[committed]?.measuredJournal?.entries).toHaveLength(20);
    expect(currentRecording().state.reducer.lifecycle).toBe("recording");
  });
  it("buffers a 500-notification burst behind one slow write and flushes all ordering on Pause", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(epoch);
    const device = measuredBluetooth();
    const storage = new ControlledStorage();
    storage.releaseSave();
    await act(async () => {
      render(
        <TimerOnlyRecordingProvider ownerId="profile-1" storage={storageForTest(storage)}>
          <Probe />
        </TimerOnlyRecordingProvider>,
      );
    });
    act(() => currentRecording().configure({ activity_category: "bike" }));
    await act(async () => currentRecording().start());
    await act(async () => currentRecording().sensors.connect());
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const append = storage.append.bind(storage);
    vi.spyOn(storage, "append").mockImplementationOnce(async (draft, batch) => {
      await gate;
      return append(draft, batch);
    });
    await act(async () => {
      for (let index = 1; index <= 500; index++) {
        vi.setSystemTime(epoch + index);
        device.emit(1000 + index);
      }
    });
    expect(currentRecording().durabilityFenced).toBe(false);
    expect(storage.draft?.measuredJournal?.entries).toHaveLength(0);
    await act(async () => {
      release();
      await currentRecording().pause();
    });
    expect(storage.batchSizes.filter((size) => size > 0)).toEqual([128, 128, 128, 116]);
    expect(storage.draft?.measuredJournal?.entries.map((entry) => entry.sequenceNumber)).toEqual(
      Array.from({ length: 500 }, (_, index) => index + 1),
    );
    expect(storage.draft?.lifecycle).toBe("paused");
    expect(storage.draft?.measuredJournal?.windows.at(-1)?.endedAt).not.toBeNull();
  });
  it("reloads a committed batch after acknowledgement loss instead of overwriting or replaying it", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(epoch);
    const device = measuredBluetooth();
    const storage = new ControlledStorage();
    storage.releaseSave();
    await act(async () => {
      render(
        <TimerOnlyRecordingProvider ownerId="profile-1" storage={storageForTest(storage)}>
          <Probe />
        </TimerOnlyRecordingProvider>,
      );
    });
    act(() => currentRecording().configure({ activity_category: "bike" }));
    await act(async () => currentRecording().start());
    await act(async () => currentRecording().sensors.connect());
    storage.acknowledgeError = new Error("Acknowledgement lost after commit");
    await act(async () => {
      device.emit(1000);
      device.emit(1010);
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(currentRecording().durabilityFenced).toBe(true);
    expect(storage.draft?.measuredJournal?.entries).toHaveLength(2);
    storage.acknowledgeError = null;
    await act(async () => currentRecording().retryDurableStorage());
    expect(currentRecording().durabilityFenced).toBe(false);
    expect(currentRecording().state.reducer.lifecycle).toBe("paused");
    expect(storage.draft?.measuredJournal?.entries.map((entry) => entry.sequenceNumber)).toEqual([
      1, 2,
    ]);
    expect(storage.batchSizes.filter((size) => size > 0)).toEqual([2]);
    await act(async () => currentRecording().finish());
    expect(storage.artifact?.measuredJournal?.entries).toHaveLength(2);
    expect(storage.artifact?.review.distanceMeters).toBe(10);
  });
  it("recovers only the committed prefix after a forced reload drops a buffered tail", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(epoch);
    const device = measuredBluetooth();
    const storage = new ControlledStorage();
    storage.releaseSave();
    await act(async () => {
      render(
        <TimerOnlyRecordingProvider ownerId="profile-1" storage={storageForTest(storage)}>
          <Probe />
        </TimerOnlyRecordingProvider>,
      );
    });
    act(() => currentRecording().configure({ activity_category: "bike" }));
    await act(async () => currentRecording().start());
    await act(async () => currentRecording().sensors.connect());
    await act(async () => {
      for (let index = 1; index <= 130; index++) {
        vi.setSystemTime(epoch + index);
        device.emit(1000 + index);
      }
    });
    expect(storage.draft?.measuredJournal?.entries).toHaveLength(128);
    cleanup();
    await act(async () => {
      render(
        <TimerOnlyRecordingProvider ownerId="profile-1" storage={storageForTest(storage)}>
          <Probe />
        </TimerOnlyRecordingProvider>,
      );
    });
    expect(currentRecording().state.reducer.lifecycle).toBe("paused");
    expect(storage.draft?.measuredJournal?.entries).toHaveLength(128);
    expect(storage.batchSizes.filter((size) => size > 0)).toEqual([128]);
  });
  it("does not turn timer ticks or periodic checkpoints into repeated measurements", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(epoch);
    const device = measuredBluetooth();
    const storage = new ControlledStorage();
    storage.releaseSave();
    await act(async () => {
      render(
        <TimerOnlyRecordingProvider ownerId="profile-1" storage={storageForTest(storage)}>
          <Probe />
        </TimerOnlyRecordingProvider>,
      );
    });
    expect(currentRecording().hydrationStatus).toBe("ready");
    act(() => currentRecording().configure({ activity_category: "bike" }));
    await act(async () => currentRecording().start());
    await act(async () => currentRecording().sensors.connect());
    await act(async () => device.emit(1000));
    await act(async () => vi.advanceTimersByTimeAsync(15000));
    expect(storage.draft?.measuredJournal?.entries).toHaveLength(1);
    expect(storage.draft?.measuredJournal?.entries[0]?.notification.recordedAt).toBe(
      new Date(epoch).toISOString(),
    );
    expect(currentRecording().sensors.state.metrics.heartRateBpm).toBeNull();
  });
  it("records actual active notifications through TCX parsing, excluding pre-start, pause and post-finish values", async () => {
    let now = epoch;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const device = measuredBluetooth();
    const storage = new ControlledStorage();
    storage.releaseSave();
    await renderReadyProvider(storage);
    await act(async () => currentRecording().sensors.connect());
    await act(async () => device.emit(900, 90));
    await startRecording();
    await act(async () => {
      now = epoch + 1000;
      device.emit(1000, 100);
    });
    await act(async () => {
      now = epoch + 2000;
      device.emit(1010, 105);
    });
    await waitFor(() => expect(storage.draft?.measuredJournal?.entries).toHaveLength(2), {
      timeout: 3000,
    });
    act(() => currentRecording().reset());
    expect(currentRecording().state.reducer.lifecycle).toBe("recording");
    expect(storage.draft?.measuredJournal?.entries).toHaveLength(2);
    await act(async () => {
      now = epoch + 3000;
      await currentRecording().pause();
    });
    await act(async () => {
      now = epoch + 4000;
      device.emit(2000, 200);
    });
    expect(storage.draft?.measuredJournal?.entries).toHaveLength(2);
    await act(async () => {
      now = epoch + 5000;
      await currentRecording().resume();
    });
    await act(async () => {
      now = epoch + 6000;
      device.emit(3000, 300);
    });
    await act(async () => {
      now = epoch + 6500;
      device.heartRate.emit([0, 160]);
    });
    await act(async () => {
      now = epoch + 7000;
      device.emit(3005, 302);
    });
    await act(async () => {
      now = epoch + 8000;
      await currentRecording().finish();
    });
    await act(async () => {
      now = epoch + 9000;
      device.emit(4000, 400);
    });
    const artifact = storage.artifact;
    expect(artifact?.measuredJournal?.entries).toHaveLength(5);
    expect(
      artifact?.measuredJournal?.entries.find((entry) =>
        entry.notification.sourceId.endsWith(":heartRate"),
      )?.notification.samples[0]?.source.sourceType,
    ).toBe("heart_rate_sensor");
    expect(artifact?.review).toMatchObject({
      distanceMeters: 15,
      calories: 7,
      distanceEnteredManually: false,
    });
    if (!artifact) throw new Error("Expected finalized measured recording");
    const parsed = parseActivityFile({ fileName: artifact.fileName, data: artifact.fileText });
    expect(parsed.records.map((record) => record.timestamp.getTime() - epoch)).toEqual([
      1000, 2000, 6000, 6500, 7000,
    ]);
    expect(parsed.records.map((record) => record.distance)).toEqual([
      undefined,
      10,
      undefined,
      undefined,
      15,
    ]);
    expect(parsed.records.map((record) => record.speed)).toEqual([10, 10, 10, undefined, 10]);
    expect(parsed.records.map((record) => record.power)).toEqual([250, 250, 250, undefined, 250]);
    expect(
      parsed.records.every(
        (record) => record.positionLat === undefined && record.positionLong === undefined,
      ),
    ).toBe(true);
  });
  it("recovers prior samples once and rebases cumulative counters on the new connection", async () => {
    let now = epoch;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const device = measuredBluetooth();
    const storage = new ControlledStorage();
    storage.releaseSave();
    await renderReadyProvider(storage);
    await startRecording();
    await act(async () => currentRecording().sensors.connect());
    await act(async () => {
      now = epoch + 1000;
      device.emit(1000);
    });
    await act(async () => {
      now = epoch + 2000;
      device.emit(1010);
    });
    await waitFor(() => expect(storage.draft?.measuredJournal?.entries).toHaveLength(2), {
      timeout: 3000,
    });
    const originalSources = storage.draft?.measuredJournal?.entries.map(
      (entry) => entry.notification.sourceId,
    );
    cleanup();
    now = epoch + 10000;
    await renderReadyProvider(storage);
    expect(currentRecording().state.reducer.lifecycle).toBe("paused");
    await act(async () => currentRecording().sensors.connect());
    await act(async () => {
      now = epoch + 11000;
      device.emit(9000);
    });
    await act(async () => {
      now = epoch + 12000;
      await currentRecording().resume();
    });
    await act(async () => {
      now = epoch + 13000;
      device.emit(10000);
    });
    await act(async () => {
      now = epoch + 14000;
      device.emit(10010);
    });
    await act(async () => {
      now = epoch + 15000;
      await currentRecording().finish();
    });
    expect(storage.artifact?.measuredJournal?.entries.map((entry) => entry.sequenceNumber)).toEqual(
      [1, 2, 3, 4],
    );
    expect(
      storage.artifact?.measuredJournal?.entries
        .slice(0, 2)
        .map((entry) => entry.notification.sourceId),
    ).toEqual(originalSources);
    expect(storage.artifact?.review.distanceMeters).toBe(20);
  });
  it.each([
    false,
    true,
  ])("flushes accepted writes before finalization and fences notifications during finish (write failure: %s)", async (writeFails) => {
    let now = epoch;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const device = measuredBluetooth();
    const storage = new ControlledStorage();
    storage.releaseSave();
    await renderReadyProvider(storage);
    await startPlannedRecording();
    await act(async () => currentRecording().sensors.connect());
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const save = storage.append.bind(storage);
    vi.spyOn(storage, "append").mockImplementationOnce(async (draft, batch) => {
      await gate;
      return save(draft, batch);
    });
    await act(async () => {
      now = epoch + 1000;
      device.emit(1000);
    });
    let finished: Promise<void> = Promise.resolve();
    await act(async () => {
      now = epoch + 2000;
      finished = currentRecording().finish();
    });
    await act(async () => currentRecording().completeStep());
    expect(currentRecording().state.planExecution?.completedOccurrenceIds).toEqual([]);
    await act(async () => {
      now = epoch + 3000;
      device.emit(2000);
    });
    expect(storage.artifact).toBeNull();
    if (writeFails) storage.saveError = new DOMException("Quota exhausted", "QuotaExceededError");
    await act(async () => {
      release();
      await finished;
    });
    if (writeFails) {
      expect(storage.artifact).toBeNull();
      expect(currentRecording().durabilityFenced).toBe(true);
      expect(currentRecording().state.reducer.lifecycle).toBe("paused");
      expect(currentRecording().error).toContain("could not be confirmed");
    } else {
      expect(storage.artifact?.measuredJournal?.entries).toHaveLength(1);
      expect(storage.artifact?.finishedAt).toBe(new Date(epoch + 2000).toISOString());
    }
  });
  it("bounds storage backpressure rather than accepting an unbounded unsaved stream", async () => {
    let now = epoch;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const device = measuredBluetooth();
    const storage = new ControlledStorage();
    storage.releaseSave();
    await renderReadyProvider(storage);
    await startRecording();
    await act(async () => currentRecording().sensors.connect());
    await act(async () => {
      for (let index = 0; index < 4097; index++) {
        now = epoch + index + 1;
        device.emit(1000 + index);
      }
    });
    expect(currentRecording().durabilityFenced).toBe(true);
    expect(currentRecording().state.reducer.lifecycle).toBe("paused");
    expect(storage.artifact).toBeNull();
    expect(storage.draft?.measuredJournal?.entries.length ?? 0).toBeLessThanOrEqual(4096);
  });
  it("fences a failed sample write, retains the last durable samples, and cannot promote an artifact", async () => {
    let now = epoch;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const device = measuredBluetooth();
    const storage = new ControlledStorage();
    storage.releaseSave();
    await renderReadyProvider(storage);
    await startRecording();
    await act(async () => currentRecording().sensors.connect());
    await act(async () => {
      now = epoch + 1000;
      device.emit(1000);
    });
    await waitFor(() => expect(storage.draft?.measuredJournal?.entries).toHaveLength(1), {
      timeout: 3000,
    });
    storage.saveError = new DOMException("Quota exhausted", "QuotaExceededError");
    await act(async () => {
      now = epoch + 2000;
      device.emit(1010);
    });
    await waitFor(() => expect(currentRecording().durabilityFenced).toBe(true), { timeout: 3000 });
    expect(currentRecording().state.reducer.lifecycle).toBe("paused");
    expect(currentRecording().error).toContain("could not be confirmed");
    await act(async () => {
      now = epoch + 3000;
      device.emit(1020);
      await currentRecording().finish();
    });
    expect(storage.artifact).toBeNull();
    expect(storage.draft?.measuredJournal?.entries).toHaveLength(1);
    storage.saveError = null;
    await act(async () => currentRecording().retryDurableStorage());
    await act(async () => {
      now = epoch + 4000;
      await currentRecording().resume();
    });
    await act(async () => {
      now = epoch + 5000;
      device.emit(2000);
    });
    await act(async () => {
      now = epoch + 6000;
      device.emit(2005);
    });
    await act(async () => {
      now = epoch + 7000;
      await currentRecording().finish();
    });
    expect(storage.artifact?.measuredJournal?.entries).toHaveLength(3);
    expect(storage.artifact?.review.distanceMeters).toBe(5);
  });
  it("does not erase or overwrite an invalid measured journal when recovery is retried", async () => {
    let now = epoch;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const device = measuredBluetooth();
    const storage = new ControlledStorage();
    storage.releaseSave();
    await renderReadyProvider(storage);
    await startRecording();
    await act(async () => currentRecording().sensors.connect());
    await act(async () => {
      now = epoch + 1000;
      device.emit(1000);
    });
    await waitFor(() => expect(storage.draft?.measuredJournal?.entries).toHaveLength(1), {
      timeout: 3000,
    });
    cleanup();
    if (!storage.draft?.measuredJournal) throw new Error("Expected saved journal");
    Reflect.set(storage.draft.measuredJournal, "provenance", "synthetic");
    const before = structuredClone(storage.draft);
    const removes = storage.removeCalls;
    const saves = storage.saveCalls;
    render(
      <TimerOnlyRecordingProvider ownerId="profile-1" storage={storageForTest(storage)}>
        <Probe />
      </TimerOnlyRecordingProvider>,
    );
    await waitFor(() => expect(currentRecording().hydrationStatus).toBe("error"));
    expect(currentRecording().durabilityFenced).toBe(true);
    await act(async () => currentRecording().retryDurableStorage());
    act(() => currentRecording().reset());
    await act(async () => currentRecording().start());
    expect(storage.draft).toEqual(before);
    expect(storage.saveCalls).toBe(saves);
    expect(storage.removeCalls).toBe(removes);
  });
  it("freezes the last confirmed timer if an intentional reload cannot validate saved evidence", async () => {
    let now = epoch;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const device = measuredBluetooth();
    const storage = new ControlledStorage();
    storage.releaseSave();
    await renderReadyProvider(storage);
    await startRecording();
    await act(async () => currentRecording().sensors.connect());
    await act(async () => {
      now = epoch + 1000;
      device.emit(1000);
    });
    await waitFor(() => expect(storage.draft?.measuredJournal?.entries).toHaveLength(1), {
      timeout: 3000,
    });
    if (!storage.draft?.measuredJournal) throw new Error("Expected journal");
    Reflect.set(storage.draft.measuredJournal, "provenance", "synthetic");
    await act(async () => {
      now = epoch + 2000;
      await currentRecording().takeOver();
    });
    expect(currentRecording().hydrationStatus).toBe("error");
    expect(currentRecording().durabilityFenced).toBe(true);
    expect(currentRecording().state.reducer.lifecycle).toBe("paused");
    expect(currentRecording().elapsedSeconds).toBe(1);
  });
  it("keeps an acknowledged artifact finished if refreshing local history fails", async () => {
    let now = epoch;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const device = measuredBluetooth();
    const storage = new ControlledStorage();
    storage.releaseSave();
    await renderReadyProvider(storage);
    await startRecording();
    await act(async () => currentRecording().sensors.connect());
    await act(async () => {
      now = epoch + 1000;
      device.emit(1000);
    });
    vi.spyOn(storage, "listArtifacts").mockRejectedValueOnce(new Error("History unavailable"));
    await act(async () => {
      now = epoch + 2000;
      await currentRecording().finish();
    });
    expect(currentRecording().state.reducer.lifecycle).toBe("finished");
    expect(currentRecording().artifact?.measuredJournal?.entries).toHaveLength(1);
    expect(currentRecording().error).toContain("saved locally");
    const artifact = storage.artifact;
    await act(async () => {
      now = epoch + 5000;
      await currentRecording().finish();
    });
    expect(storage.artifact).toBe(artifact);
    expect(storage.artifact?.finishedAt).toBe(new Date(epoch + 2000).toISOString());
  });
  it("never rolls an acknowledged artifact back into an active draft after idle lease cleanup fails", async () => {
    let now = epoch;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const storage = new ControlledStorage();
    storage.releaseSave();
    await renderReadyProvider(storage);
    await startRecording();
    storage.removeError = new Error("Idle lease cleanup failed");
    await act(async () => {
      now = epoch + 2000;
      await currentRecording().finish();
    });
    await waitFor(() => expect(currentRecording().durabilityFenced).toBe(true));
    expect(currentRecording().state.reducer.lifecycle).toBe("finished");
    expect(currentRecording().artifact).not.toBeNull();
    expect(storage.draft).toBeNull();
    storage.removeError = null;
    await act(async () => currentRecording().retryDurableStorage());
    expect(currentRecording().state.reducer.lifecycle).toBe("finished");
    expect(storage.draft).toBeNull();
  });
});
describe("timer-only recording cancellation", () => {
  it("exposes an actionable zero-duration finish error and lets the recording continue", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(1000);
    const storage = new ControlledStorage();
    storage.releaseSave();
    await renderReadyProvider(storage);
    await startRecording();
    await act(async () => currentRecording().finish());
    expect(currentRecording().error).toBe("Record some time before finishing this activity.");
    expect(currentRecording().state.reducer.lifecycle).toBe("recording");
    expect(currentRecording().artifact).toBeNull();
    clock.mockReturnValue(2000);
    await act(async () => currentRecording().finish());
    expect(currentRecording().state.reducer.lifecycle).toBe("finished");
    expect(currentRecording().artifact?.elapsedMs).toBe(1000);
  });
  it("keeps the finished runtime identity during queue refreshes and replaces it on intentional reload", async () => {
    const storage = new ControlledStorage();
    storage.releaseSave();
    await renderReadyProvider(storage);
    await startRecording();
    await act(async () => currentRecording().finish());
    const finishedState = currentRecording().state;
    const artifact = currentRecording().artifact;
    expect(artifact).not.toBeNull();
    expect(finishedState.reducer.lifecycle).toBe("finished");
    await act(async () =>
      currentRecording().drainSubmissionQueue(async () => ({ activityId: "unused" })),
    );
    expect(currentRecording().artifact).not.toBe(artifact);
    expect(currentRecording().artifact).toEqual(artifact);
    expect(currentRecording().state).toBe(finishedState);
    await act(async () => currentRecording().takeOver());
    expect(currentRecording().artifact?.recordingSessionId).toBe(artifact?.recordingSessionId);
    expect(currentRecording().state).not.toBe(finishedState);
    expect(currentRecording().state.reducer.lifecycle).toBe("finished");
  });
  it("reports rejected configuration and retains the previous configuration", async () => {
    const storage = new ControlledStorage();
    storage.releaseSave();
    await renderReadyProvider(storage);
    act(() => {
      expect(currentRecording().configure({ activity_category: "run" })).toBe(true);
    });
    const previous = currentRecording().state;
    act(() => {
      expect(
        currentRecording().configure({
          activity_category: "bike",
          activityPlanId: "plan-1",
          plan: {
            activityPlanId: "plan-1",
            scheduledEventId: null,
            name: "Invalid plan",
            description: null,
            activityPlanRevision: 1,
            structureHash: "invalid",
            structure: {},
          },
        }),
      ).toBe(false);
    });
    expect(currentRecording().state).toBe(previous);
    expect(currentRecording().error).toBe("The selected activity plan is invalid or inconsistent.");
  });
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
  it.each([
    "flush",
    "revision",
  ])("does not claim a guidance change after a failed %s checkpoint", async (stage) => {
    const storage = new ControlledStorage();
    storage.releaseSave();
    await renderReadyProvider(storage);
    await startPlannedRecording();
    const append = storage.append.bind(storage);
    vi.spyOn(storage, "append").mockImplementation(async (draft, batch) => {
      if (stage === "flush" || draft.guidance)
        throw new DOMException("Quota exhausted", "QuotaExceededError");
      return append(draft, batch);
    });
    let accepted = true;
    await act(async () => {
      accepted = await currentRecording().changePlan(null);
    });
    expect(accepted).toBe(false);
    expect(currentRecording().durabilityFenced).toBe(true);
    expect(currentRecording().state.guidance).toBeUndefined();
    expect(storage.draft?.guidance).toBeUndefined();
    expect(currentRecording().statusMessage).not.toMatch(/detached and saved/);
  });
  it("commits guidance after the measured prefix and recovers it with unchanged samples", async () => {
    const storage = new ControlledStorage();
    storage.releaseSave();
    await renderReadyProvider(storage);
    await startPlannedRecording();
    const snapshot = currentRecording().state.reducer.snapshot;
    let accepted = false;
    await act(async () => {
      accepted = await currentRecording().changePlan(null);
    });
    expect(accepted).toBe(true);
    const committed = storage.savedDrafts.findIndex((draft) => draft.guidance !== undefined);
    expect(committed).toBeGreaterThan(0);
    expect(storage.savedDrafts[committed - 1]?.guidance).toBeUndefined();
    expect(storage.savedDrafts.at(-1)?.guidance?.revisions).toHaveLength(2);
    expect(currentRecording().state.reducer.snapshot).toEqual(snapshot);
    const before = storage.draft?.measuredJournal;
    await act(async () => currentRecording().retryDurableStorage());
    expect(currentRecording().state.guidance).toEqual(storage.draft?.guidance);
    expect(storage.draft?.measuredJournal).toEqual(before);
  });
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
    expect(currentRecording().error).toContain("could not be confirmed");
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
      { timeout: 2500 },
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
      { timeout: 2500 },
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
  it("preserves a pending durable checkpoint when the authenticated recorder subtree unmounts", async () => {
    const storage = new ControlledStorage();
    const rendered = render(
      <TimerOnlyRecordingProvider ownerId="profile-1" storage={storageForTest(storage)}>
        <Probe />
      </TimerOnlyRecordingProvider>,
    );
    await waitFor(() => expect(currentRecording().hydrationStatus).toBe("ready"));
    act(() => {
      currentRecording().configure({ activity_category: "run" });
    });
    await waitFor(() => expect(currentRecording().state.configuration).not.toBeNull());
    void currentRecording().start();
    await waitFor(() => expect(storage.saveCalls).toBeGreaterThan(0));

    const removesBeforeUnmount = storage.removeCalls;
    rendered.unmount();
    storage.releaseSave();

    await waitFor(() => expect(storage.draft).not.toBeNull());
    expect(storage.removeCalls).toBe(removesBeforeUnmount);
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
      vi.advanceTimersByTime(16000);
    });
    await recording?.drainSubmissionQueue(async () => ({ activityId: "activity-1" }));
    expect(storage.loadCalls).toBe(0);
    expect(storage.saveCalls).toBe(0);
    expect(storage.listDueSubmissionJobsCalls).toBe(0);
  });
  it("does not claim or submit queued artifacts while unsupported draft recovery is blocked", async () => {
    let now = 1_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const seed = new ControlledStorage();
    seed.releaseSave();
    await renderReadyProvider(seed);
    await startRecording();
    now = 2_000;
    await act(async () => currentRecording().finish());
    const artifact = seed.artifact;
    if (!artifact) throw new Error("Expected a finalized artifact to seed the queued submission.");
    cleanup();
    recording = null;

    const storage = new ControlledStorage();
    storage.releaseSave();
    storage.artifact = artifact;
    storage.dueSubmissionJobs = [createQueuedSubmissionJob(artifact, new Date(now).toISOString())];
    storage.loadError = new UnsupportedRecordingContractError();
    const submit = vi.fn(async () => ({ activityId: "activity-1" }));
    render(
      <TimerOnlyRecordingProvider ownerId="profile-1" storage={storageForTest(storage)}>
        <Probe />
      </TimerOnlyRecordingProvider>,
    );
    await waitFor(() => expect(recording?.hydrationStatus).toBe("error"));

    // Both the manual action and the route's online/interval callback enter through
    // this public drain boundary; neither may claim or upload before recovery succeeds.
    await act(async () => currentRecording().drainSubmissionQueue(submit));
    window.dispatchEvent(new Event("online"));
    await act(async () => currentRecording().drainSubmissionQueue(submit));

    expect(storage.claimSubmissionJobCalls).toBe(0);
    expect(submit).not.toHaveBeenCalled();
  });
});
