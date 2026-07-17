import type { PortableTimerRecordingDraft } from "@repo/core";
import { describe, expect, it } from "vitest";

import {
  checkpointTimerDraft,
  isTimerDraftLeaseAvailable,
  loadTimerDraft,
  type TimerDraftStorage,
} from "./draft-storage";
import {
  configureTimerOnlyRecording,
  createInitialTimerOnlyRecordingState,
  finishTimerOnlyRecording,
  getTimerOnlyRecordingTimes,
  pauseTimerOnlyRecording,
  recoverTimerOnlyRecording,
  startTimerOnlyRecording,
} from "./timer-runtime";

class FakeTimerDraftStorage implements TimerDraftStorage {
  value: unknown = null;
  removeCount = 0;

  async load(): Promise<unknown> {
    return this.value;
  }

  async save(draft: PortableTimerRecordingDraft): Promise<void> {
    this.value = structuredClone(draft);
  }

  async remove(): Promise<void> {
    this.value = null;
    this.removeCount += 1;
  }
}

function startedRecording() {
  const configured = configureTimerOnlyRecording(createInitialTimerOnlyRecordingState(), {
    category: "run",
    eventId: "00000000-0000-4000-8000-000000000001",
    activityPlanId: "00000000-0000-4000-8000-000000000003",
  }).state;
  return startTimerOnlyRecording(configured, 2_000, "web-session-1").state;
}

describe("web timer draft persistence", () => {
  it("allows the owning or an expired lease and rejects a live foreign lease", () => {
    expect(
      isTimerDraftLeaseAvailable({
        leaseOwner: "tab-a",
        leaseExpiresAtMs: 20_000,
        instanceId: "tab-a",
        nowMs: 10_000,
      }),
    ).toBe(true);
    expect(
      isTimerDraftLeaseAvailable({
        leaseOwner: "tab-a",
        leaseExpiresAtMs: 20_000,
        instanceId: "tab-b",
        nowMs: 10_000,
      }),
    ).toBe(false);
    expect(
      isTimerDraftLeaseAvailable({
        leaseOwner: "tab-a",
        leaseExpiresAtMs: 20_000,
        instanceId: "tab-b",
        nowMs: 20_000,
      }),
    ).toBe(true);
  });

  it("round-trips an active timer draft through the storage boundary", async () => {
    const storage = new FakeTimerDraftStorage();
    const paused = pauseTimerOnlyRecording(startedRecording(), 8_000).state;

    await checkpointTimerDraft(storage, paused, 12_000, "profile-1");
    const loaded = await loadTimerDraft(storage, "profile-1");

    expect(loaded.status).toBe("valid");
    expect(loaded.draft).toMatchObject({
      lifecycle: "paused",
      timing: { elapsedMs: 10_000, movingMs: 6_000 },
    });
  });

  it("recovers saved values into paused state without auto-resuming", async () => {
    const storage = new FakeTimerDraftStorage();
    await checkpointTimerDraft(storage, startedRecording(), 7_500, "profile-1");
    const loaded = await loadTimerDraft(storage, "profile-1");
    if (!loaded.draft) throw new Error("Expected a valid draft.");

    const recovered = recoverTimerOnlyRecording(loaded.draft, 100_000);

    expect(recovered.rejectedReason).toBeNull();
    expect(recovered.state.reducer.lifecycle).toBe("paused");
    expect(recovered.state.configuration).toMatchObject({
      category: "run",
      eventId: "00000000-0000-4000-8000-000000000001",
    });
    expect(getTimerOnlyRecordingTimes(recovered.state, 100_000)).toEqual({
      elapsedSeconds: 5,
      movingSeconds: 5,
    });
  });

  it("discards corrupt untrusted storage data", async () => {
    const storage = new FakeTimerDraftStorage();
    storage.value = { schemaVersion: 1, timing: { movingMs: -1 } };

    await expect(loadTimerDraft(storage, "profile-1")).resolves.toEqual({
      status: "discarded-invalid",
      draft: null,
    });
    expect(storage.value).toBeNull();
    expect(storage.removeCount).toBe(1);
  });

  it("discards a valid draft owned by another profile", async () => {
    const storage = new FakeTimerDraftStorage();
    await checkpointTimerDraft(storage, startedRecording(), 7_500, "profile-1");

    await expect(loadTimerDraft(storage, "profile-2")).resolves.toEqual({
      status: "discarded-invalid",
      draft: null,
    });
    expect(storage.value).toBeNull();
  });

  it("clears the stored draft after finish", async () => {
    const storage = new FakeTimerDraftStorage();
    const recording = startedRecording();
    await checkpointTimerDraft(storage, recording, 7_000, "profile-1");
    expect(storage.value).not.toBeNull();

    const finished = finishTimerOnlyRecording(recording, 8_000).state;
    await checkpointTimerDraft(storage, finished, 8_000, "profile-1");

    expect(storage.value).toBeNull();
    expect(storage.removeCount).toBe(1);
  });
});
