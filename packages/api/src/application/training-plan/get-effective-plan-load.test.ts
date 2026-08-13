import {
  type ActivityObservationQuantification,
  type ActivityPrescriptionQuantification,
  activityObservationQuantificationSchema,
  activityPrescriptionQuantificationSchema,
  createActivityPlanPrescriptionQuantificationBundle,
  createActivityQuantificationCalculationIdentity,
  createActivityQuantificationEvidenceIdentity,
  createCompletedActivityQuantificationSubjectIdentity,
  createObservationQuantificationBundle,
  createPlanActivityQuantificationSubjectIdentity,
  createPlanOccurrenceActivityQuantificationSubjectIdentity,
} from "@repo/core";
import {
  type CommonLoadResult,
  calculateAvailableCommonLoad,
  commonLoadResultSchema,
} from "@repo/core/load";
import { relationalSchema } from "@repo/db";
import { drizzle } from "drizzle-orm/node-postgres";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EventReadRepository } from "../../repositories";
import {
  getEffectivePlanLoad,
  getEffectivePlanLoadInputSchema,
  MAX_EFFECTIVE_PLAN_LOAD_RANGE_DAYS,
} from "./get-effective-plan-load";

const activityAnalysis = vi.hoisted(() => ({
  buildActivityDerivedSummaries: vi.fn(),
  loadActivitySegmentsByActivityId: vi.fn(),
}));
const activityPlanMetrics = vi.hoisted(() => ({
  estimateActivityPlans: vi.fn(async (): Promise<unknown[]> => []),
}));

vi.mock("../../lib/activity-analysis", () => activityAnalysis);
vi.mock("../activity-plans/estimate-activity-plans", () => activityPlanMetrics);

function quantification(input: {
  commonLoad: CommonLoadResult;
  id: string;
  kind: "observation";
}): ActivityObservationQuantification;
function quantification(input: {
  commonLoad: CommonLoadResult;
  id: string;
  kind: "prescription";
}): ActivityPrescriptionQuantification;
function quantification(input: {
  commonLoad: CommonLoadResult;
  id: string;
  kind: "observation" | "prescription";
}) {
  const durationSeconds = input.commonLoad.contributingDurationSeconds ?? 1800;
  const segmentId = `${input.id}-segment`;
  const subjectIdentity =
    input.kind === "observation"
      ? createCompletedActivityQuantificationSubjectIdentity({ activityId: input.id })
      : createPlanOccurrenceActivityQuantificationSubjectIdentity({
          occurrenceId: `${input.id}-occurrence`,
          parentSubjectIdentity: createPlanActivityQuantificationSubjectIdentity({
            planId: input.id,
          }),
        });
  const shared = {
    subjectIdentity,
    evidenceIdentity: createActivityQuantificationEvidenceIdentity({
      evidenceType: input.kind === "observation" ? "segment_facts" : "plan_revision",
      sourceIds: input.kind === "observation" ? [input.id, segmentId] : [input.id],
      revisionFingerprint: `revision-${input.id}`,
      details: { kind: input.kind, id: input.id },
    }),
    calculationIdentity: createActivityQuantificationCalculationIdentity({
      model: input.commonLoad.model,
      version: input.commonLoad.version,
      computedAt: input.commonLoad.computedAsOf,
      calibrationEvidenceFingerprint: input.commonLoad.evidenceFingerprint,
    }),
    activity_category: input.commonLoad.activity_category,
    duration: {
      elapsed: {
        status: "available",
        evidenceRole: input.kind === "observation" ? "measured" : "prescribed",
        value: durationSeconds,
        unit: "seconds",
      },
      active: {
        status: "available",
        evidenceRole: input.kind === "observation" ? "measured" : "prescribed",
        value: durationSeconds,
        unit: "seconds",
      },
      moving: {
        status: "available",
        evidenceRole: input.kind === "observation" ? "measured" : "prescribed",
        value: durationSeconds,
        unit: "seconds",
      },
    },
    distance: {
      status: "unavailable",
      evidenceRole: input.kind === "observation" ? "measured" : "prescribed",
      value: null,
      unit: "meters",
      reason: input.kind === "observation" ? "not_observed" : "not_prescribed",
    },
    commonLoad: input.commonLoad,
  };
  return input.kind === "observation"
    ? activityObservationQuantificationSchema.parse({
        ...shared,
        kind: "observation",
        stage: "final",
        intensity: {
          observed: {
            status: "unavailable",
            evidenceRole: "measured",
            values: [],
            reason: "not_observed",
          },
        },
        completedProvenance: {
          activityId: input.id,
          segmentId,
          source: "unknown",
          artifactIdentity: null,
          providerIdentity: null,
          segmentRevision: null,
          observedAt: input.commonLoad.computedAsOf,
          computedAt: input.commonLoad.computedAsOf,
          calculationVersion: "effective-plan-load-test-v1",
        },
      })
    : activityPrescriptionQuantificationSchema.parse({
        ...shared,
        kind: "prescription",
        stage: "plan",
        intensity: {
          prescribed: {
            status: "unavailable",
            evidenceRole: "prescribed",
            values: [],
            reason: "not_authored",
          },
        },
      });
}

function unavailableLoad() {
  return commonLoadResultSchema.parse({
    status: "unavailable",
    model: "gradientpeak_relative_load",
    version: "1",
    activity_category: "bike",
    method: null,
    quality: null,
    thresholdEvidence: null,
    evidenceFingerprint: null,
    computedAsOf: "2026-07-20T12:00:00.000Z",
    contributingDurationSeconds: null,
    reason: "threshold_missing",
  });
}

function availableLoad() {
  return calculateAvailableCommonLoad({
    activity_category: "bike",
    method: "power_threshold",
    intensity: 1,
    contributingDurationSeconds: 1800,
    quality: {
      source: "manual",
      observed_at: "2026-07-01T00:00:00.000Z",
      valid_at: "2026-07-01T00:00:00.000Z",
      confidence: "high",
      stale: false,
      estimate: false,
      calculation_version: null,
      evidence_fingerprint: "ftp",
    },
    thresholdEvidence: {
      type: "ftp_watts",
      value: 250,
      unit: "watts",
      source: "manual",
      observedAt: "2026-07-01T00:00:00.000Z",
      validAt: "2026-07-01T00:00:00.000Z",
      freshness: "current",
      calculationVersion: null,
      sourceFingerprint: "ftp",
    },
    evidenceFingerprint: "recommendation-plan",
    computedAsOf: "2026-07-20T12:00:00.000Z",
    estimated: true,
  });
}

function effectivePlanRepository(
  getEffectivePlanLoadInputs: EventReadRepository["getEffectivePlanLoadInputs"],
): EventReadRepository {
  const unexpectedCall = async () => {
    throw new Error("Unexpected EventReadRepository call in effective Plan Load test");
  };
  return {
    getEffectivePlanLoadInputs,
    countOwnedEventsInRange: unexpectedCall,
    getOwnedEventById: unexpectedCall,
    listCompletedActivitiesInRange: unexpectedCall,
    listCalendarCompletedActivities: unexpectedCall,
    listCalendarGoals: unexpectedCall,
    listCalendarGroupActivityPlans: unexpectedCall,
    listPlannedEventDatesInRange: unexpectedCall,
    listOwnedPlannedEventsForDay: unexpectedCall,
    getValidateConstraintsInputs: unexpectedCall,
    getAccessibleTrainingPlanProjection: unexpectedCall,
    listOwnedEvents: unexpectedCall,
  };
}

describe("getEffectivePlanLoad", () => {
  beforeEach(() => {
    activityPlanMetrics.estimateActivityPlans.mockReset();
    activityPlanMetrics.estimateActivityPlans.mockResolvedValue([]);
  });

  it("accepts a server-derived current week or a bounded date range", () => {
    expect(getEffectivePlanLoadInputSchema.safeParse({}).success).toBe(true);
    expect(
      getEffectivePlanLoadInputSchema.safeParse({
        startDate: "2026-07-23",
        endDate: "2026-07-24",
      }).success,
    ).toBe(true);
    expect(
      getEffectivePlanLoadInputSchema.safeParse({
        startDate: "2026-07-24",
        endDate: "2026-07-23",
        scheduledItems: [],
      }).success,
    ).toBe(false);
    expect(getEffectivePlanLoadInputSchema.safeParse({ startDate: "2026-07-23" }).success).toBe(
      false,
    );
    expect(
      getEffectivePlanLoadInputSchema.safeParse({
        startDate: "2026-02-30",
        endDate: "2026-03-01",
      }).success,
    ).toBe(false);
    expect(
      getEffectivePlanLoadInputSchema.safeParse({
        startDate: "2026-01-01",
        endDate: "2026-03-31",
      }).success,
    ).toBe(true);
    const overLimit = getEffectivePlanLoadInputSchema.safeParse({
      startDate: "2026-01-01",
      endDate: "2026-04-01",
    });
    expect(overLimit.success).toBe(false);
    if (!overLimit.success) {
      expect(overLimit.error.issues).toContainEqual(
        expect.objectContaining({
          message: `Effective Load ranges cannot exceed ${MAX_EFFECTIVE_PLAN_LOAD_RANGE_DAYS} days`,
          path: ["endDate"],
        }),
      );
    }
  });

  it("does not turn a missing profile timezone into zero Load", async () => {
    const getEffectivePlanLoadInputs = vi.fn().mockResolvedValue({
      activities: [],
      events: [],
      recommendationEvents: [],
      recommendationSource: { scheduleBatchId: null, status: "complete", trainingPlanId: null },
      planningTimezone: null,
      resolvedRange: { startDate: null, endDate: null },
      sourceCounts: { activities: 0, events: 0 },
      sourceCoverage: { activities: null, scheduledItems: null },
    });
    const result = await getEffectivePlanLoad({
      db: {} as never,
      profileId: "profile-1",
      repository: { getEffectivePlanLoadInputs } as never,
      request: { startDate: "2026-07-23", endDate: "2026-07-24" },
    });

    expect(getEffectivePlanLoadInputs).toHaveBeenCalledWith({
      asOf: expect.any(Date),
      profileId: "profile-1",
      startDate: "2026-07-23",
      endDate: "2026-07-24",
    });
    expect(result).toMatchObject({ status: "unavailable", reason: "planning_timezone_missing" });
  });

  it("uses the derived parent summary once for a multi-segment completed activity", async () => {
    const getEffectivePlanLoadInputs = vi.fn().mockResolvedValue({
      activities: [{ id: "activity-1", started_at: new Date("2026-07-20T12:00:00.000Z") }],
      events: [],
      recommendationEvents: [],
      recommendationSource: { scheduleBatchId: null, status: "complete", trainingPlanId: null },
      planningTimezone: "UTC",
      resolvedRange: { startDate: "2026-07-20", endDate: "2026-07-26" },
      sourceCounts: { activities: 1, events: 0 },
      sourceCoverage: {
        activities: { startDate: "2026-07-20", endDate: "2026-07-26", status: "complete" },
        scheduledItems: { startDate: "2026-07-20", endDate: "2026-07-26", status: "complete" },
      },
    });
    activityAnalysis.loadActivitySegmentsByActivityId.mockResolvedValue(new Map());
    const memberQuantifications = [
      activityObservationQuantificationSchema.parse(
        quantification({ commonLoad: unavailableLoad(), id: "segment-1", kind: "observation" }),
      ),
      activityObservationQuantificationSchema.parse(
        quantification({ commonLoad: unavailableLoad(), id: "segment-2", kind: "observation" }),
      ),
    ];
    const parentQuantification = createObservationQuantificationBundle({
      members: memberQuantifications,
    });
    activityAnalysis.buildActivityDerivedSummaries.mockResolvedValue({
      parent: new Map([
        [
          "activity-1",
          {
            common_load: parentQuantification.summary.commonLoad,
            observationQuantification: parentQuantification,
          },
        ],
      ]),
      segments: [{ activity_id: "activity-1" }, { activity_id: "activity-1" }],
    });

    const result = await getEffectivePlanLoad({
      asOf: new Date("2026-07-20T12:00:00.000Z"),
      db: {} as never,
      profileId: "profile-1",
      repository: { getEffectivePlanLoadInputs } as never,
      request: {},
    });

    expect(activityAnalysis.buildActivityDerivedSummaries).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      status: "available",
      resolvedRange: { startDate: "2026-07-20", endDate: "2026-07-26", timezone: "UTC" },
      effective: {
        firmItems: [
          {
            kind: "completed",
            completedActivityId: "activity-1",
            commonLoad: { reason: "no_load_data" },
            observationQuantification: {
              summary: { kind: "aggregate" },
            },
          },
        ],
      },
      completedObservationQuantification: {
        summary: { memberSubjectIdentities: expect.any(Array) },
      },
    });
    expect(
      result.status === "available" &&
        result.completedObservationQuantification?.summary.memberSubjectIdentities,
    ).toHaveLength(2);
  });

  it("assigns scheduled items to their persisted scheduled date, not their event instant", async () => {
    const getEffectivePlanLoadInputs = vi.fn().mockResolvedValue({
      activities: [],
      events: [
        {
          id: "event-1",
          activity_plan_id: null,
          linked_activity_id: null,
          scheduled_date: "2026-07-21",
          starts_at: "2026-07-18T00:00:00.000Z",
          status: "scheduled",
        },
      ],
      recommendationEvents: [],
      recommendationSource: { scheduleBatchId: null, status: "complete", trainingPlanId: null },
      planningTimezone: "America/Los_Angeles",
      resolvedRange: { startDate: "2026-07-19", endDate: "2026-07-25" },
      sourceCounts: { activities: 0, events: 1 },
      sourceCoverage: {
        activities: { startDate: "2026-07-19", endDate: "2026-07-25", status: "complete" },
        scheduledItems: { startDate: "2026-07-19", endDate: "2026-07-25", status: "complete" },
      },
    });
    activityAnalysis.loadActivitySegmentsByActivityId.mockResolvedValue(new Map());
    activityAnalysis.buildActivityDerivedSummaries.mockResolvedValue({
      parent: new Map(),
      segments: [],
    });

    const result = await getEffectivePlanLoad({
      asOf: new Date("2026-07-20T12:00:00.000Z"),
      db: {} as never,
      profileId: "profile-1",
      repository: { getEffectivePlanLoadInputs } as never,
      request: { startDate: "2026-07-19", endDate: "2026-07-25" },
    });

    expect(result).toMatchObject({
      status: "available",
      effective: {
        firmItems: [{ kind: "scheduled", scheduledItemId: "event-1", date: "2026-07-21" }],
      },
    });
  });

  it("quantifies a default-going group event as normal scheduled load", async () => {
    const activityPlanId = "22222222-2222-4222-8222-222222222222";
    const groupEventId = "11111111-1111-4111-8111-111111111111";
    const prescriptionQuantification = createActivityPlanPrescriptionQuantificationBundle({
      members: [
        quantification({ commonLoad: availableLoad(), id: activityPlanId, kind: "prescription" }),
      ],
    });
    const getEffectivePlanLoadInputs = vi.fn().mockResolvedValue({
      activities: [],
      events: [
        {
          id: groupEventId,
          activity_plan: { id: activityPlanId },
          activity_plan_id: activityPlanId,
          linked_activity_id: null,
          scheduled_date: "2026-07-21",
          starts_at: "2026-07-21T07:00:00.000Z",
          status: "scheduled",
          training_plan_id: null,
        },
      ],
      recommendationEvents: [],
      recommendationSource: { scheduleBatchId: null, status: "complete", trainingPlanId: null },
      planningTimezone: "UTC",
      resolvedRange: { startDate: "2026-07-20", endDate: "2026-07-26" },
      sourceCounts: { activities: 0, events: 1 },
      sourceCoverage: {
        activities: { startDate: "2026-07-20", endDate: "2026-07-26", status: "complete" },
        scheduledItems: { startDate: "2026-07-20", endDate: "2026-07-26", status: "complete" },
      },
    });
    activityAnalysis.loadActivitySegmentsByActivityId.mockResolvedValue(new Map());
    activityAnalysis.buildActivityDerivedSummaries.mockResolvedValue({
      parent: new Map(),
      segments: [],
    });
    activityPlanMetrics.estimateActivityPlans.mockResolvedValue([
      { id: activityPlanId, prescriptionQuantification },
    ]);

    const result = await getEffectivePlanLoad({
      asOf: new Date("2026-07-20T12:00:00.000Z"),
      db: {} as never,
      profileId: "profile-1",
      repository: { getEffectivePlanLoadInputs } as never,
      request: { startDate: "2026-07-20", endDate: "2026-07-26" },
    });

    expect(result).toMatchObject({
      status: "available",
      remaining: { status: "complete", load: 50 },
      effective: {
        firmItems: [
          {
            kind: "scheduled",
            scheduledItemId: groupEventId,
            date: "2026-07-21",
            commonLoad: { status: "complete", load: 50 },
          },
        ],
      },
    });
  });

  it("queries a shifted linked completion on its actual day without reviving Load on its scheduled day", async () => {
    const activityId = "11111111-1111-4111-8111-111111111111";
    const eventId = "22222222-2222-4222-8222-222222222222";
    const activityPlanId = "33333333-3333-4333-8333-333333333333";
    const activity = {
      id: activityId,
      started_at: new Date("2026-07-23T12:00:00.000Z"),
    };
    const event = {
      id: eventId,
      activity_plan: { id: activityPlanId },
      activity_plan_id: activityPlanId,
      linked_activity_id: activityId,
      scheduled_date: "2026-07-24",
      status: "completed",
    };
    const factsForDay = (date: string, events: (typeof event)[]) => ({
      // The repository keeps a one-day instant envelope for timezone boundaries. The application
      // still filters this shifted activity from the scheduled day's completedActivities array.
      activities: [activity],
      events,
      recommendationEvents: [],
      recommendationSource: {
        scheduleBatchId: null,
        status: "complete" as const,
        trainingPlanId: null,
      },
      planningTimezone: "UTC",
      resolvedRange: { startDate: date, endDate: date },
      sourceCounts: { activities: 1, events: events.length },
      sourceCoverage: {
        activities: { startDate: date, endDate: date, status: "complete" as const },
        scheduledItems: { startDate: date, endDate: date, status: "complete" as const },
      },
    });
    const getEffectivePlanLoadInputs = vi
      .fn()
      .mockResolvedValueOnce(factsForDay("2026-07-23", []))
      .mockResolvedValueOnce(factsForDay("2026-07-24", [event]));
    const repository = effectivePlanRepository(getEffectivePlanLoadInputs);
    const completedQuantification = quantification({
      commonLoad: availableLoad(),
      id: activityId,
      kind: "observation",
    });
    const plannedQuantification = quantification({
      commonLoad: availableLoad(),
      id: activityPlanId,
      kind: "prescription",
    });
    activityAnalysis.loadActivitySegmentsByActivityId.mockResolvedValue(new Map());
    activityAnalysis.buildActivityDerivedSummaries.mockResolvedValue({
      parent: new Map([
        [
          activityId,
          {
            observationQuantification: createObservationQuantificationBundle({
              members: [completedQuantification],
            }),
          },
        ],
      ]),
      segments: [],
    });
    activityPlanMetrics.estimateActivityPlans.mockResolvedValue([
      {
        id: activityPlanId,
        prescriptionQuantification: createActivityPlanPrescriptionQuantificationBundle({
          members: [plannedQuantification],
        }),
      },
    ]);
    // All persistence collaborators are mocked; this inert client is constructed only to retain
    // the production Drizzle type without an unsafe test cast and is never queried or connected.
    const testDb = drizzle({
      connection: "postgresql://test:test@127.0.0.1:1/unused",
      schema: relationalSchema,
      casing: "snake_case",
    });
    const commonInput = {
      asOf: new Date("2026-07-23T18:00:00.000Z"),
      db: testDb,
      profileId: "profile-1",
      repository,
    };

    const actualDay = await getEffectivePlanLoad({
      ...commonInput,
      request: { startDate: "2026-07-23", endDate: "2026-07-23" },
    });
    const scheduledDay = await getEffectivePlanLoad({
      ...commonInput,
      request: { startDate: "2026-07-24", endDate: "2026-07-24" },
    });
    await testDb.$client.end();

    expect(getEffectivePlanLoadInputs).toHaveBeenNthCalledWith(1, {
      asOf: commonInput.asOf,
      profileId: "profile-1",
      startDate: "2026-07-23",
      endDate: "2026-07-23",
    });
    expect(getEffectivePlanLoadInputs).toHaveBeenNthCalledWith(2, {
      asOf: commonInput.asOf,
      profileId: "profile-1",
      startDate: "2026-07-24",
      endDate: "2026-07-24",
    });
    expect(actualDay).toMatchObject({
      status: "available",
      effective: {
        firmItems: [
          {
            kind: "completed",
            completedActivityId: activityId,
            date: "2026-07-23",
          },
        ],
        firm: { status: "complete", commonLoad: { load: 50, totalActivityCount: 1 } },
      },
    });
    expect(scheduledDay).toMatchObject({
      status: "available",
      effective: { firmItems: [], firm: { status: "known_zero", load: 0 } },
    });
    if (
      actualDay.status !== "available" ||
      scheduledDay.status !== "available" ||
      actualDay.effective.status !== "available" ||
      scheduledDay.effective.status !== "available"
    ) {
      throw new Error("Expected both daily effective Plan Load queries to be available");
    }
    expect(actualDay.effective.firmItems.length + scheduledDay.effective.firmItems.length).toBe(1);
  });

  it("rejects a scheduled quantification with an incompatible Common Load identity", async () => {
    const activityPlanId = "22222222-2222-4222-8222-222222222222";
    const planQuantification = quantification({
      commonLoad: availableLoad(),
      id: activityPlanId,
      kind: "prescription",
    });
    const planBundle = createActivityPlanPrescriptionQuantificationBundle({
      members: [planQuantification],
    });
    const incompatibleQuantification = {
      ...planBundle,
      summary: {
        ...planBundle.summary,
        commonLoad: { ...planBundle.summary.commonLoad, version: "future" },
      },
    };
    const getEffectivePlanLoadInputs = vi.fn().mockResolvedValue({
      activities: [],
      events: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          activity_plan: { id: activityPlanId },
          activity_plan_id: activityPlanId,
          linked_activity_id: null,
          scheduled_date: "2026-07-21",
          status: "scheduled",
        },
      ],
      recommendationEvents: [],
      recommendationSource: { scheduleBatchId: null, status: "complete", trainingPlanId: null },
      planningTimezone: "UTC",
      resolvedRange: { startDate: "2026-07-20", endDate: "2026-07-26" },
      sourceCounts: { activities: 0, events: 1 },
      sourceCoverage: {
        activities: { startDate: "2026-07-20", endDate: "2026-07-26", status: "complete" },
        scheduledItems: { startDate: "2026-07-20", endDate: "2026-07-26", status: "complete" },
      },
    });
    activityAnalysis.loadActivitySegmentsByActivityId.mockResolvedValue(new Map());
    activityAnalysis.buildActivityDerivedSummaries.mockResolvedValue({
      parent: new Map(),
      segments: [],
    });
    activityPlanMetrics.estimateActivityPlans.mockResolvedValue([
      {
        id: activityPlanId,
        prescriptionQuantification: incompatibleQuantification,
      },
    ]);

    const result = await getEffectivePlanLoad({
      asOf: new Date("2026-07-20T12:00:00.000Z"),
      db: {} as never,
      profileId: "profile-1",
      repository: { getEffectivePlanLoadInputs } as never,
      request: {},
    });

    expect(result).toMatchObject({
      status: "unavailable",
      reason: "incompatible_common_load_identity",
    });
  });

  it("keeps a cancelled execution in the original versioned recommendation target", async () => {
    const eventId = "11111111-1111-4111-8111-111111111111";
    const activityPlanId = "22222222-2222-4222-8222-222222222222";
    const trainingPlanId = "33333333-3333-4333-8333-333333333333";
    const activityPlan = { id: activityPlanId };
    const commonLoad = availableLoad();
    const planQuantification = quantification({
      commonLoad,
      id: activityPlanId,
      kind: "prescription",
    });
    const recommendationEvent = {
      id: eventId,
      activity_plan: activityPlan,
      activity_plan_id: activityPlanId,
      linked_activity_id: null,
      original_starts_at: "2026-07-22T07:00:00.000Z",
      scheduled_date: "2026-07-24",
      starts_at: "2026-07-24T07:00:00.000Z",
      status: "cancelled",
      training_plan_id: trainingPlanId,
    };
    const getEffectivePlanLoadInputs = vi.fn().mockResolvedValue({
      activities: [],
      events: [],
      recommendationEvents: [recommendationEvent],
      recommendationSource: {
        scheduleBatchId: null,
        status: "complete",
        trainingPlanId,
      },
      planningTimezone: "UTC",
      resolvedRange: { startDate: "2026-07-20", endDate: "2026-07-26" },
      sourceCounts: { activities: 0, events: 0 },
      sourceCoverage: {
        activities: { startDate: "2026-07-20", endDate: "2026-07-26", status: "complete" },
        scheduledItems: {
          startDate: "2026-07-20",
          endDate: "2026-07-26",
          status: "complete",
        },
      },
    });
    activityAnalysis.loadActivitySegmentsByActivityId.mockResolvedValue(new Map());
    activityAnalysis.buildActivityDerivedSummaries.mockResolvedValue({
      parent: new Map(),
      segments: [],
    });
    activityPlanMetrics.estimateActivityPlans.mockResolvedValue([
      {
        id: activityPlanId,
        common_load: commonLoad,
        prescriptionQuantification: createActivityPlanPrescriptionQuantificationBundle({
          members: [planQuantification],
        }),
      },
    ]);

    const result = await getEffectivePlanLoad({
      asOf: new Date("2026-07-20T12:00:00.000Z"),
      db: {} as never,
      profileId: "profile-1",
      repository: { getEffectivePlanLoadInputs } as never,
      request: { startDate: "2026-07-20", endDate: "2026-07-26" },
    });

    expect(result).toMatchObject({
      status: "available",
      recommendation: {
        status: "complete",
        policyVersion: "common_load_recommendation_v1",
        model: "gradientpeak_relative_load",
        version: "1",
        trainingPlanId,
        coverage: { startDate: "2026-07-20", endDate: "2026-07-22" },
        points: [
          { date: "2026-07-20", state: "known_zero", load: 0 },
          { date: "2026-07-21", state: "known_zero", load: 0 },
          { date: "2026-07-22", state: "complete", load: 50 },
        ],
      },
    });
  });
});
