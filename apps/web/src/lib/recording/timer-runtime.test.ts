import { describe, expect, it } from "vitest";

import {
  configureTimerOnlyRecording,
  createInitialTimerOnlyRecordingState,
  finishTimerOnlyRecording,
  getTimerOnlyRecordingTimes,
  pauseTimerOnlyRecording,
  resetTimerOnlyRecording,
  restoreFinishedTimerOnlyRecording,
  resumeTimerOnlyRecording,
  startTimerOnlyRecording,
} from "./timer-runtime";

const configure = () =>
  configureTimerOnlyRecording(createInitialTimerOnlyRecordingState(), {
    category: "run",
    eventId: "00000000-0000-4000-8000-000000000001",
    activityPlanId: "00000000-0000-4000-8000-000000000003",
    routeId: "00000000-0000-4000-8000-000000000002",
  });

describe("timer-only web recording runtime", () => {
  it("configures launcher state without locking the Core snapshot early", () => {
    const result = configure();

    expect(result.rejectedReason).toBeNull();
    expect(result.state.reducer.lifecycle).toBe("pending");
    expect(result.state.reducer.snapshot).toBeNull();
    expect(result.state.configuration).toMatchObject({
      category: "run",
      eventId: "00000000-0000-4000-8000-000000000001",
      activityPlanId: "00000000-0000-4000-8000-000000000003",
      routeId: "00000000-0000-4000-8000-000000000002",
    });
  });

  it("locks snapshot identity at the actual start time", () => {
    const started = startTimerOnlyRecording(configure().state, 5_000, "web-session-1");

    expect(started.state.reducer.snapshot?.identity.startedAt).toBe(new Date(5_000).toISOString());
    expect(started.state.reducer.snapshot?.activity.activityPlanId).toBe(
      "00000000-0000-4000-8000-000000000003",
    );
    expect(started.state.reducer.lifecycle).toBe("recording");
  });

  it("tracks elapsed wall time and excludes pauses from moving time", () => {
    let state = configure().state;
    state = startTimerOnlyRecording(state, 2_000, "web-session-1").state;

    expect(getTimerOnlyRecordingTimes(state, 7_900)).toEqual({
      elapsedSeconds: 5,
      movingSeconds: 5,
    });

    state = pauseTimerOnlyRecording(state, 8_000).state;
    expect(getTimerOnlyRecordingTimes(state, 12_000)).toEqual({
      elapsedSeconds: 10,
      movingSeconds: 6,
    });

    state = resumeTimerOnlyRecording(state, 12_000).state;
    state = finishTimerOnlyRecording(state, 15_500).state;

    expect(state.reducer.lifecycle).toBe("finished");
    expect(getTimerOnlyRecordingTimes(state, 99_000)).toEqual({
      elapsedSeconds: 13,
      movingSeconds: 9,
    });
  });

  it("rejects invalid transitions without changing state", () => {
    const initial = createInitialTimerOnlyRecordingState();
    const start = startTimerOnlyRecording(initial, 1_000, "web-session-1");
    expect(start.rejectedReason).toContain("Configure");
    expect(start.state).toBe(initial);

    const ready = configure().state;
    const resume = resumeTimerOnlyRecording(ready, 2_000);
    expect(resume.rejectedReason).toContain("pending");
    expect(resume.state).toBe(ready);

    const finish = finishTimerOnlyRecording(ready, 3_000);
    expect(finish.rejectedReason).toContain("pending");
    expect(finish.state).toBe(ready);
  });

  it("resets a completed runtime to an empty pending session", () => {
    let state = configure().state;
    state = startTimerOnlyRecording(state, 2_000, "web-session-1").state;
    state = finishTimerOnlyRecording(state, 3_000).state;

    const reset = resetTimerOnlyRecording();
    expect(reset.state.reducer.lifecycle).toBe("pending");
    expect(reset.state.reducer.snapshot).toBeNull();
    expect(getTimerOnlyRecordingTimes(reset.state, 10_000)).toEqual({
      elapsedSeconds: 0,
      movingSeconds: 0,
    });
  });

  it("restores a finalized artifact as immutable finished state after refresh", async () => {
    let state = configure().state;
    state = startTimerOnlyRecording(state, 2_000, "web-session-1").state;
    state = finishTimerOnlyRecording(state, 5_000).state;
    const snapshot = state.reducer.snapshot;
    if (!snapshot) throw new Error("Expected locked snapshot");

    const restored = restoreFinishedTimerOnlyRecording({
      snapshot,
      startedAt: new Date(2_000).toISOString(),
      finishedAt: new Date(5_000).toISOString(),
      elapsedMs: 3_000,
      movingMs: 3_000,
    });

    expect(restored.reducer.lifecycle).toBe("finished");
    expect(restored.reducer.snapshot).toEqual(snapshot);
    expect(restored.configuration).toMatchObject({
      category: "run",
      eventId: "00000000-0000-4000-8000-000000000001",
      routeId: "00000000-0000-4000-8000-000000000002",
    });
    expect(getTimerOnlyRecordingTimes(restored, 99_000)).toEqual({
      elapsedSeconds: 3,
      movingSeconds: 3,
    });
  });
});
