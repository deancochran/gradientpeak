import { createHash } from "node:crypto";
import { recordingSummarySubmissionInputSchema } from "@repo/api/recording-submission";
import { recordingPlannedSessionLaunchSchema } from "@repo/core";
import {
  activityPlanSemanticHash,
  activityPlanStructureSchema,
  compileActivityPlan,
  getCanonicalActivityPlanStructureHashInput,
} from "@repo/core/activity-plan";
import { recordingGuidanceFromTcx } from "@repo/core/recording/guidance";
import {
  closeMeasuredWindow,
  emptyMeasuredJournal,
  openMeasuredWindow,
} from "@repo/core/recording/measured-journal";
import { describe, expect, it, vi } from "vitest";
import {
  buildUploadedRecordingSummaryInput,
  finalizeTimerRecordingArtifact,
  sessionRpeOperationIdForReview,
} from "./finalized-artifact";
import {
  captureTimerOnlyLap,
  changeTimerOnlyPlan,
  completeCurrentPlanStep,
  configureTimerOnlyRecording,
  createInitialTimerOnlyRecordingState,
  createTimerOnlyRecordingDraft,
  finishTimerOnlyRecording,
  pauseTimerOnlyRecording,
  previousPlanStep,
  recoverTimerOnlyRecording,
  resumeTimerOnlyRecording,
  skipCurrentPlanStep,
  startTimerOnlyRecording,
} from "./timer-runtime";

const START = Date.parse("2026-07-20T10:00:00.000Z");
const PROFILE_ID = "11111111-1111-4111-8111-111111111111";
const PLAN_ID = "22222222-2222-4222-8222-222222222222";
const SEGMENT_ID = "44444444-4444-4444-8444-444444444444";
const INGESTION_ID = "55555555-5555-4555-8555-555555555555";
function manifestPlan(timed = false) {
  const structure = activityPlanStructureSchema.parse({
    version: 5,
    activity_category: "run",
    items: [1, 2].map((index) => ({
      type: "step",
      id: `30000000-0000-4000-8000-00000000000${index}`,
      name: `Step ${index}`,
      duration: timed && index === 1 ? { type: "time", seconds: 10 } : { type: "untilFinished" },
      targets: [{ type: "RPE", intensity: 4 }],
    })),
  });
  return {
    activityPlanId: PLAN_ID,
    scheduledEventId: null,
    name: "Frozen plan",
    description: null,
    activityPlanRevision: 7,
    structureHash: `v1:sha256:${createHash("sha256").update(getCanonicalActivityPlanStructureHashInput(structure)).digest("hex")}`,
    structure,
  };
}
async function artifactForState(
  state: Parameters<typeof finalizeTimerRecordingArtifact>[0]["state"],
) {
  return finalizeTimerRecordingArtifact({
    state,
    ownerId: PROFILE_ID,
    segmentId: SEGMENT_ID,
    review: {
      name: "Recorded plan",
      notes: null,
      perceivedEffort: null,
      distanceMeters: 0,
      calories: null,
    },
    digest: async () => "a".repeat(64),
  });
}
function startManifestPlan(timed = false) {
  const configured = configureTimerOnlyRecording(createInitialTimerOnlyRecordingState(), {
    activity_category: "run",
    activityPlanId: PLAN_ID,
    plan: manifestPlan(timed),
  });
  expect(configured.rejectedReason).toBeNull();
  return startTimerOnlyRecording(configured.state, START, "manifest-session").state;
}
describe("complete recording evidence", () => {
  it.each([
    false,
    true,
  ])("retains every guidance epoch and conserves finished time (free start: %s)", async (free) => {
    let state = free
      ? startTimerOnlyRecording(
          configureTimerOnlyRecording(createInitialTimerOnlyRecordingState(), {
            activity_category: "run",
          }).state,
          START,
          "manifest-session",
        ).state
      : startManifestPlan(true);
    const snapshot = state.reducer.snapshot;
    state = changeTimerOnlyPlan(state, START + 5000, null).state;
    const attached = changeTimerOnlyPlan(state, START + 8000, {
      ...manifestPlan(true),
      activityPlanId: "22222222-2222-4222-8222-222222222223",
    });
    expect(attached.rejectedReason).toBeNull();
    state = attached.state;
    const draft = createTimerOnlyRecordingDraft(state, START + 10000, PROFILE_ID);
    const recovered = recoverTimerOnlyRecording(draft);
    expect(recovered.rejectedReason).toBeNull();
    state = resumeTimerOnlyRecording(recovered.state, START + 10000).state;
    const artifact = await artifactForState(finishTimerOnlyRecording(state, START + 20000).state);
    expect(artifact.snapshot).toEqual(snapshot);
    expect(recordingGuidanceFromTcx(artifact.fileText)).toEqual(artifact.guidance);
    const input = recordingSummarySubmissionInputSchema.parse(
      buildUploadedRecordingSummaryInput(artifact, { ingestionId: INGESTION_ID }),
    );
    expect(input.activityPlanId).toBe(free ? "22222222-2222-4222-8222-222222222223" : PLAN_ID);
    expect(
      input.executionManifest.occurrences.reduce((sum, visit) => sum + visit.activeSeconds, 0),
    ).toBe(20);
    expect(
      input.executionManifest.occurrences.map((visit) => [
        visit.timingEvidence?.startOffsetMs,
        visit.timingEvidence?.endOffsetMs,
      ]),
    ).toEqual([
      [0, 5000],
      [5000, 8000],
      [8000, 18000],
      [18000, 20000],
    ]);
    expect(input.guidance?.revisions).toHaveLength(3);
    expect(input.executionManifest.occurrences[0]?.completion).toEqual(
      free ? { status: "completed", method: "manual" } : undefined,
    );
  });
  it.each([
    null,
    false,
    { ...emptyMeasuredJournal(), provenance: "synthetic" },
  ])("rejects invalid/synthetic evidence before hashing or creating an export: %j", async (measuredJournal) => {
    const state = finishTimerOnlyRecording(startManifestPlan(), START + 5000).state;
    const digest = vi.fn(async () => "a".repeat(64));
    await expect(
      finalizeTimerRecordingArtifact({
        state,
        ownerId: PROFILE_ID,
        segmentId: SEGMENT_ID,
        digest,
        review: {
          name: "Measured",
          notes: null,
          perceivedEffort: null,
          distanceMeters: 0,
          calories: null,
        },
        measuredJournal,
      }),
    ).rejects.toMatchObject({ name: "ZodError" });
    expect(digest).not.toHaveBeenCalled();
  });
  it("refuses open or out-of-session capture windows at the final artifact boundary", async () => {
    const state = finishTimerOnlyRecording(startManifestPlan(), START + 5000).state;
    const journal = openMeasuredWindow(emptyMeasuredJournal(), new Date(START).toISOString());
    for (const measuredJournal of [
      journal,
      closeMeasuredWindow(journal, new Date(START + 10000).toISOString()),
    ]) {
      await expect(
        finalizeTimerRecordingArtifact({
          state,
          ownerId: PROFILE_ID,
          segmentId: SEGMENT_ID,
          measuredJournal,
          review: {
            name: "Measured",
            notes: null,
            perceivedEffort: null,
            distanceMeters: 0,
            calories: null,
          },
        }),
      ).rejects.toThrow("outside the finalized recording boundary");
    }
  });
  it.each([
    0, 1, 2,
  ])("retains an instantaneous skip of segment %s in the artifact and API DTO without inventing time", async (skippedIndex) => {
    const base = manifestPlan();
    const structure = activityPlanStructureSchema.parse({
      version: 5,
      activity_category: "run",
      items: [0, 1, 2].map((index) => ({
        type: "step",
        id: `30000000-0000-4000-8000-00000000000${index}`,
        name: "Step",
        duration: { type: "untilFinished" },
        targets: [{ type: "RPE", intensity: 4 }],
      })),
    });
    const plan = {
      ...base,
      structure,
      structureHash: `v1:sha256:${createHash("sha256").update(getCanonicalActivityPlanStructureHashInput(structure)).digest("hex")}`,
    };
    const configured = configureTimerOnlyRecording(createInitialTimerOnlyRecordingState(), {
      activity_category: "run",
      activityPlanId: PLAN_ID,
      plan,
    });
    expect(configured.rejectedReason).toBeNull();
    let state = startTimerOnlyRecording(
      configured.state,
      START,
      "instantaneous-segment-skip",
    ).state;
    let elapsedMs = 0;
    for (let index = 0; index < 3; index++) {
      if (index === skippedIndex) state = skipCurrentPlanStep(state, START + elapsedMs).state;
      else {
        elapsedMs += 10000;
        state = completeCurrentPlanStep(state, START + elapsedMs).state;
      }
    }
    const artifact = await artifactForState(
      finishTimerOnlyRecording(state, START + elapsedMs).state,
    );
    const input = recordingSummarySubmissionInputSchema.parse(
      buildUploadedRecordingSummaryInput(artifact, { ingestionId: INGESTION_ID }),
    );
    const skipped = input.executionManifest.occurrences[skippedIndex];
    expect(skipped).toMatchObject({
      occurrenceId: compileActivityPlan(structure).occurrences[skippedIndex]?.occurrenceId,
      activeSeconds: 0,
      completion: { status: "skipped", method: "manual" },
      timingEvidence: { startOffsetMs: skippedIndex * 10000, endOffsetMs: skippedIndex * 10000 },
    });
    expect(input.executionManifest.occurrences).toHaveLength(3);
    expect(input.sessionTiming).toMatchObject({ elapsedMs: 20000, activeMs: 20000 });
    expect(
      input.executionManifest.occurrences.reduce((sum, entry) => sum + entry.activeSeconds, 0),
    ).toBe(20);
    expect(artifact.fileText).toContain("&quot;type&quot;:&quot;skip&quot;");
    expect(artifact.fileText).toContain(skipped?.occurrenceId);
  });
  const commands = {
    complete: completeCurrentPlanStep,
    skip: skipCurrentPlanStep,
    previous: previousPlanStep,
    pause: pauseTimerOnlyRecording,
    resume: resumeTimerOnlyRecording,
  };
  it.each([
    {
      name: "partial first occurrence",
      actions: [],
      finish: 5,
      active: [5],
      statuses: [undefined],
    },
    {
      name: "partial final occurrence",
      actions: [["complete", 10]],
      finish: 25,
      active: [10, 15],
      statuses: ["completed", undefined],
    },
    {
      name: "skip then partial",
      actions: [["skip", 10]],
      finish: 25,
      active: [10, 15],
      statuses: ["skipped", undefined],
    },
    {
      name: "rewind and revisit",
      actions: [
        ["complete", 10],
        ["previous", 20],
        ["complete", 30],
      ],
      finish: 40,
      active: [10, 10, 10, 10],
      statuses: [undefined, undefined, "completed", undefined],
    },
    {
      name: "after-plan continuation",
      actions: [
        ["complete", 10],
        ["complete", 20],
      ],
      finish: 35,
      active: [10, 10, 15],
      statuses: ["completed", "completed", undefined],
    },
    {
      name: "rewind from continuation",
      actions: [
        ["complete", 10],
        ["complete", 20],
        ["previous", 25],
      ],
      finish: 30,
      active: [10, 10, 5, 5],
      statuses: ["completed", undefined, undefined, undefined],
    },
    {
      name: "pause in partial occurrence",
      actions: [
        ["complete", 10],
        ["pause", 15],
        ["resume", 25],
      ],
      finish: 40,
      active: [10, 20],
      statuses: ["completed", undefined],
    },
    {
      name: "finish while paused",
      actions: [
        ["complete", 10],
        ["pause", 15],
      ],
      finish: 25,
      active: [10, 5],
      statuses: ["completed", undefined],
    },
    {
      name: "late timed completion",
      actions: [],
      finish: 25,
      active: [10, 15],
      statuses: ["completed", undefined],
      timed: true,
    },
  ] as const)("conserves elapsed and active time for $name without inventing completion", async (scenario) => {
    let state = startManifestPlan("timed" in scenario);
    for (const [command, seconds] of scenario.actions) {
      const result = commands[command](state, START + seconds * 1000);
      expect(result.rejectedReason).toBeNull();
      state = result.state;
    }
    const artifact = await artifactForState(
      finishTimerOnlyRecording(state, START + scenario.finish * 1000).state,
    );
    const input = recordingSummarySubmissionInputSchema.parse(
      buildUploadedRecordingSummaryInput(artifact, { ingestionId: INGESTION_ID }),
    );
    const entries = input.executionManifest.occurrences;
    expect(entries.map((entry) => entry.activeSeconds)).toEqual(scenario.active);
    expect(entries.map((entry) => entry.completion?.status)).toEqual(scenario.statuses);
    expect(entries.reduce((sum, entry) => sum + entry.activeSeconds * 1000, 0)).toBe(
      artifact.movingMs,
    );
    expect(
      entries.reduce(
        (sum, entry) =>
          sum +
          (entry.timingEvidence?.endOffsetMs ?? 0) -
          (entry.timingEvidence?.startOffsetMs ?? 0),
        0,
      ),
    ).toBe(artifact.elapsedMs);
    expect(entries[0]?.timingEvidence?.startOffsetMs).toBe(0);
    expect(entries.at(-1)?.timingEvidence?.endOffsetMs).toBe(artifact.elapsedMs);
    const compiled = compileActivityPlan(manifestPlan().structure).occurrences;
    for (const entry of entries) {
      if (entry.stepId !== null)
        expect(compiled.map((occurrence) => occurrence.occurrenceId)).toContain(entry.occurrenceId);
      else expect(entry.completion).toBeUndefined();
    }
  });
  it("retains bounded recovery time in the partial final occurrence", async () => {
    let state = completeCurrentPlanStep(startManifestPlan(), START + 10000).state;
    const draft = createTimerOnlyRecordingDraft(state, START + 15000, PROFILE_ID);
    state = recoverTimerOnlyRecording(draft).state;
    state = resumeTimerOnlyRecording(state, START + 50000).state;
    const artifact = await artifactForState(finishTimerOnlyRecording(state, START + 60000).state);
    const input = buildUploadedRecordingSummaryInput(artifact, { ingestionId: INGESTION_ID });
    expect(input.sessionTiming).toMatchObject({ elapsedMs: 25000, activeMs: 25000 });
    expect(input.executionManifest.occurrences.map((entry) => entry.activeSeconds)).toEqual([
      10, 15,
    ]);
    expect(input.executionManifest.occurrences.at(-1)?.timingEvidence).toMatchObject({
      startOffsetMs: 10000,
      endOffsetMs: 25000,
    });
  });
  it("does not claim prescribed completion when a legacy artifact lacks its execution journal", async () => {
    const artifact = await artifactForState(
      finishTimerOnlyRecording(startManifestPlan(), START + 5000).state,
    );
    const input = buildUploadedRecordingSummaryInput(
      { ...artifact, planExecution: undefined },
      { ingestionId: INGESTION_ID },
    );
    expect(input.executionManifest.occurrences).toMatchObject([
      { activeSeconds: 5, timingEvidence: { startOffsetMs: 0, endOffsetMs: 5000 } },
    ]);
    expect(input.executionManifest.occurrences[0]?.completion).toBeUndefined();
  });
  it("retains manual laps once across repeated visits to the same prescribed occurrence", async () => {
    let state = captureTimerOnlyLap(startManifestPlan(), START + 5000).state;
    state = completeCurrentPlanStep(state, START + 10000).state;
    state = previousPlanStep(state, START + 20000).state;
    state = captureTimerOnlyLap(state, START + 25000).state;
    state = completeCurrentPlanStep(state, START + 30000).state;
    const artifact = await artifactForState(finishTimerOnlyRecording(state, START + 40000).state);
    const input = buildUploadedRecordingSummaryInput(artifact, { ingestionId: INGESTION_ID });
    expect(
      input.executionManifest.occurrences.flatMap((entry) =>
        entry.laps.map((lap) => lap.lapNumber),
      ),
    ).toEqual([1, 2]);
    expect(input.laps).toHaveLength(2);
  });
  it("submits the exact frozen planned-session provenance through the API DTO", async () => {
    const plan = manifestPlan(true);
    const plannedSession = recordingPlannedSessionLaunchSchema.parse({
      id: "66666666-6666-4666-8666-666666666666",
      sessionRevision: 4,
      source: { kind: "direct" as const, operationId: "scheduled_recording_operation_1234" },
      prescription: {
        capturedAt: "2026-07-19T10:00:00.000Z",
        resolutionManifest: {
          resolver_version: "prescription-resolver-v2",
          policy_version: "training-plan-policy-v2",
          training_plan_id: null,
          training_plan_revision: null,
          training_plan_hash: null,
          athlete_context_revision: null,
          activity_plan_id: PLAN_ID,
          activity_plan_revision: 7,
          activity_plan_semantic_hash: activityPlanSemanticHash({
            structure: plan.structure,
            trainingIntent: "aerobic_base",
          }),
          effective_target_duration_minutes: null,
          effective_target_common_load: null,
          evidence_facts: [],
          session_demand: {
            activity_category: "run",
            training_intent: "aerobic_base",
            target_duration_minutes: 30,
            target_common_load: null,
            importance: "normal",
          },
          fallback_level: "system_default_no_context",
          reason_codes: [],
          resolved_structure: plan.structure,
          resolved_structure_hash: plan.structureHash,
          prescription_estimate: {
            duration: { status: "unavailable", value_seconds: null },
            common_load: { status: "unavailable", value: null },
            rest_seconds: 0,
            has_open_completion: true,
            warnings: [],
            factors: [],
          },
          fingerprint: `v1:sha256:${"b".repeat(64)}`,
        },
      },
    });
    const configured = configureTimerOnlyRecording(createInitialTimerOnlyRecordingState(), {
      activity_category: "run",
      activityPlanId: PLAN_ID,
      plan: { ...plan, plannedSession },
    });
    expect(configured.rejectedReason).toBeNull();
    const started = startTimerOnlyRecording(configured.state, START, "scheduled-recording").state;
    const frozen = structuredClone(started.reducer.snapshot?.planExecution);
    // Query-owned launch objects can be replaced or edited after start. The
    // recording must retain the prescription and revision it actually started.
    plannedSession.sessionRevision += 1;
    if (plannedSession.source.kind === "direct")
      plannedSession.source.operationId = "changed_after_recording_launch_1234";
    const artifact = await artifactForState(finishTimerOnlyRecording(started, START + 25000).state);
    const input = recordingSummarySubmissionInputSchema.parse(
      buildUploadedRecordingSummaryInput(artifact, { ingestionId: INGESTION_ID }),
    );
    expect(input.planExecution).toEqual(frozen);
    expect(input.planExecution?.plannedSession).toEqual(frozen?.plannedSession);
    expect(input.executionManifest.planHash).toBe(plan.structureHash.replace("v1:sha256:", ""));
    expect(
      recordingSummarySubmissionInputSchema.safeParse({ ...input, activityPlanId: SEGMENT_ID })
        .success,
    ).toBe(false);
  });
});
function finishedRecording() {
  let state = configureTimerOnlyRecording(createInitialTimerOnlyRecordingState(), {
    activity_category: "run",
    eventId: "11111111-1111-4111-8111-111111111111",
    activityPlanId: "22222222-2222-4222-8222-222222222222",
    routeId: "33333333-3333-4333-8333-333333333333",
  }).state;
  state = startTimerOnlyRecording(state, Date.parse("2026-07-20T10:00:00.000Z"), "session-1").state;
  state = pauseTimerOnlyRecording(state, Date.parse("2026-07-20T10:10:00.000Z")).state;
  state = resumeTimerOnlyRecording(state, Date.parse("2026-07-20T10:15:00.000Z")).state;
  return finishTimerOnlyRecording(state, Date.parse("2026-07-20T10:30:00.000Z")).state;
}
describe("web recording finalization", () => {
  it("creates a portable artifact from the locked snapshot and timer evidence", async () => {
    const artifact = await finalizeTimerRecordingArtifact({
      state: finishedRecording(),
      ownerId: "profile-1",
      segmentId: "44444444-4444-4444-8444-444444444444",
      review: {
        name: "Morning run",
        notes: "Felt smooth",
        perceivedEffort: 5,
        distanceMeters: 0,
        calories: null,
      },
      digest: async () => "a".repeat(64),
    });
    expect(artifact).toMatchObject({
      recordingSessionId: "session-1",
      elapsedMs: 1800000,
      movingMs: 1500000,
      snapshot: {
        activity: {
          eventId: "11111111-1111-4111-8111-111111111111",
          activityPlanId: "22222222-2222-4222-8222-222222222222",
          routeId: "33333333-3333-4333-8333-333333333333",
        },
      },
    });
    expect(artifact.fileText).toContain('<Activity Sport="Running">');
    expect(artifact.fileText).toContain("<Trackpoint>");
    expect(artifact.fileText).not.toContain("<Position>");
    expect(artifact.fileText).not.toContain("<DistanceMeters>");
  });
  it("builds an idempotent server summary using the recording session identity", async () => {
    const artifact = await finalizeTimerRecordingArtifact({
      state: finishedRecording(),
      ownerId: "profile-1",
      segmentId: "44444444-4444-4444-8444-444444444444",
      review: {
        name: "Morning run",
        notes: null,
        perceivedEffort: null,
        distanceMeters: 1500,
        calories: 120,
        distanceEnteredManually: true,
        caloriesEnteredManually: true,
      },
      digest: async () => "b".repeat(64),
    });
    expect(
      buildUploadedRecordingSummaryInput(artifact, {
        ingestionId: "55555555-5555-4555-8555-555555555555",
      }),
    ).toMatchObject({
      profileId: "profile-1",
      recordingSessionId: "session-1",
      activityPlanId: "22222222-2222-4222-8222-222222222222",
      summary: { distanceMeters: 1500, calories: 120 },
      executionManifest: {
        occurrences: [
          {
            stepId: null,
            repeatIteration: 0,
            activeSeconds: 1500,
            movingSeconds: 0,
            distanceMeters: 1500,
            timingEvidence: { source: "manual_timer", coverage: "partial" },
          },
        ],
      },
      sessionTiming: {
        source: "manual_timer",
        coverage: "partial",
        elapsedMs: 1800000,
        activeMs: 1500000,
      },
      uploadedArtifact: { ingestionId: "55555555-5555-4555-8555-555555555555" },
    });
    expect(artifact.fileText).toContain("<DistanceMeters>1500</DistanceMeters>");
    expect(artifact.fileText).not.toContain("<Position>");
  });
  it("encodes each manual lap in TCX and the structured persistence payload", async () => {
    let state = configureTimerOnlyRecording(createInitialTimerOnlyRecordingState(), {
      activity_category: "run",
    }).state;
    state = startTimerOnlyRecording(
      state,
      Date.parse("2026-07-20T10:00:00.000Z"),
      "lap-session",
    ).state;
    state = captureTimerOnlyLap(state, Date.parse("2026-07-20T10:10:00.000Z")).state;
    state = captureTimerOnlyLap(state, Date.parse("2026-07-20T10:20:00.000Z")).state;
    state = finishTimerOnlyRecording(state, Date.parse("2026-07-20T10:30:00.000Z")).state;
    const artifact = await finalizeTimerRecordingArtifact({
      state,
      ownerId: "profile-1",
      segmentId: "44444444-4444-4444-8444-444444444444",
      review: {
        name: "Lapped run",
        notes: null,
        perceivedEffort: null,
        distanceMeters: 0,
        calories: null,
      },
      digest: async () => "e".repeat(64),
    });
    const input = buildUploadedRecordingSummaryInput(artifact, {
      ingestionId: "55555555-5555-4555-8555-555555555555",
    });
    expect(artifact.fileText.match(/<Lap /g)).toHaveLength(3);
    expect(artifact.fileText.match(/<TriggerMethod>Manual<\/TriggerMethod>/g)).toHaveLength(2);
    expect(artifact.fileText).not.toContain("<Position>");
    expect(input.laps).toMatchObject([
      { lapNumber: 1, durationSeconds: 600, totalTimerTime: 600, timingSource: "manual_timer" },
      { lapNumber: 2, durationSeconds: 600, totalTimerTime: 600, timingSource: "manual_timer" },
    ]);
  });
  it("retains skipped and completed step distinctions in the execution manifest", async () => {
    const structure = {
      version: 5,
      activity_category: "run",
      items: [
        {
          type: "step",
          id: "30000000-0000-4000-8000-000000000001",
          name: "First",
          duration: { type: "distance", meters: 100 },
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
    } as const;
    let state = configureTimerOnlyRecording(createInitialTimerOnlyRecordingState(), {
      activity_category: "run",
      activityPlanId: "00000000-0000-4000-8000-000000000003",
      plan: {
        activityPlanId: "00000000-0000-4000-8000-000000000003",
        scheduledEventId: null,
        name: "Manifest plan",
        description: null,
        activityPlanRevision: 1,
        structureHash: `v1:sha256:${"f".repeat(64)}`,
        structure,
      },
    }).state;
    state = startTimerOnlyRecording(
      state,
      Date.parse("2026-07-20T10:00:00.000Z"),
      "manifest-session",
    ).state;
    state = completeCurrentPlanStep(state, Date.parse("2026-07-20T10:05:00.000Z")).state;
    state = skipCurrentPlanStep(state, Date.parse("2026-07-20T10:06:00.000Z")).state;
    state = finishTimerOnlyRecording(state, Date.parse("2026-07-20T10:07:00.000Z")).state;
    const artifact = await finalizeTimerRecordingArtifact({
      state,
      ownerId: "profile-1",
      segmentId: "44444444-4444-4444-8444-444444444444",
      review: {
        name: "Manifest run",
        notes: null,
        perceivedEffort: null,
        distanceMeters: 0,
        calories: null,
      },
      digest: async () => "f".repeat(64),
    });
    const input = buildUploadedRecordingSummaryInput(artifact, {
      ingestionId: "55555555-5555-4555-8555-555555555555",
    });
    expect(input.executionManifest.occurrences.map((item) => item.completion)).toEqual([
      { status: "completed", method: "manual" },
      { status: "skipped", method: "manual" },
      undefined,
    ]);
    expect(input.executionManifest.occurrences.at(-1)).toMatchObject({
      occurrenceId: "manifest-session:continuation",
      activeSeconds: 60,
      timingEvidence: { startOffsetMs: 360000, endOffsetMs: 420000 },
    });
    expect(artifact.fileText).toContain("&quot;type&quot;:&quot;skip&quot;");
  });
  it("keeps artifacts completed after recovery indoors-only", async () => {
    let active = configureTimerOnlyRecording(createInitialTimerOnlyRecordingState(), {
      activity_category: "run",
      routeId: "33333333-3333-4333-8333-333333333333",
    }).state;
    active = startTimerOnlyRecording(
      active,
      Date.parse("2026-07-20T10:00:00.000Z"),
      "session-2",
    ).state;
    const draft = createTimerOnlyRecordingDraft(
      active,
      Date.parse("2026-07-20T10:10:00.000Z"),
      "profile-1",
    );
    if (!draft) throw new Error("Expected active draft");
    const recovered = recoverTimerOnlyRecording(draft);
    const finished = finishTimerOnlyRecording(
      resumeTimerOnlyRecording(recovered.state, Date.parse("2026-07-20T10:15:00.000Z")).state,
      Date.parse("2026-07-20T10:30:00.000Z"),
    ).state;
    const artifact = await finalizeTimerRecordingArtifact({
      state: finished,
      ownerId: "profile-1",
      segmentId: "44444444-4444-4444-8444-444444444444",
      review: {
        name: "Recovered run",
        notes: null,
        perceivedEffort: null,
        distanceMeters: 0,
        calories: null,
      },
      digest: async () => "d".repeat(64),
    });
    expect(artifact.snapshot.activity).toMatchObject({
      gpsMode: "off",
      routeId: "33333333-3333-4333-8333-333333333333",
    });
    expect(artifact.snapshot.capabilities.canTrackLocation).toBe(false);
  });
  it("keeps RPE out of activity notes and retains an operation ID only for unchanged RPE", async () => {
    const artifact = await finalizeTimerRecordingArtifact({
      state: finishedRecording(),
      ownerId: "profile-1",
      segmentId: "44444444-4444-4444-8444-444444444444",
      review: {
        name: "Morning run",
        notes: "User note",
        perceivedEffort: 5,
        distanceMeters: 0,
        calories: null,
      },
      sessionRpeOperationId: "66666666-6666-4666-8666-666666666666",
      digest: async () => "c".repeat(64),
    });
    expect(
      buildUploadedRecordingSummaryInput(artifact, {
        ingestionId: "55555555-5555-4555-8555-555555555555",
      }).notes,
    ).toBe("User note");
    expect(
      sessionRpeOperationIdForReview({
        previous: artifact,
        perceivedEffort: 5,
        createOperationId: () => "77777777-7777-4777-8777-777777777777",
      }),
    ).toBe(artifact.sessionRpeOperationId);
    expect(
      sessionRpeOperationIdForReview({
        previous: artifact,
        perceivedEffort: 6,
        createOperationId: () => "77777777-7777-4777-8777-777777777777",
      }),
    ).toBe("77777777-7777-4777-8777-777777777777");
    expect(
      sessionRpeOperationIdForReview({
        previous: artifact,
        perceivedEffort: null,
        createOperationId: () => "unused",
      }),
    ).toBeNull();
  });
});
