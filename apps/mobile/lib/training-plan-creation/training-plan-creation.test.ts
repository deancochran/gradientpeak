import {
  canonicalTrainingPlanStructureSchema,
  createAthletePlanningContextFromSnapshot,
  deriveTrainingPlanCreationPreview,
  selectAthletePlanningContextFields,
  trainingPlanCreateInputSchema,
} from "@repo/core";
import { describe, expect, it } from "vitest";
import { scoreActivityPlanFit } from "./activity-plan-fit";
import { deriveActivityPlanPickerState } from "./activity-plan-picker";
import {
  createBackendPlanningRequestSnapshot,
  deriveBackendPlanningState,
  deriveScheduleInspectorBackendInsight,
  deriveTrainingPathChartFromActiveProjection,
  deriveTrainingPathProjectionStatus,
  getBackendPlanningClientStatus,
  getPlannedBackendPlanningOperations,
  mapBackendPlanningCreateCommitInput,
  mapBackendPlanningUpdateCommitInput,
  mapPlanningContextToPreviewCreationConfigInput,
  normalizeBackendPlanningPreview,
  selectActiveTrainingPlanProjection,
} from "./backend-planning-client";
import { createDefaultTrainingPlanBuilderState } from "./defaults";
import { createTrainingPlanBuilderFixtures } from "./fixtures";
import { deriveTrainingPlanLocalProjection } from "./local-projection";
import {
  createTrainingPlanBuilderStateFromExistingPlan,
  toTrainingPlanCreatePayload,
  toTrainingPlanStructure,
  toTrainingPlanUpdatePayload,
} from "./mappers";
import {
  selectActionableTrainingPlanBuilderModules,
  selectApplicableTrainingPlanBuilderModules,
  selectTrainingPlanBuilderStageSummaries,
} from "./modules";
import { createTrainingPlanPlanningContext } from "./planning-context";
import {
  createTrainingPlanProjectionFacade,
  createTrainingPlanSavePlanFacade,
} from "./planning-session";
import {
  addTrainingPlanPreferenceField,
  applyTrainingPlanConstraintPreset,
  applyTrainingPlanPreferenceFieldOverride,
  selectTrainingPlanPreferenceFields,
} from "./preferences-context";
import { trainingPlanBuilderReducer } from "./reducer";
import { selectTrainingPlanCreateSaveRoute, selectTrainingPlanUpdateSaveRoute } from "./save-route";
import { deriveTrainingPlanSchedulingPreview } from "./scheduling-preview";
import {
  trainingPlanBuilderProfileGoalDraftSchema,
  trainingPlanBuilderStateSchema,
  trainingPlanFinalCreatePayloadSchema,
  trainingPlanFinalUpdatePayloadSchema,
} from "./schemas";
import { selectBuilderSummary, selectSaveReadiness, selectSessionById } from "./selectors";
import { deriveTrainingPlanStructureProposal } from "./structure-proposal";
import { validateTrainingPlanBuilderState } from "./validation";
import { deriveBuilderPlanCreationViewModel } from "./view-model";

describe("training plan creation domain", () => {
  it("validates profile goal sheet drafts before committing them", () => {
    expect(trainingPlanBuilderProfileGoalDraftSchema.parse({ title: "  Build FTP  " })).toEqual({
      title: "Build FTP",
    });
    expect(trainingPlanBuilderProfileGoalDraftSchema.safeParse({ title: "   " }).success).toBe(
      false,
    );
  });

  it("initializes athlete planning context from relevant active profile data only", () => {
    const context = createAthletePlanningContextFromSnapshot({
      asOf: "2026-06-16T00:00:00.000Z",
      profile: {
        dob: "1998-06-01T00:00:00.000Z",
        gender: "male",
        preferred_units: "metric",
      },
      manualHeightCm: 178,
      profileMetrics: [
        {
          metric_type: "weight_kg",
          value: 74,
          unit: "kg",
          recorded_at: "2026-01-01T00:00:00.000Z",
          notes: "older",
        },
        {
          metric_type: "weight_kg",
          value: 72,
          unit: "kg",
          recorded_at: "2026-06-01T00:00:00.000Z",
        },
        {
          metric_type: "ftp",
          value: 265,
          unit: "W",
          recorded_at: "2026-05-01T00:00:00.000Z",
        },
        {
          metric_type: "lthr",
          value: 169,
          unit: "bpm",
          recorded_at: "2026-04-01T00:00:00.000Z",
        },
      ],
      activityEfforts: [
        {
          activity_category: "bike",
          effort_type: "power",
          duration_seconds: 1200,
          value: 285,
          unit: "W",
          recorded_at: "2026-05-10T00:00:00.000Z",
        },
      ],
      currentFitness: {
        ctl: 41.2,
        atl: 49.8,
        tsb: -8.6,
        recorded_at: "2026-06-15T00:00:00.000Z",
      },
    });

    expect(context.demographics.ageYears).toMatchObject({
      value: 28,
      source: "profile",
      unit: "years",
    });
    expect(context.demographics.gender).toBe("male");
    expect(context.body.heightCm).toMatchObject({
      value: 178,
      source: "manual_override",
      overridden: true,
    });
    expect(context.body.weightKg).toMatchObject({
      value: 72,
      source: "profile_metric",
      unit: "kg",
    });
    expect(context.body.bmi.value).toBe(22.7);
    expect(context.physiology.ftpWatts.value).toBe(265);
    expect(context.physiology.thresholdHeartRateBpm.value).toBe(169);
    expect(context.physiology.currentFitnessCtl).toMatchObject({
      value: 41.2,
      source: "training_status",
      unit: "CTL",
    });
    expect(context.physiology.currentFatigueAtl.value).toBe(49.8);
    expect(context.physiology.currentFormTsb.value).toBe(-8.6);
    expect(context.efforts).toHaveLength(1);
    expect(context.evidence).toMatchObject({ metricCount: 4, effortCount: 1, missingFields: [] });
    expect(JSON.stringify(context)).not.toContain("username");
    expect(JSON.stringify(context)).not.toContain("followers");
    expect(JSON.stringify(context)).not.toContain("bio");
  });

  it("allows sparse athlete context and reports missing planning evidence", () => {
    const context = createAthletePlanningContextFromSnapshot({
      profile: { dob: null, gender: null, preferred_units: null },
      profileMetrics: [],
      activityEfforts: [],
    });

    expect(context.demographics.ageYears.value).toBeNull();
    expect(context.body.bmi.value).toBeNull();
    expect(context.evidence.missingFields).toEqual(
      expect.arrayContaining(["dob", "height_cm", "weight_kg", "ftp", "lthr"]),
    );
  });

  it("mutates athlete context fields reactively inside builder state", () => {
    const fixtures = createTrainingPlanBuilderFixtures();
    const withHeight = trainingPlanBuilderReducer(fixtures.emptyState, {
      type: "athleteContext.fieldOverride",
      override: { key: "heightCm", value: 180, unit: "cm" },
    });
    const withWeight = trainingPlanBuilderReducer(withHeight, {
      type: "athleteContext.fieldOverride",
      override: { key: "weightKg", value: 81, unit: "kg" },
    });
    const withoutWeight = trainingPlanBuilderReducer(withWeight, {
      type: "athleteContext.fieldRemove",
      fieldKey: "weightKg",
    });
    const withFitnessOverride = trainingPlanBuilderReducer(withoutWeight, {
      type: "athleteContext.fieldOverride",
      override: { key: "currentFitnessCtl", value: 52, unit: "CTL" },
    });
    const withoutFitnessOverride = trainingPlanBuilderReducer(withFitnessOverride, {
      type: "athleteContext.fieldRemove",
      fieldKey: "currentFitnessCtl",
    });

    expect(withWeight.athleteContext.body.heightCm).toMatchObject({
      value: 180,
      source: "manual_override",
      overridden: true,
    });
    expect(withWeight.athleteContext.body.weightKg.value).toBe(81);
    expect(withWeight.athleteContext.body.bmi.value).toBe(25);
    expect(withoutWeight.athleteContext.body.weightKg.value).toBeNull();
    expect(withoutWeight.athleteContext.body.bmi.value).toBeNull();
    expect(withoutWeight.athleteContext.evidence.missingFields).toEqual(
      expect.arrayContaining(["weight_kg"]),
    );
    expect(withFitnessOverride.athleteContext.physiology.currentFitnessCtl).toMatchObject({
      value: 52,
      source: "manual_override",
      overridden: true,
    });
    expect(withoutFitnessOverride.athleteContext.physiology.currentFitnessCtl.value).toBeNull();
  });

  it("adds and removes activity effort evidence inside builder state", () => {
    const fixtures = createTrainingPlanBuilderFixtures();
    const withEffort = trainingPlanBuilderReducer(fixtures.emptyState, {
      type: "athleteContext.effortAdd",
      effort: {
        activityCategory: "bike",
        effortType: "power",
        durationSeconds: 1200,
        value: 285,
        unit: "W",
        recordedAt: "2026-05-10T00:00:00.000Z",
      },
    });
    const withoutEffort = trainingPlanBuilderReducer(withEffort, {
      type: "athleteContext.effortRemove",
      effortIndex: 0,
    });

    expect(withEffort.athleteContext.efforts).toEqual([
      {
        activityCategory: "bike",
        effortType: "power",
        durationSeconds: 1200,
        value: 285,
        unit: "W",
        recordedAt: "2026-05-10T00:00:00.000Z",
        source: "activity_effort",
      },
    ]);
    expect(withEffort.athleteContext.evidence.effortCount).toBe(1);
    expect(withoutEffort.athleteContext.efforts).toEqual([]);
    expect(withoutEffort.athleteContext.evidence.effortCount).toBe(0);
  });

  it("uses sparse descriptor-driven planning constraints", () => {
    const fixtures = createTrainingPlanBuilderFixtures();
    const emptyFields = selectTrainingPlanPreferenceFields(fixtures.emptyState.planPreferences);
    const withDuration = addTrainingPlanPreferenceField(
      fixtures.emptyState.planPreferences,
      "durationWeeks",
    );
    const withSessions = applyTrainingPlanPreferenceFieldOverride(
      withDuration,
      "weeklySessionCount",
      4.4,
    );
    const withoutDuration = applyTrainingPlanPreferenceFieldOverride(
      withSessions,
      "durationWeeks",
      null,
    );

    expect(emptyFields.find((field) => field.key === "durationWeeks")).toMatchObject({
      visible: false,
      canRemove: false,
      value: { value: null, source: "unknown" },
    });
    expect(withDuration.durationWeeks).toBe(4);
    expect(withSessions.weeklySessionCount).toBe(4);
    expect(withoutDuration.durationWeeks).toBeNull();
    expect(
      selectTrainingPlanPreferenceFields(withSessions).find(
        (field) => field.key === "weeklySessionCount",
      ),
    ).toMatchObject({
      visible: true,
      canRemove: true,
      value: { value: 4, source: "manual_override" },
    });
  });

  it("applies planning constraint presets without requiring custom fields", () => {
    expect(applyTrainingPlanConstraintPreset("derive")).toEqual({
      durationWeeks: null,
      weeklySessionCount: null,
      targetWeeklyHours: null,
      restDaysPerWeek: null,
    });
    expect(applyTrainingPlanConstraintPreset("balanced")).toMatchObject({
      durationWeeks: 6,
      weeklySessionCount: 4,
      targetWeeklyHours: null,
      restDaysPerWeek: null,
    });
  });

  it("derives local schedule preview dates and conflict checks without persisting calendar fields", () => {
    const state = {
      ...createDefaultTrainingPlanBuilderState(),
      anchorDate: "2026-06-01",
      details: {
        name: "Schedule preview plan",
        description: "",
        templateVisibility: "private" as const,
      },
      scheduling: {
        startDate: "2026-06-01",
        preferredWeekdays: [1, 3, 5],
        sessionDateOverrides: {},
      },
      structure: {
        sessions: [
          {
            localId: "session-1",
            offsetDays: 0,
            activityPlan: {
              id: "11111111-1111-4111-8111-111111111111",
              name: "Threshold ride",
              published: true,
              accessible: true,
              estimatedTss: 95,
              estimatedDurationSeconds: 3600,
            },
          },
          {
            localId: "session-2",
            offsetDays: 1,
            activityPlan: {
              id: "22222222-2222-4222-8222-222222222222",
              name: "Long run",
              published: true,
              accessible: true,
              estimatedTss: 100,
              estimatedDurationSeconds: 5400,
            },
          },
        ],
      },
    };

    const preview = deriveTrainingPlanSchedulingPreview(state);
    const payload = toTrainingPlanCreatePayload(state);

    expect(preview.sessions.map((session) => session.date)).toEqual(["2026-06-01", "2026-06-02"]);
    expect(preview.checks.map((check) => check.code)).toEqual(
      expect.arrayContaining(["non_preferred_day", "hard_session_spacing"]),
    );
    expect(payload.structure.builder_planning_snapshot?.scheduling.start_date).toBe("2026-06-01");
    expect(JSON.stringify(payload)).not.toContain("scheduled_date");
  });

  it("derives date-free preview weekday conflicts from relative builder days", () => {
    const state = {
      ...createDefaultTrainingPlanBuilderState(),
      anchorDate: "2026-07-01",
      scheduling: {
        startDate: "2026-07-01",
        preferredWeekdays: [0],
        sessionDateOverrides: {},
      },
      structure: {
        sessions: [
          {
            localId: "session-1",
            offsetDays: 0,
            activityPlan: null,
          },
          {
            localId: "session-2",
            offsetDays: 1,
            activityPlan: null,
          },
        ],
      },
    };

    const preview = deriveTrainingPlanSchedulingPreview(state);

    expect(preview.sessions.map((session) => session.date)).toEqual(["2026-07-01", "2026-07-02"]);
    expect(preview.sessions.map((session) => session.weekday)).toEqual([0, 1]);
    expect(preview.sessions[0]?.conflictCodes).not.toContain("non_preferred_day");
    expect(preview.sessions[1]?.conflictCodes).toContain("non_preferred_day");
    expect(preview.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "non_preferred_day", sessionId: "session-2" }),
      ]),
    );
  });

  it("moves schedule preview sessions locally and shifts the preview anchor", () => {
    const baseState = {
      ...createDefaultTrainingPlanBuilderState(),
      anchorDate: "2026-06-01",
      scheduling: {
        startDate: "2026-06-01",
        preferredWeekdays: [1, 3, 5],
        sessionDateOverrides: {},
      },
      structure: {
        sessions: [
          {
            localId: "session-1",
            offsetDays: 0,
            activityPlan: null,
          },
        ],
      },
    };
    const moved = trainingPlanBuilderReducer(baseState, {
      type: "scheduling.moveSessionToDate",
      sessionId: "session-1",
      date: "2026-06-04",
    });
    const shifted = trainingPlanBuilderReducer(moved, { type: "scheduling.shiftPlan", days: 7 });

    expect(moved.structure.sessions[0]?.offsetDays).toBe(3);
    expect(moved.scheduling.sessionDateOverrides["session-1"]).toBe("2026-06-04");
    expect(shifted.scheduling.startDate).toBe("2026-06-08");
    expect(shifted.scheduling.sessionDateOverrides["session-1"]).toBe("2026-06-11");
  });

  it("creates a planning context snapshot from builder-only planning inputs", () => {
    const fixtures = createTrainingPlanBuilderFixtures();
    const state = {
      ...fixtures.readyState,
      anchorDate: "2026-03-02",
      goalContext: {
        selectedGoals: [fixtures.localGoal({ localId: "goal-1", title: "Build FTP" })],
      },
      planPreferences: {
        ...fixtures.readyState.planPreferences,
        durationWeeks: 6,
        weeklySessionCount: 4,
      },
    };

    const context = createTrainingPlanPlanningContext(state);

    expect(context).toMatchObject({
      anchorDate: "2026-03-02",
      goals: [{ localId: "goal-1", title: "Build FTP" }],
      preferences: { durationWeeks: 6, weeklySessionCount: 4 },
      scheduling: state.scheduling,
    });
    expect(context.sessions).toBe(state.structure.sessions);
    expect(context.athleteContext).toBe(state.athleteContext);
  });

  it("derives local projection data without changing canonical save payloads", () => {
    const fixtures = createTrainingPlanBuilderFixtures();
    const state = {
      ...fixtures.emptyState,
      planPreferences: {
        ...fixtures.emptyState.planPreferences,
        durationWeeks: 4,
        weeklySessionCount: 3,
      },
      goalContext: {
        selectedGoals: [fixtures.localGoal({ localId: "goal-1" })],
      },
    };

    const projection = deriveTrainingPlanLocalProjection(state);

    expect(projection.summary).toEqual(selectBuilderSummary(state));
    expect(projection.saveReadiness).toEqual(selectSaveReadiness(state));
    expect(projection.structureProposal.sessions.length).toBeGreaterThan(0);
    expect(projection.creationPreview.weeks).toEqual([]);
    expect(projection.builderViewModel.goalCount).toBe(1);
    expect(projection.schedulingPreview.sessions).toEqual([]);
    expect(projection.athleteContextFields.map((field) => field.key)).toContain("weightKg");
    expect(
      projection.planningConstraintFields.find((field) => field.key === "durationWeeks"),
    ).toMatchObject({
      visible: true,
      value: { value: 4, source: "manual_override" },
    });
    expect(projection.canUseStructureProposal).toBe(true);
    expect(projection.backendPlanning.status.available).toBe(false);
    expect(projection.backendPlanning.previewRequest.operation).toBe("previewCreationConfig");
    expect(JSON.stringify(toTrainingPlanCreatePayload(fixtures.readyState))).not.toContain(
      "planningContext",
    );
  });

  it("scores and sorts activity plan picker items around selected session intent", () => {
    const fixtures = createTrainingPlanBuilderFixtures();
    const session = fixtures.unresolvedSession({
      localId: "session-1",
      intent: {
        type: "endurance",
        driver: "completion-duration",
        targetDurationSeconds: 5400,
        targetTss: 90,
      },
    });

    const pickerState = deriveActivityPlanPickerState({
      selectedSessionId: "session-1",
      sessions: [session],
      sort: "name",
      pages: [
        {
          items: [
            {
              id: "short",
              name: "Alpha short recovery",
              created_at: "2026-01-03T00:00:00.000Z",
              authoritative_metrics: { estimated_duration: 1800, estimated_tss: 30 },
            },
            {
              id: "long",
              name: "Zulu endurance ride",
              created_at: "2026-01-01T00:00:00.000Z",
              authoritative_metrics: { estimated_duration: 5400, estimated_tss: 90 },
            },
          ],
        },
      ],
    });

    expect(
      scoreActivityPlanFit({
        intent: undefined,
        estimatedTss: 90,
        estimatedDurationSeconds: 5400,
      }),
    ).toBeNull();
    expect(
      scoreActivityPlanFit({
        intent: {
          type: "recovery",
          driver: "starter-frequency",
          targetDurationSeconds: 1800,
          targetTss: 30,
        },
        estimatedTss: 25,
        estimatedDurationSeconds: 1800,
      }),
    ).toMatchObject({ label: "Best fit", reason: "Matches duration and load" });
    expect(pickerState.activityPlanItems.map((item) => item.id)).toEqual(["long", "short"]);
    expect(pickerState.activityPlanFitById.get("long")).toMatchObject({
      label: "Best fit",
      score: 100,
    });
    expect(pickerState.activityPlanFitById.get("short")?.score ?? 0).toBeLessThan(60);
  });

  it("recomputes assigned session projection metrics from current athlete context estimates", () => {
    const fixtures = createTrainingPlanBuilderFixtures();
    const assignedActivityPlan = fixtures.activityPlan({
      id: "run-plan",
      estimatedDurationSeconds: 3600,
      estimatedTss: 100,
    });
    const baseState = {
      ...fixtures.readyState,
      structure: {
        sessions: [
          fixtures.assignedSession({
            localId: "session-1",
            activityPlan: assignedActivityPlan,
          }),
        ],
      },
    };
    const activityPlansById = {
      "run-plan": {
        id: "run-plan",
        name: "5K tempo",
        activity_category: "run",
        authoritative_metrics: { estimated_duration: 3600, estimated_tss: 100 },
        structure: {
          version: 2,
          intervals: [
            {
              id: "11111111-1111-4111-8111-111111111111",
              name: "Tempo block",
              repetitions: 1,
              steps: [
                {
                  id: "22222222-2222-4222-8222-222222222222",
                  name: "Tempo 5K",
                  duration: { type: "distance", meters: 5000 },
                  targets: [{ type: "%FTP", intensity: 80 }],
                },
              ],
            },
          ],
        },
      },
    };
    const fastState = {
      ...baseState,
      athleteContext: createAthletePlanningContextFromSnapshot({
        profile: null,
        profileMetrics: [],
        activityEfforts: [
          {
            activity_category: "run",
            effort_type: "speed",
            duration_seconds: 1200,
            value: 4,
            unit: "m/s",
            recorded_at: "2026-01-01T00:00:00.000Z",
          },
        ],
      }),
    };
    const slowState = {
      ...baseState,
      athleteContext: createAthletePlanningContextFromSnapshot({
        profile: null,
        profileMetrics: [],
        activityEfforts: [
          {
            activity_category: "run",
            effort_type: "speed",
            duration_seconds: 1200,
            value: 2.5,
            unit: "m/s",
            recorded_at: "2026-01-02T00:00:00.000Z",
          },
        ],
      }),
    };

    const fastProjection = deriveTrainingPlanLocalProjection(fastState, activityPlansById);
    const slowProjection = deriveTrainingPlanLocalProjection(slowState, activityPlansById);

    expect(baseState.structure.sessions[0]?.activityPlan?.estimatedTss).toBe(100);
    expect(
      fastProjection.planningProjection.estimatedContext.sessions[0]?.activityPlan
        ?.estimatedDurationSeconds,
    ).toBe(1250);
    expect(
      slowProjection.planningProjection.estimatedContext.sessions[0]?.activityPlan
        ?.estimatedDurationSeconds,
    ).toBe(2000);
    expect(fastProjection.creationPreview.totalEstimatedTss).toBeLessThan(
      slowProjection.creationPreview.totalEstimatedTss,
    );
    expect(fastProjection.creationPreview.totalEstimatedTss).not.toBe(100);
    expect(
      slowProjection.builderViewModel.dailyTrainingPathChart.weeks[0]?.plannedLoad,
    ).toBeGreaterThan(
      fastProjection.builderViewModel.dailyTrainingPathChart.weeks[0]?.plannedLoad ?? 0,
    );
  });

  it("keeps backend planning client scaffold explicit and network-free", () => {
    const fixtures = createTrainingPlanBuilderFixtures();
    const context = createTrainingPlanPlanningContext(fixtures.readyState);

    expect(getBackendPlanningClientStatus()).toEqual({
      available: false,
      enabledOperations: [],
      reason:
        "Backend planning adapter scaffolded; local projection remains authoritative for this pass.",
    });
    expect(getPlannedBackendPlanningOperations()).toEqual([
      "getCreationSuggestions",
      "previewCreationConfig",
      "createFromCreationConfig",
      "updateFromCreationConfig",
    ]);
    expect(createBackendPlanningRequestSnapshot(context, "previewCreationConfig")).toEqual({
      context,
      operation: "previewCreationConfig",
    });
    expect(deriveBackendPlanningState(context)).toMatchObject({
      plannedOperations: getPlannedBackendPlanningOperations(),
      previewRequest: { context, operation: "previewCreationConfig" },
    });
    expect(deriveBackendPlanningState(context).status.reason).toBe("No goals configured.");
    expect(deriveBackendPlanningState(context).contextFingerprint).toContain("anchorDate");
  });

  it("maps dated performance goals into backend preview creation-config input", () => {
    const fixtures = createTrainingPlanBuilderFixtures();
    const state = {
      ...fixtures.readyState,
      goalContext: {
        selectedGoals: [
          fixtures.localGoal({
            title: "Race a fast 10K",
            targetDate: "2026-03-01",
            targetOffsetDays: 59,
            activityCategory: "run",
            objective: {
              type: "event_performance",
              activity_category: "run",
              distance_m: 10_000,
              target_time_s: 2700,
            },
          }),
        ],
      },
      planPreferences: {
        ...fixtures.readyState.planPreferences,
        weeklySessionCount: 4,
      },
      scheduling: {
        ...fixtures.readyState.scheduling,
        startDate: fixtures.anchorDate,
      },
    };
    const context = createTrainingPlanPlanningContext(state);

    const result = mapPlanningContextToPreviewCreationConfigInput(context);

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) throw new Error(result.reason);
    expect(result.input.minimal_plan).toMatchObject({
      plan_start_date: state.scheduling.startDate,
      goals: [
        {
          name: "Race a fast 10K",
          target_date: "2026-03-01",
          priority: 10,
          targets: [
            {
              target_type: "race_performance",
              distance_m: 10_000,
              target_time_s: 2700,
              activity_category: "run",
            },
          ],
        },
      ],
    });
    expect(result.input.creation_input.user_values?.constraints).toMatchObject({
      min_sessions_per_week: 3,
      max_sessions_per_week: 4,
      goal_difficulty_preference: "balanced",
    });
    expect(result.input.post_create_behavior).toEqual({ autonomous_mutation_enabled: false });
  });

  it("maps completion goals with explicit duration and duration-derived target dates", () => {
    const fixtures = createTrainingPlanBuilderFixtures();
    const state = {
      ...fixtures.readyState,
      goalContext: {
        selectedGoals: [
          fixtures.localGoal({
            title: "Complete a 5K",
            targetDate: null,
            targetOffsetDays: null,
            activityCategory: "run",
            objective: {
              type: "completion",
              activity_category: "run",
              distance_m: 5000,
              duration_s: 2100,
            },
          }),
        ],
      },
      planPreferences: {
        ...fixtures.readyState.planPreferences,
        durationWeeks: 4,
        weeklySessionCount: 3,
      },
      scheduling: { ...fixtures.readyState.scheduling, startDate: fixtures.anchorDate },
    };

    const result = mapPlanningContextToPreviewCreationConfigInput(
      createTrainingPlanPlanningContext(state),
    );

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) throw new Error(result.reason);
    expect(result.input.minimal_plan.goals[0]).toMatchObject({
      target_date: "2026-01-28",
      targets: [
        {
          target_type: "race_performance",
          distance_m: 5000,
          target_time_s: 2100,
          activity_category: "run",
        },
      ],
    });
    expect(result.input.creation_input.user_values?.constraints).toMatchObject({
      min_sessions_per_week: 2,
      max_sessions_per_week: 3,
    });
  });

  it("does not infer completion goal duration for backend preview", () => {
    const fixtures = createTrainingPlanBuilderFixtures();
    const state = {
      ...fixtures.readyState,
      goalContext: {
        selectedGoals: [
          fixtures.localGoal({
            title: "Complete a 5K",
            targetDate: null,
            targetOffsetDays: null,
            activityCategory: "run",
            objective: {
              type: "completion",
              activity_category: "run",
              distance_m: 5000,
            },
          }),
        ],
      },
      planPreferences: {
        ...fixtures.readyState.planPreferences,
        durationWeeks: 4,
      },
    };

    expect(
      mapPlanningContextToPreviewCreationConfigInput(createTrainingPlanPlanningContext(state)),
    ).toMatchObject({
      ok: false,
      reason: 'Completion goal "Complete a 5K" needs a target duration before backend preview.',
    });
  });

  it("returns specific backend preview mapping reasons for missing or unsupported goals", () => {
    const fixtures = createTrainingPlanBuilderFixtures();

    expect(
      mapPlanningContextToPreviewCreationConfigInput(
        createTrainingPlanPlanningContext({
          ...fixtures.readyState,
          goalContext: { selectedGoals: [] },
        }),
      ),
    ).toMatchObject({ ok: false, reason: "No goals configured." });

    expect(
      mapPlanningContextToPreviewCreationConfigInput(
        createTrainingPlanPlanningContext({
          ...fixtures.readyState,
          goalContext: {
            selectedGoals: [
              fixtures.localGoal({
                title: "Train consistently",
                targetDate: "2026-03-01",
                targetOffsetDays: 59,
                objective: { type: "consistency", target_sessions_per_week: 3 },
              }),
            ],
          },
        }),
      ),
    ).toMatchObject({
      ok: false,
      reason:
        'Consistency goal "Train consistently" needs a backend target contract before authoritative preview.',
    });
  });

  it("keeps backend preview input unavailable when goals cannot map to backend targets", () => {
    const fixtures = createTrainingPlanBuilderFixtures();
    const context = createTrainingPlanPlanningContext({
      ...fixtures.readyState,
      goalContext: {
        selectedGoals: [fixtures.localGoal({ title: "Ride more consistently" })],
      },
    });

    const result = mapPlanningContextToPreviewCreationConfigInput(context);
    const planningState = deriveBackendPlanningState(context);

    expect(result).toMatchObject({ ok: false });
    expect(planningState.previewInput).toBeNull();
    expect(planningState.status.reason).toContain("needs a target date or plan duration");
  });

  it("maps backend preview input and snapshot token into create/update commit inputs", () => {
    const fixtures = createTrainingPlanBuilderFixtures();
    const state = {
      ...fixtures.readyState,
      goalContext: {
        selectedGoals: [
          fixtures.localGoal({
            title: "Raise FTP",
            targetDate: "2026-03-01",
            targetOffsetDays: 59,
            activityCategory: "bike",
            objective: {
              type: "threshold",
              metric: "power",
              activity_category: "bike",
              value: 310,
              test_duration_s: 1200,
            },
          }),
        ],
      },
      scheduling: { ...fixtures.readyState.scheduling, startDate: fixtures.anchorDate },
    };
    const previewMapping = mapPlanningContextToPreviewCreationConfigInput(
      createTrainingPlanPlanningContext(state),
    );
    if (!previewMapping.ok) throw new Error(previewMapping.reason);

    const createMapping = mapBackendPlanningCreateCommitInput({
      previewInput: previewMapping.input,
      previewSnapshotToken: "snapshot-token",
    });
    const updateMapping = mapBackendPlanningUpdateCommitInput({
      planId: "22222222-2222-4222-8222-222222222222",
      previewInput: previewMapping.input,
      previewSnapshotToken: "snapshot-token",
    });

    expect(createMapping).toMatchObject({
      ok: true,
      input: {
        preview_snapshot_token: "snapshot-token",
        is_active: true,
        minimal_plan: {
          goals: [
            {
              targets: [
                {
                  target_type: "power_threshold",
                  target_watts: 310,
                  activity_category: "bike",
                },
              ],
            },
          ],
        },
      },
    });
    expect(updateMapping).toMatchObject({
      ok: true,
      input: {
        plan_id: "22222222-2222-4222-8222-222222222222",
        preview_snapshot_token: "snapshot-token",
      },
    });
  });

  it("keeps backend commit mapping unavailable without preview input or snapshot token", () => {
    const fixtures = createTrainingPlanBuilderFixtures();
    const previewMapping = mapPlanningContextToPreviewCreationConfigInput(
      createTrainingPlanPlanningContext({
        ...fixtures.readyState,
        goalContext: {
          selectedGoals: [
            fixtures.localGoal({
              title: "Run threshold",
              targetDate: "2026-03-01",
              targetOffsetDays: 59,
              activityCategory: "run",
              objective: {
                type: "threshold",
                metric: "pace",
                activity_category: "run",
                value: 4.2,
                test_duration_s: 1200,
              },
            }),
          ],
        },
        scheduling: { ...fixtures.readyState.scheduling, startDate: fixtures.anchorDate },
      }),
    );
    if (!previewMapping.ok) throw new Error(previewMapping.reason);

    expect(
      mapBackendPlanningCreateCommitInput({ previewInput: null, previewSnapshotToken: "token" }),
    ).toMatchObject({ ok: false, reason: "Backend preview input is unavailable." });
    expect(
      mapBackendPlanningCreateCommitInput({
        previewInput: previewMapping.input,
        previewSnapshotToken: null,
      }),
    ).toMatchObject({ ok: false, reason: "Backend preview snapshot token is unavailable." });
    expect(
      mapBackendPlanningUpdateCommitInput({
        planId: "not-a-uuid",
        previewInput: null,
        previewSnapshotToken: "token",
      }),
    ).toMatchObject({ ok: false, reason: "Training plan id must be a UUID for backend update." });
  });

  it("selects backend save routes only when backend commit mapping is available", () => {
    const fixtures = createTrainingPlanBuilderFixtures();
    const previewMapping = mapPlanningContextToPreviewCreationConfigInput(
      createTrainingPlanPlanningContext({
        ...fixtures.readyState,
        goalContext: {
          selectedGoals: [
            fixtures.localGoal({
              title: "Raise FTP",
              targetDate: "2026-03-01",
              targetOffsetDays: 59,
              activityCategory: "bike",
              objective: {
                type: "threshold",
                metric: "power",
                activity_category: "bike",
                value: 310,
                test_duration_s: 1200,
              },
            }),
          ],
        },
        scheduling: { ...fixtures.readyState.scheduling, startDate: fixtures.anchorDate },
      }),
    );
    if (!previewMapping.ok) throw new Error(previewMapping.reason);

    const backendCreate = mapBackendPlanningCreateCommitInput({
      previewInput: previewMapping.input,
      previewSnapshotToken: "snapshot-token",
    });
    const legacyCreate = mapBackendPlanningCreateCommitInput({
      previewInput: previewMapping.input,
      previewSnapshotToken: null,
    });
    const backendUpdate = mapBackendPlanningUpdateCommitInput({
      planId: "22222222-2222-4222-8222-222222222222",
      previewInput: previewMapping.input,
      previewSnapshotToken: "snapshot-token",
    });
    const legacyUpdate = mapBackendPlanningUpdateCommitInput({
      planId: "22222222-2222-4222-8222-222222222222",
      previewInput: previewMapping.input,
      previewSnapshotToken: null,
    });

    expect(selectTrainingPlanCreateSaveRoute(backendCreate)).toBe("backend");
    expect(selectTrainingPlanCreateSaveRoute(legacyCreate)).toBe("legacy");
    expect(selectTrainingPlanUpdateSaveRoute(backendUpdate)).toBe("backend");
    expect(selectTrainingPlanUpdateSaveRoute(legacyUpdate)).toBe("legacy");
    expect(
      createTrainingPlanSavePlanFacade({ createCommit: backendCreate, updateCommit: legacyUpdate }),
    ).toMatchObject({
      createRoute: "backend",
      updateRoute: "legacy",
    });
  });

  it("creates a simplified projection facade over active projection internals", () => {
    const localChart = deriveTrainingPlanLocalProjection(
      createTrainingPlanBuilderFixtures().readyState,
    ).builderViewModel.dailyTrainingPathChart;
    const activeProjection = selectActiveTrainingPlanProjection({
      backendPreview: null,
      backendPreviewEnabled: false,
      isBackendInputStale: false,
      localChart,
    });
    const chartProjection = deriveTrainingPathChartFromActiveProjection({
      activeProjection,
      localChart,
    });
    const status = deriveTrainingPathProjectionStatus({
      activeProjection,
      backendInputAvailable: false,
      backendPlanningReason: "No goals configured.",
      backendPreviewEnabled: false,
      backendPreviewLoading: false,
      chartSource: chartProjection.source,
    });

    expect(
      createTrainingPlanProjectionFacade({
        activeProjection,
        authoritativeProjection: null,
        inspectorInsight: null,
        trainingPathChartProjection: chartProjection,
        trainingPathProjectionStatus: status,
      }),
    ).toMatchObject({
      source: "local",
      chart: localChart,
      chartSource: "local",
      active: activeProjection,
      authoritative: null,
      inspectorInsight: null,
      previewSnapshotToken: null,
    });
  });

  it("normalizes backend preview response and prefers it when current", () => {
    const backendPreview = normalizeBackendPlanningPreview({
      projection_feasibility: { state: "aggressive", reasons: ["ramp too steep"] },
      conflicts: {
        is_blocking: false,
        items: [{ code: "ramp", severity: "warning", message: "Ramp is high" }],
      },
      plan_preview: {
        name: "Spring build",
        start_date: "2026-01-01",
        end_date: "2026-03-01",
        goal_count: 1,
        block_count: 3,
      },
      projection_chart: {
        readiness_score: 72,
        readiness_confidence: 0.84,
        points: [{ date: "2026-01-01", ctl: 42 }],
      },
      preview_snapshot: { version: "creation_preview_v2", token: "token-1" },
    });

    expect(backendPreview).toMatchObject({
      source: "backend",
      readinessScore: 72,
      readinessConfidence: 0.84,
      feasibilityState: "aggressive",
      feasibilityReasons: ["ramp too steep"],
      previewSnapshotToken: "token-1",
      conflicts: { isBlocking: false, items: [{ code: "ramp" }] },
      planPreview: { name: "Spring build", goalCount: 1 },
    });
    expect(
      selectActiveTrainingPlanProjection({
        backendPreview,
        backendPreviewEnabled: true,
        isBackendInputStale: false,
        localChart: { weeks: [] },
      }),
    ).toMatchObject({ source: "backend", readinessScore: 72 });
  });

  it("falls back to local projection when backend preview is stale or unavailable", () => {
    const localChart = { weeks: [{ label: "Week 1" }] };

    expect(
      selectActiveTrainingPlanProjection({
        backendPreview: null,
        backendPreviewEnabled: false,
        isBackendInputStale: false,
        localChart,
      }),
    ).toMatchObject({ source: "local", chart: localChart });
    expect(
      selectActiveTrainingPlanProjection({
        backendPreview: normalizeBackendPlanningPreview({
          projection_chart: {},
          preview_snapshot: { token: "t" },
        }),
        backendPreviewEnabled: true,
        isBackendInputStale: true,
        localChart,
      }),
    ).toMatchObject({ source: "local", chart: localChart });
  });

  it("adapts compatible backend projection points into the training path chart model", () => {
    const localChart = deriveTrainingPlanLocalProjection(
      createTrainingPlanBuilderFixtures().readyState,
    ).builderViewModel.dailyTrainingPathChart;
    const backendPreview = normalizeBackendPlanningPreview({
      projection_chart: {
        display_points: [
          {
            date: "2026-01-05",
            predicted_load_tss: 40,
            predicted_fitness_ctl: 42,
            predicted_fatigue_atl: 48,
            predicted_form_tsb: -6,
            readiness_score: 70,
          },
          {
            date: "2026-01-06",
            predicted_load_tss: 50,
            predicted_fitness_ctl: 43,
            predicted_fatigue_atl: 51,
            predicted_form_tsb: -8,
            readiness_score: 72,
          },
          {
            date: "2026-01-12",
            predicted_load_tss: 60,
            predicted_fitness_ctl: 44,
            predicted_fatigue_atl: 52,
            predicted_form_tsb: -8,
            readiness_score: 73,
          },
        ],
      },
      preview_snapshot: { token: "token" },
    });
    if (!backendPreview) throw new Error("Expected backend preview");

    const result = deriveTrainingPathChartFromActiveProjection({
      activeProjection: backendPreview,
      localChart,
    });

    expect(result.source).toBe("backend");
    expect(result.chart.weeks).toHaveLength(2);
    expect(result.chart.weeks[0]).toMatchObject({
      weekStart: "2026-01-05",
      weekEnd: "2026-01-11",
      plannedLoad: 90,
      scheduledFitness: 43,
      fatigue: 51,
      form: -8,
    });
    expect(result.chart.domains.load[1]).toBeGreaterThan(90);
  });

  it("falls back to local chart when backend projection chart is malformed", () => {
    const localChart = deriveTrainingPlanLocalProjection(
      createTrainingPlanBuilderFixtures().readyState,
    ).builderViewModel.dailyTrainingPathChart;
    const backendPreview = normalizeBackendPlanningPreview({
      projection_chart: { display_points: [{ date: "2026-01-05" }] },
      preview_snapshot: { token: "token" },
    });
    if (!backendPreview) throw new Error("Expected backend preview");

    expect(
      deriveTrainingPathChartFromActiveProjection({ activeProjection: backendPreview, localChart }),
    ).toEqual({ chart: localChart, source: "local" });
  });

  it("describes training path projection source and fallback reasons", () => {
    const localProjection = selectActiveTrainingPlanProjection({
      backendPreview: null,
      backendPreviewEnabled: false,
      isBackendInputStale: false,
      localChart: { weeks: [] },
    });

    expect(
      deriveTrainingPathProjectionStatus({
        activeProjection: localProjection,
        backendInputAvailable: false,
        backendPlanningReason: "Goal is not mappable.",
        backendPreviewEnabled: false,
        backendPreviewLoading: false,
        chartSource: "local",
      }),
    ).toMatchObject({
      source: "local",
      backendInputAvailable: false,
      backendPreviewEnabled: false,
      backendPreviewError: null,
      backendPreviewHasSnapshot: false,
      fallbackReason: "Goal is not mappable.",
    });

    const backendProjection = normalizeBackendPlanningPreview({
      projection_chart: {
        readiness_score: 80,
        display_points: [
          {
            date: "2026-01-05",
            predicted_load_tss: 40,
            predicted_fitness_ctl: 42,
            predicted_fatigue_atl: 47,
            predicted_form_tsb: -5,
            readiness_score: 80,
          },
        ],
      },
      preview_snapshot: { token: "token" },
    });
    if (!backendProjection) throw new Error("Expected backend projection");

    expect(
      deriveTrainingPathProjectionStatus({
        activeProjection: backendProjection,
        backendInputAvailable: true,
        backendPlanningReason: "mapped",
        backendPreviewEnabled: true,
        backendPreviewLoading: false,
        chartSource: "backend",
      }),
    ).toMatchObject({
      source: "backend",
      backendInputAvailable: true,
      backendPreviewEnabled: true,
      backendPreviewHasSnapshot: true,
      fallbackReason: null,
    });
  });

  it("derives backend schedule inspector insight from conflicts and feasibility", () => {
    const conflictProjection = normalizeBackendPlanningPreview({
      projection_feasibility: { state: "feasible", reasons: [] },
      conflicts: {
        is_blocking: false,
        items: [{ code: "cluster", severity: "warning", message: "Hard workouts are clustered." }],
      },
      projection_chart: { readiness_score: 80 },
      preview_snapshot: { token: "token" },
    });
    if (!conflictProjection) throw new Error("Expected conflict projection");

    expect(
      deriveScheduleInspectorBackendInsight({
        activeProjection: conflictProjection,
        selectionLabel: "Threshold Intervals",
      }),
    ).toMatchObject({
      source: "backend",
      headline: "Backend projection flags a planning risk",
      detail: "Threshold Intervals: Hard workouts are clustered.",
      riskLabel: "warning",
      outcome: "Too fatigued",
    });

    const aggressiveProjection = normalizeBackendPlanningPreview({
      projection_feasibility: { state: "aggressive", reasons: ["Ramp is too steep."] },
      projection_chart: { readiness_score: 70 },
      preview_snapshot: { token: "token" },
    });
    if (!aggressiveProjection) throw new Error("Expected aggressive projection");

    expect(
      deriveScheduleInspectorBackendInsight({ activeProjection: aggressiveProjection }),
    ).toMatchObject({
      headline: "Backend projection marks this plan as aggressive",
      detail: "Ramp is too steep.",
      riskLabel: "aggressive",
      outcome: "Too fatigued",
    });
  });

  it("derives backend schedule inspector support insight from readiness", () => {
    const supportedProjection = normalizeBackendPlanningPreview({
      projection_feasibility: { state: "feasible", reasons: [] },
      projection_chart: { readiness_score: 82, readiness_confidence: 0.75 },
      preview_snapshot: { token: "token" },
    });
    if (!supportedProjection) throw new Error("Expected supported projection");

    expect(
      deriveScheduleInspectorBackendInsight({ activeProjection: supportedProjection }),
    ).toMatchObject({
      headline: "This schedule is supporting the goal",
      detail: "Projected readiness is 82 with 75% confidence.",
      riskLabel: null,
      outcome: "Better prepared",
    });
    expect(
      deriveScheduleInspectorBackendInsight({
        activeProjection: { source: "local", isAvailable: true, chart: {}, reason: "local" },
      }),
    ).toBeNull();
  });

  it("hides unknown optional athlete context fields until present or required", () => {
    const context = createAthletePlanningContextFromSnapshot({
      profile: { dob: null, gender: null, preferred_units: null },
      profileMetrics: [],
      activityEfforts: [],
    });
    const fields = selectAthletePlanningContextFields(context);

    expect(fields.find((field) => field.key === "weightKg")).toMatchObject({
      visible: false,
      required: false,
      canOverride: false,
      canRemove: false,
    });
    expect(fields.find((field) => field.key === "ftpWatts")).toMatchObject({
      visible: false,
      required: false,
    });
  });

  it("shows required missing athlete context fields with default values and override affordance", () => {
    const context = createAthletePlanningContextFromSnapshot({
      profile: { dob: null, gender: null, preferred_units: null },
      profileMetrics: [],
      activityEfforts: [],
    });
    const fields = selectAthletePlanningContextFields(context, {
      weightKg: { reason: "Needed to estimate load and power-to-weight demand." },
      ftpWatts: { reason: "Needed for bike intensity calculations." },
    });

    expect(fields.find((field) => field.key === "weightKg")).toMatchObject({
      visible: true,
      required: true,
      reason: "Needed to estimate load and power-to-weight demand.",
      canOverride: true,
      canRemove: false,
      value: { value: 75, source: "default", unit: "kg" },
    });
    expect(fields.find((field) => field.key === "ftpWatts")).toMatchObject({
      visible: true,
      required: true,
      canOverride: true,
      canRemove: false,
      value: { value: 200, source: "default", unit: "W" },
    });
  });

  it("shows present optional athlete context fields and allows removal when not required", () => {
    const context = createAthletePlanningContextFromSnapshot({
      profileMetrics: [
        {
          metric_type: "weight_kg",
          value: 72,
          unit: "kg",
          recorded_at: "2026-06-01T00:00:00.000Z",
        },
      ],
      activityEfforts: [],
    });
    const fields = selectAthletePlanningContextFields(context);

    expect(fields.find((field) => field.key === "weightKg")).toMatchObject({
      visible: true,
      required: false,
      canOverride: true,
      canRemove: true,
      value: { value: 72, source: "profile_metric", unit: "kg" },
    });
  });

  it("creates schema-valid defaults without goals or persisted side effects", () => {
    const state = createDefaultTrainingPlanBuilderState();

    expect(trainingPlanBuilderStateSchema.parse(state)).toEqual(state);
    expect(state.goalContext.selectedGoals).toEqual([]);
    expect(state.structure.sessions).toEqual([]);
    expect(state.selection).toEqual({ type: "overview" });
  });

  it("defaults builder-local goal blueprints to canonical priority 10", () => {
    const fixtures = createTrainingPlanBuilderFixtures();
    const state = trainingPlanBuilderReducer(fixtures.emptyState, {
      type: "goalContext.addLocalGoal",
      goal: fixtures.localGoal({ localId: "goal-1", priority: undefined }),
    });

    expect(state.goalContext.selectedGoals).toHaveLength(1);
    expect(state.goalContext.selectedGoals[0]?.priority).toBe(10);
    expect("importance" in (state.goalContext.selectedGoals[0] ?? {})).toBe(false);
  });

  it("removes builder-local goal blueprints by local id", () => {
    const fixtures = createTrainingPlanBuilderFixtures();
    const withGoal = trainingPlanBuilderReducer(fixtures.emptyState, {
      type: "goalContext.addLocalGoal",
      goal: fixtures.localGoal({ localId: "goal-1", title: "Base" }),
    });
    const removed = trainingPlanBuilderReducer(withGoal, {
      type: "goalContext.removeLocalGoal",
      goalId: "goal-1",
    });

    expect(withGoal.goalContext.selectedGoals[0]).toMatchObject({
      localId: "goal-1",
      title: "Base",
    });
    expect(removed.goalContext.selectedGoals).toEqual([]);
  });

  it("keeps no-goal training plans valid and omits goal blueprints", () => {
    const fixtures = createTrainingPlanBuilderFixtures();
    const state = fixtures.readyState;
    const structure = toTrainingPlanStructure(state);

    expect(state.goalContext).toEqual({ selectedGoals: [] });
    expect(structure.goal_blueprints).toBeUndefined();
    expect(canonicalTrainingPlanStructureSchema.parse(structure)).toEqual(structure);
  });

  it("copies selected profile goal data into date-agnostic goal context snapshots", () => {
    const fixtures = createTrainingPlanBuilderFixtures();
    const state = trainingPlanBuilderReducer(fixtures.readyState, {
      type: "goalContext.toggleSelectedGoal",
      goal: {
        localId: "attached-goal-1",
        sourceProfileGoalId: "profile-goal-1",
        title: "Spring 10K",
        targetDate: "2026-02-12",
        targetOffsetDays: 42,
        priority: 8,
        activityCategory: "run",
        objective: {
          type: "completion",
          activity_category: "run",
          distance_m: 10000,
        },
      },
    });
    const payload = toTrainingPlanCreatePayload(state);

    expect(state.goalContext.selectedGoals).toHaveLength(1);
    expect(state.goalContext.selectedGoals[0]).toMatchObject({
      sourceProfileGoalId: "profile-goal-1",
      title: "Spring 10K",
    });
    expect(payload.structure.goal_blueprints?.[0]).toEqual({
      title: "Spring 10K",
      priority: 8,
      activity_category: "run",
      target_offset_days: 42,
      objective: {
        type: "completion",
        activity_category: "run",
        distance_m: 10000,
      },
    });
    expect(
      payload.structure.builder_planning_snapshot?.goal_context.selected_goals[0]
        ?.source_profile_goal_id,
    ).toBe("profile-goal-1");
    expect(JSON.stringify(payload)).not.toContain("targetDate");
    expect(payload.structure.goal_blueprints?.[0]).not.toHaveProperty("target_date");
  });

  it("removes copied profile goal data from the creation session", () => {
    const fixtures = createTrainingPlanBuilderFixtures();
    const selected = trainingPlanBuilderReducer(fixtures.readyState, {
      type: "goalContext.toggleSelectedGoal",
      goal: {
        localId: "attached-goal-1",
        sourceProfileGoalId: "profile-goal-1",
        title: "Spring 10K",
        targetOffsetDays: null,
        priority: 8,
        activityCategory: "run",
        objective: null,
      },
    });
    const removed = trainingPlanBuilderReducer(selected, {
      type: "goalContext.removeSelectedGoal",
      sourceProfileGoalId: "profile-goal-1",
    });

    expect(selected.goalContext.selectedGoals).toHaveLength(1);
    expect(removed.goalContext.selectedGoals).toEqual([]);
    expect(toTrainingPlanStructure(removed).goal_blueprints).toBeUndefined();
  });

  it("creates local training plan goals without profile goal references", () => {
    const fixtures = createTrainingPlanBuilderFixtures();
    const state = trainingPlanBuilderReducer(fixtures.readyState, {
      type: "goalContext.addLocalGoal",
      goal: {
        localId: "local-goal-1",
        title: "Build durable climbing",
        targetOffsetDays: null,
        priority: 10,
        activityCategory: null,
        objective: null,
      },
    });
    const payload = toTrainingPlanCreatePayload(state);

    expect(state.goalContext.selectedGoals).toEqual([
      {
        localId: "local-goal-1",
        title: "Build durable climbing",
        targetOffsetDays: null,
        priority: 10,
        activityCategory: null,
        objective: null,
      },
    ]);
    expect(payload.structure.goal_blueprints?.[0]).toEqual({
      title: "Build durable climbing",
      priority: 10,
      activity_category: null,
    });
    expect(JSON.stringify(payload)).not.toContain("profileGoal");
    expect(JSON.stringify(payload)).not.toContain("profile_goal");
    expect(JSON.stringify(payload)).not.toContain("sourceProfileGoalId");
  });

  it("keeps canonical builder-local goal objectives in goal blueprints", () => {
    const fixtures = createTrainingPlanBuilderFixtures();
    const state = {
      ...fixtures.readyState,
      goalContext: {
        selectedGoals: [
          fixtures.localGoal({
            localId: "completion-goal",
            title: "Complete a steady 10K",
            activityCategory: "run",
            objective: {
              type: "completion",
              activity_category: "run",
              distance_m: 10000,
            },
          }),
        ],
      },
    };

    expect(toTrainingPlanStructure(state).goal_blueprints?.[0]).toEqual({
      title: "Complete a steady 10K",
      priority: 10,
      activity_category: "run",
      objective: {
        type: "completion",
        activity_category: "run",
        distance_m: 10000,
      },
    });
  });

  it("stores builder-local planning preferences without legacy assumption buckets", () => {
    const fixtures = createTrainingPlanBuilderFixtures();
    const withPreferences = trainingPlanBuilderReducer(fixtures.emptyState, {
      type: "planPreferences.update",
      patch: { durationWeeks: 8, weeklySessionCount: 5, targetWeeklyHours: 7.5 },
    });

    expect(withPreferences.planPreferences).toMatchObject({
      durationWeeks: 8,
      weeklySessionCount: 5,
      targetWeeklyHours: 7.5,
    });
    expect(JSON.stringify(withPreferences)).not.toContain("profileInfoAssumptions");
    expect(JSON.stringify(withPreferences)).not.toContain("scenarioAssumptions");
  });

  it("orders adaptive builder modules as who, what, constraints, then metadata", () => {
    const state = createDefaultTrainingPlanBuilderState();

    expect(selectActionableTrainingPlanBuilderModules(state).map((module) => module.id)).toEqual([
      "athlete-context",
      "plan-goals",
      "plan-preferences",
      "plan-identity",
    ]);
  });

  it("applies structure and assignment modules only when the creation session supports them", () => {
    const fixtures = createTrainingPlanBuilderFixtures();
    const withGoal = trainingPlanBuilderReducer(fixtures.emptyState, {
      type: "goalContext.addLocalGoal",
      goal: fixtures.localGoal({ localId: "goal-1" }),
    });
    const withSession = trainingPlanBuilderReducer(withGoal, {
      type: "session.add",
      session: fixtures.unresolvedSession({ localId: "session-1", offsetDays: 0 }),
    });
    const moduleIds = selectApplicableTrainingPlanBuilderModules(withSession).map(
      (module) => module.id,
    );

    expect(moduleIds).toEqual(
      expect.arrayContaining([
        "athlete-context",
        "plan-goals",
        "plan-preferences",
        "relative-session-structure",
        "activity-plan-assignment",
        "plan-review",
      ]),
    );
    expect(selectTrainingPlanBuilderStageSummaries(withSession)).toEqual(
      expect.arrayContaining([
        { stage: "what", moduleCount: 1, readyCount: 1, startedCount: 0 },
        { stage: "assignment", moduleCount: 1, readyCount: 0, startedCount: 1 },
      ]),
    );
  });

  it("derives structure from consistency goals without requiring a long-session anchor", () => {
    const fixtures = createTrainingPlanBuilderFixtures();
    const state = {
      ...fixtures.emptyState,
      goalContext: {
        selectedGoals: [
          fixtures.localGoal({
            localId: "consistency-goal",
            objective: {
              type: "consistency",
              target_sessions_per_week: 4,
              target_weeks: 3,
            },
          }),
        ],
      },
    };

    expect(deriveTrainingPlanStructureProposal(state)).toMatchObject({
      durationWeeks: 3,
      sessionsPerWeek: 4,
      includesEnduranceAnchor: false,
      drivers: ["consistency-frequency"],
    });
    expect(deriveTrainingPlanStructureProposal(state).sessions).toHaveLength(12);
    expect(deriveTrainingPlanStructureProposal(state).sessions[0]?.intent).toMatchObject({
      type: "general",
      driver: "consistency-frequency",
    });
  });

  it("adds an endurance anchor only for completion goals that call for one", () => {
    const fixtures = createTrainingPlanBuilderFixtures();
    const state = {
      ...fixtures.emptyState,
      planPreferences: { ...fixtures.emptyState.planPreferences, durationWeeks: 2 },
      goalContext: {
        selectedGoals: [
          fixtures.localGoal({
            localId: "completion-goal",
            objective: {
              type: "completion",
              activity_category: "run",
              distance_m: 21_100,
            },
          }),
        ],
      },
    };
    const proposal = deriveTrainingPlanStructureProposal(state);

    expect(proposal.includesEnduranceAnchor).toBe(true);
    expect(proposal.drivers).toEqual(["starter-frequency", "completion-distance"]);
    expect(proposal.sessions.some((session) => session.label === "Endurance focus")).toBe(true);
    expect(proposal.sessions.some((session) => session.intent.type === "endurance")).toBe(true);
  });

  it("adds, assigns, moves, and selects relative sessions", () => {
    const fixtures = createTrainingPlanBuilderFixtures();
    const withSession = trainingPlanBuilderReducer(fixtures.emptyState, {
      type: "session.add",
      session: fixtures.unresolvedSession({ localId: "session-1", offsetDays: 0 }),
    });
    const assigned = trainingPlanBuilderReducer(withSession, {
      type: "session.assignActivityPlan",
      sessionId: "session-1",
      activityPlan: fixtures.activityPlan({ id: fixtures.activityPlanId }),
    });
    const moved = trainingPlanBuilderReducer(assigned, {
      type: "session.move",
      sessionId: "session-1",
      offsetDays: 3,
    });
    const customized = trainingPlanBuilderReducer(moved, {
      type: "session.updateEventOverrides",
      sessionId: "session-1",
      eventOverrides: { title: "Custom title", start_time: "08:00" },
    });
    const selected = trainingPlanBuilderReducer(customized, {
      type: "selection.set",
      selection: { type: "session", sessionId: "session-1" },
    });

    expect(selectSessionById(selected, "session-1")?.offsetDays).toBe(3);
    expect(selectSessionById(selected, "session-1")?.eventOverrides).toEqual({
      title: "Custom title",
      start_time: "08:00",
    });
    expect(selectBuilderSummary(selected)).toMatchObject({ sessionCount: 1, durationDays: 4 });
    expect(selected.selection).toEqual({ type: "session", sessionId: "session-1" });
  });

  it("derives weekly load/time preview and non-blocking checks client-side", () => {
    const fixtures = createTrainingPlanBuilderFixtures();
    const preview = deriveTrainingPlanCreationPreview({
      sessions: [
        {
          offsetDays: 0,
          assigned: true,
          estimatedTss: 120,
          estimatedDurationSeconds: 3600,
        },
        {
          offsetDays: 1,
          assigned: false,
          estimatedTss: null,
          estimatedDurationSeconds: null,
        },
        {
          offsetDays: 7,
          assigned: true,
          intent: { type: "endurance", targetDurationSeconds: 5400, targetTss: 90 },
          estimatedTss: 240,
          estimatedDurationSeconds: 7200,
        },
        {
          offsetDays: 8,
          assigned: true,
          intent: { type: "endurance", targetDurationSeconds: 5400, targetTss: 90 },
          estimatedTss: 30,
          estimatedDurationSeconds: 1800,
        },
      ],
    });

    expect(preview.weeks).toEqual([
      {
        weekIndex: 0,
        startOffsetDays: 0,
        endOffsetDays: 6,
        sessionCount: 2,
        assignedSessionCount: 1,
        estimatedTss: 120,
        estimatedDurationSeconds: 3600,
      },
      {
        weekIndex: 1,
        startOffsetDays: 7,
        endOffsetDays: 13,
        sessionCount: 2,
        assignedSessionCount: 2,
        estimatedTss: 270,
        estimatedDurationSeconds: 9000,
      },
    ]);
    expect(preview.checks.map((check) => check.code)).toEqual(
      expect.arrayContaining([
        "unassigned_sessions",
        "large_weekly_tss_ramp",
        "intent_mismatch",
        "hard_session_spacing",
      ]),
    );
    expect(fixtures.readyState.structure.sessions).toHaveLength(1);
  });

  it("reports save blockers for unresolved, invalid, inaccessible, and duplicate sessions", () => {
    const fixtures = createTrainingPlanBuilderFixtures();
    const invalid = {
      ...fixtures.emptyState,
      details: { ...fixtures.emptyState.details, name: "" },
      planPreferences: {
        ...fixtures.emptyState.planPreferences,
        weeklySessionCount: 6,
        restDaysPerWeek: 2,
      },
      goalContext: {
        selectedGoals: [fixtures.localGoal({ localId: "past-goal", targetOffsetDays: -1 })],
      },
      structure: {
        sessions: [
          fixtures.unresolvedSession({ localId: "missing", offsetDays: 0 }),
          fixtures.assignedSession({ localId: "invalid-offset", offsetDays: -1 }),
          fixtures.assignedSession({
            localId: "invalid-time",
            offsetDays: 1,
            eventOverrides: { start_time: "7" },
          }),
          fixtures.assignedSession({
            localId: "not-accessible",
            offsetDays: 2,
            activityPlan: fixtures.activityPlan({ accessible: false }),
          }),
          fixtures.assignedSession({
            localId: "duplicate-a",
            offsetDays: 3,
            eventOverrides: { start_time: "07:30" },
          }),
          fixtures.assignedSession({
            localId: "duplicate-b",
            offsetDays: 3,
            eventOverrides: { start_time: "07:30" },
          }),
        ],
      },
    };

    expect(validateTrainingPlanBuilderState(invalid).blockers.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        "missing_plan_name",
        "missing_activity_plan",
        "invalid_offset_days",
        "invalid_goal_target_offset",
        "invalid_start_time",
        "inaccessible_activity_plan",
        "duplicate_session",
      ]),
    );
  });

  it("maps save-ready builder state to canonical create input only", () => {
    const fixtures = createTrainingPlanBuilderFixtures();
    const state = {
      ...fixtures.readyState,
      goalContext: {
        selectedGoals: [
          fixtures.localGoal({
            localId: "goal-1",
            title: "Peak for event",
            sourceProfileGoalId: "profile-goal-1",
            targetDate: "2026-01-15",
            targetOffsetDays: 14,
          }),
        ],
      },
      scheduling: {
        ...fixtures.readyState.scheduling,
        startDate: "2026-01-01",
        sessionDateOverrides: { "session-1": "2026-01-08" },
      },
      structure: {
        sessions: [
          fixtures.assignedSession({
            localId: "session-1",
            offsetDays: 7,
            eventOverrides: { title: "Aerobic opener", start_time: "07:30" },
          }),
        ],
      },
    };
    const structure = toTrainingPlanStructure(state);
    const payload = toTrainingPlanCreatePayload(state);
    const payloadJson = JSON.stringify(payload);

    expect(canonicalTrainingPlanStructureSchema.parse(structure)).toEqual(structure);
    expect(trainingPlanCreateInputSchema.parse(payload)).toEqual(payload);
    expect(trainingPlanFinalCreatePayloadSchema.parse(payload)).toEqual(payload);
    for (const forbidden of [
      "scheduled_date",
      "session_type",
      "2026-01-08",
      "targetDate",
      "profile_goals",
      "sourceProfileGoalId",
      "profileInfoAssumptions",
      "profileMetricAssumptions",
      "activityEffortAssumptions",
      "planPreferences",
      "athleteContext",
      "planningContext",
      "scenarioAssumptions",
    ]) {
      expect(payloadJson).not.toContain(forbidden);
    }
    expect(payload.structure.sessions[0]).toEqual({
      offset_days: 7,
      activity_plan_id: fixtures.activityPlanId,
      event_overrides: { title: "Aerobic opener", start_time: "07:30" },
    });
    expect(payload.structure.goal_blueprints?.[0]).toEqual({
      title: "Peak for event",
      priority: 10,
      activity_category: null,
      target_offset_days: 14,
    });
  });

  it("rejects final create payloads that include builder-only scheduling or profile-goal fields", () => {
    const fixtures = createTrainingPlanBuilderFixtures();
    const payload = toTrainingPlanCreatePayload(fixtures.readyState);

    expect(
      trainingPlanFinalCreatePayloadSchema.safeParse({
        ...payload,
        start_date: "2026-01-01",
      }).success,
    ).toBe(false);
    expect(
      trainingPlanFinalCreatePayloadSchema.safeParse({
        ...payload,
        profile_goals: [],
      }).success,
    ).toBe(false);
    expect(
      trainingPlanFinalCreatePayloadSchema.safeParse({
        ...payload,
        structure: {
          ...payload.structure,
          sessions: [{ ...payload.structure.sessions[0], scheduled_date: "2026-01-08" }],
        },
      }).success,
    ).toBe(false);
    expect(
      trainingPlanFinalCreatePayloadSchema.safeParse({
        ...payload,
        structure: {
          ...payload.structure,
          goal_blueprints: [
            {
              title: "Peak for event",
              priority: 10,
              activity_category: null,
              sourceProfileGoalId: "profile-goal-1",
            },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it("hydrates existing reusable plans into builder state without dated scheduling fields", () => {
    const state = createTrainingPlanBuilderStateFromExistingPlan({
      fallbackDate: "2026-02-01",
      plan: {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Existing plan",
        description: "Reusable structure",
        template_visibility: "private",
        structure: {
          version: 1,
          goal_blueprints: [
            {
              title: "Race well",
              priority: 3,
              activity_category: "run",
              target_offset_days: 42,
            },
          ],
          sessions: [
            {
              offset_days: 2,
              activity_plan_id: "22222222-2222-4222-8222-222222222222",
              event_overrides: { title: "Tempo", start_time: "07:15" },
            },
          ],
        },
      },
      activityPlans: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          name: "Tempo intervals",
          template_visibility: "public",
          authoritative_metrics: {
            estimated_tss: 76,
            estimated_duration: 3600,
          },
        },
      ],
    });

    expect(trainingPlanBuilderStateSchema.parse(state)).toEqual(state);
    expect(state.details).toMatchObject({
      name: "Existing plan",
      description: "Reusable structure",
    });
    expect(state.scheduling.startDate).toBe("2026-02-01");
    expect(state.goalContext.selectedGoals[0]).toMatchObject({
      title: "Race well",
      targetOffsetDays: 42,
    });
    expect(state.goalContext.selectedGoals[0]?.targetDate).toBeUndefined();
    expect(state.goalContext.selectedGoals[0]?.sourceProfileGoalId).toBeUndefined();
    expect(state.structure.sessions[0]).toMatchObject({
      offsetDays: 2,
      activityPlan: {
        id: "22222222-2222-4222-8222-222222222222",
        name: "Tempo intervals",
        estimatedTss: 76,
      },
      eventOverrides: { title: "Tempo", start_time: "07:15" },
    });
  });

  it("hydrates builder planning snapshot context for edit continuity", () => {
    const state = createTrainingPlanBuilderStateFromExistingPlan({
      fallbackDate: "2026-02-01",
      plan: {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Existing plan",
        description: "Reusable structure",
        template_visibility: "private",
        structure: {
          version: 1,
          goal_blueprints: [{ title: "Fallback goal", priority: 10, activity_category: null }],
          builder_planning_snapshot: {
            version: 1,
            plan_preferences: {
              duration_weeks: 8,
              weekly_session_count: 4,
              target_weekly_hours: 6,
              rest_days_per_week: 2,
            },
            scheduling: {
              start_date: "2026-03-02",
              preferred_weekdays: [1, 2, 4, 6],
            },
            goal_context: {
              selected_goals: [
                {
                  title: "Snapshot race",
                  target_offset_days: 55,
                  target_date: "2026-04-26",
                  priority: 7,
                  activity_category: "run",
                  objective: { type: "completion", activity_category: "run", distance_m: 10000 },
                  source_profile_goal_id: "profile-goal-1",
                },
              ],
            },
          },
          sessions: [
            {
              offset_days: 2,
              activity_plan_id: "22222222-2222-4222-8222-222222222222",
            },
          ],
        },
      },
      activityPlans: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          name: "Tempo intervals",
          template_visibility: "public",
        },
      ],
    });

    expect(state.planPreferences).toEqual({
      durationWeeks: 8,
      weeklySessionCount: 4,
      targetWeeklyHours: 6,
      restDaysPerWeek: 2,
    });
    expect(state.scheduling).toMatchObject({
      startDate: "2026-03-02",
      preferredWeekdays: [1, 2, 4, 6],
    });
    expect(state.goalContext.selectedGoals[0]).toMatchObject({
      title: "Snapshot race",
      sourceProfileGoalId: "profile-goal-1",
      targetDate: "2026-04-26",
      targetOffsetDays: 55,
      priority: 7,
      activityCategory: "run",
    });
  });

  it("persists backend planning provenance in the builder planning snapshot when provided", () => {
    const fixtures = createTrainingPlanBuilderFixtures();

    const createPayload = toTrainingPlanCreatePayload(fixtures.readyState, {
      backendPlanning: {
        projectionSource: "backend",
        previewSnapshotToken: "snapshot-token",
      },
    });
    const updatePayload = toTrainingPlanUpdatePayload(
      "11111111-1111-4111-8111-111111111111",
      fixtures.readyState,
      {
        backendPlanning: {
          projectionSource: "local",
          previewSnapshotToken: null,
        },
      },
    );

    expect(createPayload.structure.builder_planning_snapshot?.backend_planning).toEqual({
      projection_source: "backend",
      preview_snapshot_token: "snapshot-token",
    });
    expect(updatePayload.structure?.builder_planning_snapshot?.backend_planning).toEqual({
      projection_source: "local",
      preview_snapshot_token: null,
    });
  });

  it("validates final update payloads strictly", () => {
    const fixtures = createTrainingPlanBuilderFixtures();
    const payload = toTrainingPlanUpdatePayload(
      "11111111-1111-4111-8111-111111111111",
      fixtures.readyState,
    );

    expect(trainingPlanFinalUpdatePayloadSchema.parse(payload)).toEqual(payload);
    expect(payload.id).toBe("11111111-1111-4111-8111-111111111111");
    expect(
      trainingPlanFinalUpdatePayloadSchema.safeParse({
        ...payload,
        scheduled_date: "2026-01-01",
      }).success,
    ).toBe(false);
  });

  it("reports save readiness from selectors", () => {
    const fixtures = createTrainingPlanBuilderFixtures();

    expect(selectSaveReadiness(fixtures.readyState).canSave).toBe(true);
  });

  it("derives the builder visualization model from sorted sessions and preview totals", () => {
    const fixtures = createTrainingPlanBuilderFixtures();
    const state = {
      ...fixtures.readyState,
      goalContext: {
        ...fixtures.readyState.goalContext,
        selectedGoals: [fixtures.localGoal()],
      },
      planPreferences: {
        ...fixtures.readyState.planPreferences,
        durationWeeks: 4,
        weeklySessionCount: 3,
      },
      athleteContext: {
        ...fixtures.readyState.athleteContext,
        physiology: {
          ...fixtures.readyState.athleteContext.physiology,
          currentFitnessCtl: {
            value: 41,
            source: "training_status" as const,
            recordedAt: "2026-01-04T00:00:00.000Z",
            unit: "CTL",
            overridden: false,
          },
          currentFatigueAtl: {
            value: 50,
            source: "training_status" as const,
            recordedAt: "2026-01-04T00:00:00.000Z",
            unit: "ATL",
            overridden: false,
          },
        },
      },
      scheduling: {
        ...fixtures.readyState.scheduling,
        startDate: "2026-01-05",
        preferredWeekdays: [1, 3],
      },
      structure: {
        sessions: [
          fixtures.unresolvedSession({ localId: "session-3", offsetDays: 5 }),
          fixtures.assignedSession({
            localId: "session-1",
            offsetDays: 0,
            activityPlan: fixtures.activityPlan({
              estimatedTss: 80,
              estimatedDurationSeconds: 3600,
            }),
          }),
          fixtures.assignedSession({
            localId: "session-2",
            offsetDays: 2,
            activityPlan: fixtures.activityPlan({
              estimatedTss: 40,
              estimatedDurationSeconds: 1800,
            }),
          }),
        ],
      },
    };
    const creationPreview = deriveTrainingPlanCreationPreview({
      sessions: state.structure.sessions.map((session) => ({
        offsetDays: session.offsetDays,
        assigned: session.activityPlan !== null,
        estimatedTss: session.activityPlan?.estimatedTss ?? null,
        estimatedDurationSeconds: session.activityPlan?.estimatedDurationSeconds ?? null,
      })),
    });

    const viewModel = deriveBuilderPlanCreationViewModel({ creationPreview, state });

    expect(viewModel.sessions.map((session) => session.localId)).toEqual([
      "session-1",
      "session-2",
      "session-3",
    ]);
    expect(viewModel.durationDays).toBe(6);
    expect(viewModel.assignedSessionCount).toBe(2);
    expect(viewModel.goalCount).toBe(1);
    expect(viewModel.totalEstimatedTss).toBe(120);
    expect(viewModel.totalEstimatedDurationSeconds).toBe(5400);
    expect(viewModel.nextBestAction).toMatchObject({
      text: "Assign a workout for Week 1 · Saturday.",
      target: { type: "session", sessionId: "session-3" },
      needsAttention: true,
    });
    expect(viewModel.actionRecommendations.map((recommendation) => recommendation.key)).toContain(
      "assign-session",
    );
    expect(viewModel.planningBriefRows.map((row) => row.value)).toEqual([
      "Fitness 41 CTL",
      "1 goal",
      "4 weeks · 3 sessions/week",
      "Reusable Week/Day plan · 2 preferred days",
    ]);
    expect(viewModel.sessionCanvasRows.map((row) => row.heightPercent)).toEqual([100, 50, 24]);
    expect(viewModel.recommendedLoad).toMatchObject({
      weeklyTss: 290,
      rangeMinTss: 250,
      rangeMaxTss: 330,
      plannedAverageTss: 120,
      status: "below",
    });
    expect(viewModel.weeklyCanvasRows[0]).toMatchObject({
      assignedSessionCount: 2,
      estimatedDurationSeconds: 5400,
      estimatedTss: 120,
      recommendedTssMarkerPercent: 41,
      sessionCount: 3,
      targetDeltaLabel: "130 under",
      tssBarPercent: 17,
      weekIndex: 0,
    });
    expect(viewModel.timelineWeeks[0]).toMatchObject({
      label: "Week 1",
      phaseLabel: "Base",
      estimatedTss: 120,
      plannedLoadPercent: 17,
      recommendedLoadPercent: 41,
      recommendedTss: 290,
      targetDeltaLabel: "130 under",
    });
    expect(viewModel.timelineWeeks[0]?.sessions.map((session) => session.dayIndex)).toEqual([
      0, 2, 5,
    ]);
    expect(viewModel.dailyTrainingPathChart.weeks[0]).toMatchObject({
      label: "Week 1",
      plannedLoad: 120,
      targetLoad: 290,
      scheduledFitness: expect.any(Number),
      targetFitness: expect.any(Number),
    });
    expect(
      viewModel.dailyTrainingPathChart.dailyPoints.slice(0, 7).map((point) => ({
        date: point.date,
        targetLoadTss: point.targetLoadTss,
      })),
    ).toEqual([
      { date: "2026-01-05", targetLoadTss: 58 },
      { date: "2026-01-06", targetLoadTss: 58 },
      { date: "2026-01-07", targetLoadTss: 58 },
      { date: "2026-01-08", targetLoadTss: 58 },
      { date: "2026-01-09", targetLoadTss: 0 },
      { date: "2026-01-10", targetLoadTss: 58 },
      { date: "2026-01-11", targetLoadTss: 0 },
    ]);
    expect(viewModel.dailyTrainingPathChart.weeks[0]?.scheduledFitness ?? 0).toBeGreaterThan(30);
    expect(viewModel.dailyTrainingPathChart.weeks[0]?.targetFitness ?? 0).toBeGreaterThan(30);
  });
});
