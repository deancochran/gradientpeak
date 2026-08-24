import { activityPlanStructureSchema } from "@repo/core";
import { describe, expect, it } from "vitest";

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
} from "./timer-runtime";

const planStructure = {
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
              name: "Timed",
              duration: { type: "time", seconds: 10 },
              targets: [{ type: "RPE", intensity: 4 }],
            },
            {
              id: "30000000-0000-4000-8000-000000000002",
              name: "Distance",
              duration: { type: "distance", meters: 100 },
              targets: [{ type: "RPE", intensity: 5 }],
            },
            {
              id: "30000000-0000-4000-8000-000000000003",
              name: "Reps",
              duration: { type: "repetitions", count: 5 },
              targets: [{ type: "RPE", intensity: 6 }],
            },
          ],
        },
      ],
    },
  ],
} as const;

const configurePlan = () =>
  configureTimerOnlyRecording(createInitialTimerOnlyRecordingState(), {
    activity_category: "run",
    eventId: "00000000-0000-4000-8000-000000000001",
    activityPlanId: "00000000-0000-4000-8000-000000000003",
    plan: {
      activityPlanId: "00000000-0000-4000-8000-000000000003",
      scheduledEventId: "00000000-0000-4000-8000-000000000001",
      name: "Indoor intervals",
      description: null,
      activityPlanRevision: 2,
      structureHash: `v1:sha256:${"a".repeat(64)}`,
      structure: planStructure,
    },
  });

const configure = () =>
  configureTimerOnlyRecording(createInitialTimerOnlyRecordingState(), {
    activity_category: "run",
    eventId: "00000000-0000-4000-8000-000000000001",
    activityPlanId: "00000000-0000-4000-8000-000000000003",
  });

describe("timer-only web recording runtime", () => {
  it("auto-advances timed steps from moving timestamps and freezes progression while paused", () => {
    let state = startTimerOnlyRecording(configurePlan().state, 0, "plan-session").state;
    state = pauseTimerOnlyRecording(state, 5_000).state;
    expect(
      getTimerOnlyPlanStatus(advanceTimerOnlyRecording(state, 30_000).state, 30_000)
        ?.currentOccurrenceIndex,
    ).toBe(0);
    state = resumeTimerOnlyRecording(state, 30_000).state;
    state = advanceTimerOnlyRecording(state, 35_000).state;
    expect(getTimerOnlyPlanStatus(state, 35_000)).toMatchObject({
      currentOccurrenceIndex: 1,
      completedCount: 1,
    });
  });

  it("never timer-completes distance or repetition steps and supports complete, previous, and skip", () => {
    let state = startTimerOnlyRecording(configurePlan().state, 0, "plan-session").state;
    state = advanceTimerOnlyRecording(state, 10_000).state;
    expect(
      getTimerOnlyPlanStatus(advanceTimerOnlyRecording(state, 500_000).state, 500_000)
        ?.currentOccurrenceIndex,
    ).toBe(1);
    state = completeCurrentPlanStep(state, 500_000).state;
    expect(getTimerOnlyPlanStatus(state, 500_000)?.currentOccurrenceIndex).toBe(2);
    state = previousPlanStep(state, 501_000).state;
    expect(getTimerOnlyPlanStatus(state, 501_000)?.currentOccurrenceIndex).toBe(1);
    state = skipCurrentPlanStep(state, 502_000).state;
    expect(getTimerOnlyPlanStatus(state, 502_000)).toMatchObject({
      currentOccurrenceIndex: 2,
      skippedCount: 1,
    });
    expect(
      getTimerOnlyPlanStatus(advanceTimerOnlyRecording(state, 900_000).state, 900_000)
        ?.currentOccurrenceIndex,
    ).toBe(2);
  });

  it("captures monotonic lap evidence with current step identity and retains it at finish", () => {
    let state = startTimerOnlyRecording(configurePlan().state, 1_000, "plan-session").state;
    state = captureTimerOnlyLap(state, 4_000).state;
    state = captureTimerOnlyLap(state, 8_000).state;
    state = finishTimerOnlyRecording(state, 9_000).state;
    expect(state.planExecution?.laps).toMatchObject([
      { lapNumber: 1, elapsedMs: 3_000, movingMs: 3_000, occurrenceIndex: 0 },
      { lapNumber: 2, elapsedMs: 7_000, movingMs: 7_000, occurrenceIndex: 0 },
    ]);
    expect(state.reducer.lifecycle).toBe("finished");
  });

  it("locks plan structure and authored target presentation at start", () => {
    const started = startTimerOnlyRecording(configurePlan().state, 1_000, "plan-session").state;
    expect(started.reducer.snapshot?.planExecution).toMatchObject({
      manifestVersion: 1,
      compilerVersion: 1,
      name: "Indoor intervals",
      personalizationEnabled: false,
      targetPresentations: expect.arrayContaining([expect.objectContaining({ labels: ["4 RPE"] })]),
    });
  });

  it("keeps a missing-fact threshold target authored in the locked snapshot", () => {
    const missingFactStructure = activityPlanStructureSchema.parse({
      ...planStructure,
      segments: planStructure.segments.map((segment) => ({
        ...segment,
        intervals: segment.intervals.map((interval) => ({
          ...interval,
          steps: interval.steps.map((step, index) =>
            index === 0 ? { ...step, targets: [{ type: "%ThresholdHR", intensity: 80 }] } : step,
          ),
        })),
      })),
    });
    const configured = configureTimerOnlyRecording(createInitialTimerOnlyRecordingState(), {
      activity_category: "run",
      activityPlanId: "00000000-0000-4000-8000-000000000003",
      plan: {
        activityPlanId: "00000000-0000-4000-8000-000000000003",
        scheduledEventId: null,
        name: "Authored threshold",
        description: null,
        activityPlanRevision: 1,
        structureHash: `v1:sha256:${"d".repeat(64)}`,
        structure: missingFactStructure,
      },
    });
    const started = startTimerOnlyRecording(configured.state, 1_000, "authored-threshold").state;

    expect(started.reducer.snapshot?.planExecution).toMatchObject({
      personalizationEnabled: false,
      targetPresentations: expect.arrayContaining([
        expect.objectContaining({ labels: ["80% Threshold HR"] }),
      ]),
    });
    expect(started.reducer.snapshot?.performanceTargets.thresholds.run.status).toBe("unavailable");
  });

  it("records an unscheduled plan as planned without inventing an event identity", () => {
    const configured = configureTimerOnlyRecording(createInitialTimerOnlyRecordingState(), {
      activity_category: "run",
      activityPlanId: "00000000-0000-4000-8000-000000000003",
      plan: {
        activityPlanId: "00000000-0000-4000-8000-000000000003",
        scheduledEventId: null,
        name: "Library plan",
        description: null,
        activityPlanRevision: 1,
        structureHash: `v1:sha256:${"c".repeat(64)}`,
        structure: planStructure,
      },
    }).state;
    const started = startTimerOnlyRecording(configured, 1_000, "unscheduled-plan").state;
    expect(started.reducer.snapshot?.activity).toMatchObject({ mode: "planned", eventId: null });
    expect(started.reducer.snapshot?.planExecution?.scheduledEventId).toBeNull();
  });
  it("configures launcher state without locking the Core snapshot early", () => {
    const result = configure();

    expect(result.rejectedReason).toBeNull();
    expect(result.state.reducer.lifecycle).toBe("pending");
    expect(result.state.reducer.snapshot).toBeNull();
    expect(result.state.configuration).toMatchObject({
      activity_category: "run",
      eventId: "00000000-0000-4000-8000-000000000001",
      activityPlanId: "00000000-0000-4000-8000-000000000003",
    });
  });

  it("locks snapshot identity at the actual start time", () => {
    const started = startTimerOnlyRecording(configure().state, 5_000, "web-session-1");

    expect(started.state.reducer.snapshot?.identity.startedAt).toBe(new Date(5_000).toISOString());
    expect(started.state.reducer.snapshot?.activity.activityPlanId).toBe(
      "00000000-0000-4000-8000-000000000003",
    );
    expect(started.state.reducer.snapshot?.performanceTargets).toMatchObject({
      contractVersion: "athlete-performance-target-facts-v3",
      thresholds: {
        bike: { activityCategory: "bike", status: "unavailable", unit: "watts" },
        run: { activityCategory: "run", status: "unavailable", unit: "meters_per_second" },
        swim: { activityCategory: "swim", status: "unavailable", unit: "meters_per_second" },
      },
    });
    expect(started.state.reducer.snapshot?.performanceTargets).not.toHaveProperty("cycling");
    expect(started.state.reducer.lifecycle).toBe("recording");
  });

  it("tracks elapsed wall time and excludes pauses from moving time", () => {
    let state = configure().state;
    state = startTimerOnlyRecording(state, 2_000, "web-session-1").state;

    expect(getTimerOnlyRecordingTimes(state, 7_900)).toEqual({
      elapsedSeconds: 5,
      activeSeconds: 5,
      movingSeconds: 5,
    });

    state = pauseTimerOnlyRecording(state, 8_000).state;
    expect(getTimerOnlyRecordingTimes(state, 12_000)).toEqual({
      elapsedSeconds: 10,
      activeSeconds: 6,
      movingSeconds: 6,
    });

    state = resumeTimerOnlyRecording(state, 12_000).state;
    state = finishTimerOnlyRecording(state, 15_500).state;

    expect(state.reducer.lifecycle).toBe("finished");
    expect(getTimerOnlyRecordingTimes(state, 99_000)).toEqual({
      elapsedSeconds: 13,
      activeSeconds: 9,
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
      activeSeconds: 0,
      movingSeconds: 0,
    });
  });

  it("restores a finalized artifact as immutable finished state after refresh", async () => {
    let state = configureTimerOnlyRecording(createInitialTimerOnlyRecordingState(), {
      activity_category: "run",
      eventId: "00000000-0000-4000-8000-000000000001",
      routeId: "00000000-0000-4000-8000-000000000002",
    }).state;
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
      activity_category: "run",
      eventId: "00000000-0000-4000-8000-000000000001",
    });
    expect(restored.configuration).toMatchObject({
      routeId: "00000000-0000-4000-8000-000000000002",
    });
    expect(getTimerOnlyRecordingTimes(restored, 99_000)).toEqual({
      elapsedSeconds: 3,
      activeSeconds: 3,
      movingSeconds: 3,
    });
  });

  it("forces location off while retaining selected route identity in new snapshots", () => {
    const configured = configureTimerOnlyRecording(createInitialTimerOnlyRecordingState(), {
      activity_category: "bike",
      routeId: "00000000-0000-4000-8000-000000000002",
    });
    const started = startTimerOnlyRecording(configured.state, 2_000, "web-session-1");

    expect(started.state.reducer.snapshot?.activity.gpsMode).toBe("off");
    expect(started.state.reducer.snapshot?.activity.routeId).toBe(
      "00000000-0000-4000-8000-000000000002",
    );
  });

  it("clears legacy device metadata while recovering an indoor draft", () => {
    const started = startTimerOnlyRecording(configure().state, 2_000, "web-session-1").state;
    const draft = createTimerOnlyRecordingDraft(started, 7_000, "profile-1");
    if (!draft) throw new Error("Expected a recording draft");

    const legacyDraft = structuredClone(draft);
    legacyDraft.sessionSnapshot.devices = {
      ...legacyDraft.sessionSnapshot.devices,
      connected: [
        {
          deviceId: "legacy-device",
          role: "gps",
          sourceTypes: ["gps"],
          controllable: false,
        },
      ],
      controllableTrainer: {
        deviceId: "legacy-trainer",
        sourceTypes: ["trainer_power"],
        supportsAutoControl: true,
        supportsManualControl: true,
      },
      selectedSources: [
        {
          metricFamily: "heart_rate",
          sourceId: "legacy-source",
          sourceType: "chest_strap",
          provenance: "actual",
          selectionMethod: "automatic",
        },
      ],
    };

    const recovered = recoverTimerOnlyRecording(legacyDraft);

    expect(recovered.rejectedReason).toBeNull();
    expect(recovered.state.reducer.snapshot?.devices).toEqual({
      connected: [],
      controllableTrainer: null,
      selectedSources: [],
    });
  });
});
