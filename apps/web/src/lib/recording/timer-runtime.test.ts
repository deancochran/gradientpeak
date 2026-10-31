import { activityPlanStructureSchema } from "@repo/core";
import { describe, expect, it } from "vitest";
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
} from "./timer-runtime";

const planStructure = {
  version: 5,
  activity_category: "run",
  items: [
    {
      type: "step",
      id: "30000000-0000-4000-8000-000000000001",
      name: "Timed",
      duration: { type: "time", seconds: 10 },
      targets: [{ type: "RPE", intensity: 4 }],
    },
    {
      type: "step",
      id: "30000000-0000-4000-8000-000000000002",
      name: "Distance",
      duration: { type: "distance", meters: 100 },
      targets: [{ type: "RPE", intensity: 5 }],
    },
    {
      type: "step",
      id: "30000000-0000-4000-8000-000000000003",
      name: "Reps",
      duration: { type: "repetitions", count: 5 },
      targets: [{ type: "RPE", intensity: 6 }],
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
  it("counts stationary rest on the running session clock and excludes explicit pauses", () => {
    const plan = configurePlan().state.configuration?.plan;
    if (!plan) throw new Error("Expected fixture plan");
    const configured = configureTimerOnlyRecording(createInitialTimerOnlyRecordingState(), {
      activity_category: "run",
      activityPlanId: plan.activityPlanId,
      ...(plan.scheduledEventId ? { eventId: plan.scheduledEventId } : {}),
      plan: {
        ...plan,
        structure: {
          ...planStructure,
          items: [
            { ...planStructure.items[0], targets: [{ type: "rest" }] },
            planStructure.items[1],
          ],
        },
      },
    });
    expect(configured.rejectedReason).toBeNull();
    // No distance, GPS, speed, or cadence observations are supplied.
    let state = startTimerOnlyRecording(configured.state, 0, "stationary-rest").state;
    state = pauseTimerOnlyRecording(state, 4000).state;
    state = advanceTimerOnlyRecording(state, 30000).state;
    expect(getTimerOnlyPlanStatus(state, 30000)?.completedCount).toBe(0);
    state = resumeTimerOnlyRecording(state, 30000).state;
    state = advanceTimerOnlyRecording(state, 35999).state;
    expect(getTimerOnlyPlanStatus(state, 35999)?.completedCount).toBe(0);
    state = advanceTimerOnlyRecording(state, 36000).state;
    expect(getTimerOnlyPlanStatus(state, 36000)).toMatchObject({
      completedCount: 1,
      currentOccurrenceIndex: 1,
    });
  });
  it("adopts a chosen plan's category before start but never relabels an active session", () => {
    const plan = configurePlan().state.configuration?.plan;
    if (!plan) throw new Error("Expected fixture plan");
    const ready = configureTimerOnlyRecording(createInitialTimerOnlyRecordingState(), {
      activity_category: "bike",
    }).state;
    const selected = changeTimerOnlyPlan(ready, 1000, { ...plan, scheduledEventId: null });
    expect(selected.rejectedReason).toBeNull();
    expect(selected.state.configuration?.activity_category).toBe("run");
    const active = startTimerOnlyRecording(ready, 1000, "category-locked").state;
    expect(
      changeTimerOnlyPlan(active, 2000, { ...plan, scheduledEventId: null }).rejectedReason,
    ).toMatch(/category/);
    expect(active.reducer.snapshot?.activity.activity_category).toBe("bike");
  });
  it("supports bounded relative-power intensity before start and while paused without rewriting targets", () => {
    const base = configurePlan().state.configuration?.plan;
    if (!base) throw new Error("Expected fixture plan");
    const structure = {
      ...planStructure,
      activity_category: "bike",
      items: activityPlanStructureSchema.parse(planStructure).items.map((item) =>
        item.type === "step"
          ? {
              ...item,
              duration: { type: "time" as const, seconds: 10 },
              targets: [{ type: "%FTP" as const, intensity: 80 }],
            }
          : {
              ...item,
              steps: item.steps.map((step) => ({
                ...step,
                duration: { type: "time" as const, seconds: 10 },
                targets: [{ type: "%FTP" as const, intensity: 80 }],
              })),
            },
      ),
    };
    let state = configureTimerOnlyRecording(createInitialTimerOnlyRecordingState(), {
      activity_category: "bike",
      activityPlanId: base.activityPlanId,
      plan: { ...base, scheduledEventId: null, structure },
    }).state;
    state = adjustTimerOnlyIntensity(state, 1000, 0.75).state;
    state = startTimerOnlyRecording(state, 1000, "intensity-session").state;
    const snapshot = state.reducer.snapshot;
    expect(getTimerOnlyPlanStatus(state, 2000)?.targetLabels.join(" ")).toContain("60");
    state = pauseTimerOnlyRecording(state, 3000).state;
    const adjusted = adjustTimerOnlyIntensity(state, 4000, 1.25);
    expect(adjusted.rejectedReason).toBeNull();
    expect(adjusted.state.reducer.snapshot).toEqual(snapshot);
    expect(getTimerOnlyPlanStatus(adjusted.state, 5000)?.targetLabels.join(" ")).toContain("100");
    expect(adjusted.state.guidance?.revisions.at(-1)?.activeMs).toBe(2000);
    expect(adjustTimerOnlyIntensity(adjusted.state, 5000, 2).state).toBe(adjusted.state);
    expect(
      changeTimerOnlyPlan(adjusted.state, 5000, { ...base, scheduledEventId: null }).rejectedReason,
    ).toMatch(/category/);
  });
  it("preserves the snapshot, timed visits, laps and offsets when detaching and replacing live guidance", () => {
    const started = startTimerOnlyRecording(configurePlan().state, 1000, "live-guidance").state;
    const lapped = captureTimerOnlyLap(started, 3000).state;
    const detached = changeTimerOnlyPlan(lapped, 6000, null);
    expect(detached.rejectedReason).toBeNull();
    expect(detached.state.reducer.snapshot).toEqual(started.reducer.snapshot);
    expect(getTimerOnlyPlanStatus(detached.state, 6000)?.currentOccurrence).toBeNull();
    const plan = configurePlan().state.configuration?.plan;
    if (!plan) throw new Error("Expected fixture plan");
    const attached = changeTimerOnlyPlan(detached.state, 9000, { ...plan, scheduledEventId: null });
    expect(attached.rejectedReason).toBeNull();
    expect(getTimerOnlyPlanStatus(attached.state, 11000)?.currentStepElapsedSeconds).toBe(2);
    expect(attached.state.planExecution?.laps).toHaveLength(1);
    expect(attached.state.guidance?.revisions.map((item) => item.activeMs)).toEqual([
      0, 5000, 8000,
    ]);
    const recovered = recoverTimerOnlyRecording(
      createTimerOnlyRecordingDraft(attached.state, 11000, "owner"),
    );
    expect(recovered.state.guidance).toEqual(attached.state.guidance);
    expect(recovered.state.reducer.lifecycle).toBe("paused");
    const changedRoute = changeTimerOnlyRoute(
      recovered.state,
      11000,
      "00000000-0000-4000-8000-000000000005",
    );
    expect(changedRoute.rejectedReason).toBeNull();
    const finished = finishTimerOnlyRecording(changedRoute.state, 12000).state;
    expect(changeTimerOnlyPlan(finished, 13000, null).rejectedReason).toBeTruthy();
  });
  it("rejects a truly zero-duration finish without consuming the live recording", () => {
    const state = startTimerOnlyRecording(configure().state, 1000, "zero-duration").state;
    const rejected = finishTimerOnlyRecording(state, 1000);
    expect(rejected.rejectedReason).toBe("Record some time before finishing this activity.");
    expect(rejected.state).toBe(state);
    expect(rejected.state.reducer.lifecycle).toBe("recording");
    const retried = finishTimerOnlyRecording(rejected.state, 2000);
    expect(retried.rejectedReason).toBeNull();
    expect(retried.state.reducer.lifecycle).toBe("finished");
  });
  it("journals multiple late automatic boundaries separately before after-plan continuation", () => {
    const initial = configurePlan().state;
    const configuration = initial.configuration;
    if (!configuration?.plan) throw new Error("Expected configured plan");
    const structure = activityPlanStructureSchema.parse({
      ...planStructure,
      items: activityPlanStructureSchema.parse(planStructure).items.map((item) =>
        item.type === "step"
          ? { ...item, duration: { type: "time" as const, seconds: 10 } }
          : {
              ...item,
              steps: item.steps.map((step) => ({
                ...step,
                duration: { type: "time" as const, seconds: 10 },
              })),
            },
      ),
    });
    const configured = configureTimerOnlyRecording(initial, {
      ...configuration,
      plan: { ...configuration.plan, structure },
    });
    const state = finishTimerOnlyRecording(
      startTimerOnlyRecording(configured.state, 0, "late-all-timed").state,
      35000,
    ).state;
    expect(
      state.planExecution?.transitions.map((transition) => [
        transition.elapsedMs,
        transition.movingMs,
      ]),
    ).toEqual([
      [10000, 10000],
      [20000, 20000],
      [30000, 30000],
    ]);
    expect(state.planExecution?.currentOccurrenceIndex).toBeNull();
    expect(getTimerOnlyRecordingTimes(state, 35000)).toMatchObject({
      elapsedSeconds: 35,
      activeSeconds: 35,
    });
  });
  it("timestamps a late automatic boundary at the actual active-time threshold after a pause", () => {
    let state = startTimerOnlyRecording(configurePlan().state, 0, "late-plan-session").state;
    state = pauseTimerOnlyRecording(state, 5000).state;
    state = resumeTimerOnlyRecording(state, 15000).state;
    state = finishTimerOnlyRecording(state, 25000).state;
    expect(state.planExecution?.transitions).toMatchObject([
      {
        type: "auto",
        timestamp: new Date(20000).toISOString(),
        elapsedMs: 20000,
        movingMs: 10000,
      },
    ]);
    expect(state.planExecution?.currentOccurrenceIndex).toBe(1);
    expect(state.planExecution?.completedOccurrenceIds).toHaveLength(1);
    expect(getTimerOnlyRecordingTimes(state, 25000)).toMatchObject({
      elapsedSeconds: 25,
      activeSeconds: 15,
    });
  });
  it("auto-advances timed steps from moving timestamps and freezes progression while paused", () => {
    let state = startTimerOnlyRecording(configurePlan().state, 0, "plan-session").state;
    state = pauseTimerOnlyRecording(state, 5000).state;
    expect(
      getTimerOnlyPlanStatus(advanceTimerOnlyRecording(state, 30000).state, 30000)
        ?.currentOccurrenceIndex,
    ).toBe(0);
    state = resumeTimerOnlyRecording(state, 30000).state;
    state = advanceTimerOnlyRecording(state, 35000).state;
    expect(getTimerOnlyPlanStatus(state, 35000)).toMatchObject({
      currentOccurrenceIndex: 1,
      completedCount: 1,
    });
  });
  it("never timer-completes distance or repetition steps and supports complete, previous, and skip", () => {
    let state = startTimerOnlyRecording(configurePlan().state, 0, "plan-session").state;
    state = advanceTimerOnlyRecording(state, 10000).state;
    expect(
      getTimerOnlyPlanStatus(advanceTimerOnlyRecording(state, 500000).state, 500000)
        ?.currentOccurrenceIndex,
    ).toBe(1);
    state = completeCurrentPlanStep(state, 500000).state;
    expect(getTimerOnlyPlanStatus(state, 500000)?.currentOccurrenceIndex).toBe(2);
    state = previousPlanStep(state, 501000).state;
    expect(getTimerOnlyPlanStatus(state, 501000)?.currentOccurrenceIndex).toBe(1);
    state = skipCurrentPlanStep(state, 502000).state;
    expect(getTimerOnlyPlanStatus(state, 502000)).toMatchObject({
      currentOccurrenceIndex: 2,
      skippedCount: 1,
    });
    expect(
      getTimerOnlyPlanStatus(advanceTimerOnlyRecording(state, 900000).state, 900000)
        ?.currentOccurrenceIndex,
    ).toBe(2);
  });
  it("captures monotonic lap evidence with current step identity and retains it at finish", () => {
    let state = startTimerOnlyRecording(configurePlan().state, 1000, "plan-session").state;
    state = captureTimerOnlyLap(state, 4000).state;
    state = captureTimerOnlyLap(state, 8000).state;
    state = finishTimerOnlyRecording(state, 9000).state;
    expect(state.planExecution?.laps).toMatchObject([
      { lapNumber: 1, elapsedMs: 3000, movingMs: 3000, occurrenceIndex: 0 },
      { lapNumber: 2, elapsedMs: 7000, movingMs: 7000, occurrenceIndex: 0 },
    ]);
    expect(state.reducer.lifecycle).toBe("finished");
  });
  it("locks plan structure and authored target presentation at start", () => {
    const started = startTimerOnlyRecording(configurePlan().state, 1000, "plan-session").state;
    expect(started.reducer.snapshot?.planExecution).toMatchObject({
      manifestVersion: 2,
      compilerVersion: 3,
      name: "Indoor intervals",
      personalizationEnabled: false,
      targetPresentations: expect.arrayContaining([expect.objectContaining({ labels: ["4 RPE"] })]),
    });
  });
  it("keeps a missing-fact threshold target authored in the locked snapshot", () => {
    const missingFactStructure = activityPlanStructureSchema.parse({
      ...planStructure,
      items: activityPlanStructureSchema.parse(planStructure).items.map((item, itemIndex) =>
        item.type === "step"
          ? itemIndex === 0
            ? { ...item, targets: [{ type: "%ThresholdHR" as const, intensity: 80 }] }
            : item
          : {
              ...item,
              steps: item.steps.map((step, stepIndex) =>
                itemIndex === 0 && stepIndex === 0
                  ? { ...step, targets: [{ type: "%ThresholdHR" as const, intensity: 80 }] }
                  : step,
              ),
            },
      ),
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
    const started = startTimerOnlyRecording(configured.state, 1000, "authored-threshold").state;
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
    const started = startTimerOnlyRecording(configured, 1000, "unscheduled-plan").state;
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
    const started = startTimerOnlyRecording(configure().state, 5000, "web-session-1");
    expect(started.state.reducer.snapshot?.identity.startedAt).toBe(new Date(5000).toISOString());
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
    state = startTimerOnlyRecording(state, 2000, "web-session-1").state;
    expect(getTimerOnlyRecordingTimes(state, 7900)).toEqual({
      elapsedSeconds: 5,
      activeSeconds: 5,
      movingSeconds: 5,
    });
    state = pauseTimerOnlyRecording(state, 8000).state;
    expect(getTimerOnlyRecordingTimes(state, 12000)).toEqual({
      elapsedSeconds: 10,
      activeSeconds: 6,
      movingSeconds: 6,
    });
    state = resumeTimerOnlyRecording(state, 12000).state;
    state = finishTimerOnlyRecording(state, 15500).state;
    expect(state.reducer.lifecycle).toBe("finished");
    expect(getTimerOnlyRecordingTimes(state, 99000)).toEqual({
      elapsedSeconds: 13,
      activeSeconds: 9,
      movingSeconds: 9,
    });
  });
  it("rejects invalid transitions without changing state", () => {
    const initial = createInitialTimerOnlyRecordingState();
    const start = startTimerOnlyRecording(initial, 1000, "web-session-1");
    expect(start.rejectedReason).toContain("Configure");
    expect(start.state).toBe(initial);
    const ready = configure().state;
    const resume = resumeTimerOnlyRecording(ready, 2000);
    expect(resume.rejectedReason).toContain("pending");
    expect(resume.state).toBe(ready);
    const finish = finishTimerOnlyRecording(ready, 3000);
    expect(finish.rejectedReason).toContain("pending");
    expect(finish.state).toBe(ready);
  });
  it("resets a completed runtime to an empty pending session", () => {
    let state = configure().state;
    state = startTimerOnlyRecording(state, 2000, "web-session-1").state;
    state = finishTimerOnlyRecording(state, 3000).state;
    const reset = resetTimerOnlyRecording();
    expect(reset.state.reducer.lifecycle).toBe("pending");
    expect(reset.state.reducer.snapshot).toBeNull();
    expect(getTimerOnlyRecordingTimes(reset.state, 10000)).toEqual({
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
    state = startTimerOnlyRecording(state, 2000, "web-session-1").state;
    state = finishTimerOnlyRecording(state, 5000).state;
    const snapshot = state.reducer.snapshot;
    if (!snapshot) throw new Error("Expected locked snapshot");
    const restored = restoreFinishedTimerOnlyRecording({
      snapshot,
      startedAt: new Date(2000).toISOString(),
      finishedAt: new Date(5000).toISOString(),
      elapsedMs: 3000,
      movingMs: 3000,
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
    expect(getTimerOnlyRecordingTimes(restored, 99000)).toEqual({
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
    const started = startTimerOnlyRecording(configured.state, 2000, "web-session-1");
    expect(started.state.reducer.snapshot?.activity.gpsMode).toBe("off");
    expect(started.state.reducer.snapshot?.activity.routeId).toBe(
      "00000000-0000-4000-8000-000000000002",
    );
  });
  it("clears legacy device metadata while recovering an indoor draft", () => {
    const started = startTimerOnlyRecording(configure().state, 2000, "web-session-1").state;
    const draft = createTimerOnlyRecordingDraft(started, 7000, "profile-1");
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
