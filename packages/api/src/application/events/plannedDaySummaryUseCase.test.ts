import type { CommonLoadAggregate } from "@repo/core";
import {
  activityPlanDocumentSchema,
  activityPrescriptionQuantificationSchema,
  commonLoadResultSchema,
  createActivityPlanPrescriptionQuantificationBundle,
  createActivityQuantificationCalculationIdentity,
  createActivityQuantificationEvidenceIdentity,
  createPlanActivityQuantificationSubjectIdentity,
  createPlanOccurrenceActivityQuantificationSubjectIdentity,
  resolveActivityPlanVariant,
} from "@repo/core";
import { describe, expect, it } from "vitest";
import type {
  PlannedDaySummaryActivityPlanRecord,
  PlannedDaySummaryEventRecord,
  PlannedDaySummaryReadInput,
} from "../../repositories";
import {
  MAX_PLANNED_DAY_SUMMARY_EVENTS,
  PlannedDaySummaryLimitExceededError,
  plannedDaySummaryUseCase,
} from "./plannedDaySummaryUseCase";

function structure(activity_category: "bike" | "run", segmentCount = 1) {
  return {
    version: 3,
    activity_category,
    segments: Array.from({ length: segmentCount }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      role: "activity" as const,
      name: activity_category,
      intervals: [
        {
          id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
          name: "Main",
          repetitions: 1,
          steps: [
            {
              id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
              name: "Step",
              duration: { type: "time" as const, seconds: 600 },
              targets: [{ type: "RPE" as const, intensity: 5 }],
            },
          ],
        },
      ],
    })),
  };
}

function plan(id: string, planStructure: unknown): PlannedDaySummaryActivityPlanRecord {
  return {
    id,
    profile_id: "actor-1",
    name: id,
    description: null,
    structure: activityPlanDocumentSchema.parse({
      contractVersion: 1,
      defaultVariantId: "00000000-0000-4000-8000-000000000099",
      variants: [
        {
          id: "00000000-0000-4000-8000-000000000099",
          name: "Base",
          structure: planStructure,
        },
      ],
    }),
    gps_recording_enabled: false,
    structure_hash: `hash-${id}`,
    updated_at: new Date("2026-07-27T00:00:00.000Z"),
  };
}

function invalidPlan(id: string, planStructure: unknown): PlannedDaySummaryActivityPlanRecord {
  return {
    ...plan(id, structure("bike")),
    structure: planStructure as PlannedDaySummaryActivityPlanRecord["structure"],
  };
}

function event(
  id: string,
  activityPlan: PlannedDaySummaryActivityPlanRecord | null,
  activityPlanId = activityPlan?.id ?? null,
): PlannedDaySummaryEventRecord {
  return {
    id,
    activity_plan_id: activityPlanId,
    activity_plan: activityPlan,
    starts_at: "2026-07-27T00:00:00.000Z",
  };
}

function commonLoad(
  load: number | null,
  status: "complete" | "partial" | "unavailable" = "complete",
): CommonLoadAggregate {
  if (status === "unavailable") {
    return {
      status,
      model: "gradientpeak_relative_load",
      version: "1",
      contributingDurationSeconds: 0,
      knownDurationSeconds: null,
      contributingActivityCount: 0,
      partialActivityCount: 0,
      unavailableActivityCount: 1,
      totalActivityCount: 1,
      activityCountCoverage: 0,
      knownDurationCoverage: null,
      unknownDurationActivityCount: 1,
      reason: "duration_missing",
    };
  }

  const contributingDurationSeconds = status === "partial" ? 1800 : 3600;
  const knownDurationSeconds = 3600;
  const intensity = Math.sqrt((load ?? 0) / ((contributingDurationSeconds / 3600) * 100));
  return {
    status,
    model: "gradientpeak_relative_load",
    version: "1",
    load: load ?? 0,
    intensity,
    contributingDurationSeconds,
    knownDurationSeconds,
    contributingActivityCount: 1,
    partialActivityCount: status === "partial" ? 1 : 0,
    unavailableActivityCount: 0,
    totalActivityCount: 1,
    activityCountCoverage: 1,
    knownDurationCoverage: status === "partial" ? 0.5 : 1,
    unknownDurationActivityCount: 0,
  };
}

async function summarize(
  events: PlannedDaySummaryEventRecord[],
  estimates: Record<
    string,
    { estimated_duration: number | null; common_load: CommonLoadAggregate }
  > = {},
) {
  let readInput: PlannedDaySummaryReadInput | undefined;
  const result = await plannedDaySummaryUseCase({
    date: "2026-07-27",
    profileId: "actor-1",
    repository: {
      async listOwnedPlannedEventsForDay(input) {
        readInput = input;
        return events;
      },
    },
    deriveMetrics: async (plans) =>
      plans.map((plan) => {
        const estimate = estimates[plan.id] ?? {
          estimated_duration: 3600,
          common_load: commonLoad(72),
        };
        const aggregate = estimate.common_load;
        const sourceStructure = resolveActivityPlanVariant(
          activityPlanDocumentSchema.parse(plan.structure),
        ).structure;
        const category = sourceStructure.activity_category === "run" ? "run" : "bike";
        const method = category === "run" ? "run_pace_threshold" : "power_threshold";
        const quality = {
          source: "estimated" as const,
          observed_at: "2026-07-27T00:00:00.000Z",
          valid_at: "2026-07-27T00:00:00.000Z",
          confidence: "low" as const,
          stale: false,
          estimate: true,
          calculation_version: "test",
          evidence_fingerprint: `quality-${plan.id}`,
        };
        const thresholdEvidence = {
          ...(category === "run"
            ? {
                type: "threshold_speed_mps" as const,
                value: 4,
                unit: "meters_per_second" as const,
              }
            : { type: "ftp_watts" as const, value: 250, unit: "watts" as const }),
          source: "estimated" as const,
          observedAt: "2026-07-27T00:00:00.000Z",
          validAt: "2026-07-27T00:00:00.000Z",
          freshness: "current" as const,
          calculationVersion: "test",
          sourceFingerprint: `threshold-${plan.id}`,
        };
        const commonLoadResult = commonLoadResultSchema.parse(
          aggregate.status === "unavailable"
            ? {
                status: "unavailable",
                model: aggregate.model,
                version: aggregate.version,
                activity_category: category,
                method: null,
                quality: null,
                thresholdEvidence: null,
                evidenceFingerprint: null,
                computedAsOf: "2026-07-27T00:00:00.000Z",
                contributingDurationSeconds: null,
                reason: "duration_missing",
              }
            : aggregate.status === "partial"
              ? {
                  status: "partial",
                  model: aggregate.model,
                  version: aggregate.version,
                  activity_category: category,
                  method,
                  quality,
                  thresholdEvidence,
                  evidenceFingerprint: `plan-${plan.id}`,
                  computedAsOf: "2026-07-27T00:00:00.000Z",
                  load: aggregate.load,
                  intensity: aggregate.intensity,
                  contributingDurationSeconds: aggregate.contributingDurationSeconds,
                  eligibleDurationSeconds: aggregate.knownDurationSeconds,
                  sourceTimeCoverage: aggregate.knownDurationCoverage,
                  reason: "duration_partial",
                }
              : {
                  status: "available",
                  model: aggregate.model,
                  version: aggregate.version,
                  activity_category: category,
                  method,
                  quality,
                  thresholdEvidence,
                  evidenceFingerprint: `plan-${plan.id}`,
                  computedAsOf: "2026-07-27T00:00:00.000Z",
                  load: aggregate.load,
                  intensity: aggregate.intensity,
                  contributingDurationSeconds: aggregate.contributingDurationSeconds,
                  estimated: true,
                },
        );
        const duration =
          estimate.estimated_duration === null
            ? {
                status: "unavailable" as const,
                evidenceRole: "estimated" as const,
                value: null,
                unit: "seconds" as const,
                reason: "source_missing" as const,
              }
            : {
                status: "available" as const,
                evidenceRole: "estimated" as const,
                value: estimate.estimated_duration,
                unit: "seconds" as const,
              };
        const planSubjectIdentity = createPlanActivityQuantificationSubjectIdentity({
          planId: plan.id,
        });
        const quantification = activityPrescriptionQuantificationSchema.parse({
          kind: "prescription",
          stage: "plan",
          subjectIdentity: createPlanOccurrenceActivityQuantificationSubjectIdentity({
            occurrenceId: `${plan.id}-occurrence`,
            parentSubjectIdentity: planSubjectIdentity,
          }),
          evidenceIdentity: createActivityQuantificationEvidenceIdentity({
            evidenceType: "plan_revision",
            sourceIds: [plan.id],
            revisionFingerprint: `revision-${plan.id}`,
            details: { planId: plan.id, category },
          }),
          calculationIdentity: createActivityQuantificationCalculationIdentity({
            model: commonLoadResult.model,
            version: commonLoadResult.version,
            computedAt: commonLoadResult.computedAsOf,
            calibrationEvidenceFingerprint: commonLoadResult.evidenceFingerprint,
          }),
          activity_category: category,
          duration: {
            elapsed: duration,
            active: duration,
            moving: duration,
          },
          distance: {
            status: "unavailable",
            evidenceRole: "estimated",
            value: null,
            unit: "meters",
            reason: "not_prescribed",
          },
          intensity: {
            prescribed: {
              status: "unavailable",
              evidenceRole: "prescribed",
              values: [],
              reason: "not_authored",
            },
          },
          commonLoad: commonLoadResult,
        });
        return {
          ...plan,
          prescriptionQuantification: createActivityPlanPrescriptionQuantificationBundle({
            members: [quantification],
          }),
        };
      }),
  });
  return { readInput, result };
}

describe("plannedDaySummaryUseCase", () => {
  it("returns an honest empty-day summary and actor-scoped bounded read", async () => {
    const { readInput, result } = await summarize([]);

    expect(readInput).toEqual({
      date: "2026-07-27",
      limit: MAX_PLANNED_DAY_SUMMARY_EVENTS + 1,
      profileId: "actor-1",
    });
    expect(result).toEqual({
      summary: {
        eventCount: 0,
        activity_categories: [],
        totalDurationSeconds: null,
        prescriptionQuantification: expect.objectContaining({
          summary: expect.objectContaining({ kind: "aggregate" }),
        }),
        commonLoad: expect.objectContaining({ status: "unavailable" }),
      },
      source: {
        complete: true,
        eventCount: 0,
        unavailableEstimateCount: 0,
        unavailablePlanCount: 0,
        unlinkedPlanCount: 0,
      },
    });
  });

  it("aggregates two same-day Bike and Run plans with stable activity_categories and known values", async () => {
    const bike = plan("plan-bike", structure("bike"));
    const run = plan("plan-run", structure("run"));
    const { result } = await summarize([event("bike", bike), event("run", run)], {
      "plan-bike": { estimated_duration: 3600, common_load: commonLoad(80) },
      "plan-run": { estimated_duration: 1800, common_load: commonLoad(40) },
    });

    expect(result.summary).toEqual({
      eventCount: 2,
      activity_categories: ["bike", "run"],
      totalDurationSeconds: 5400,
      prescriptionQuantification: expect.objectContaining({
        summary: expect.objectContaining({ kind: "aggregate" }),
      }),
      commonLoad: expect.objectContaining({ status: "complete", load: 120 }),
    });
  });

  it("contributes a repeated same-category plan only once to activity_categories", async () => {
    const bike = plan("plan-bike", structure("bike"));
    const { result } = await summarize([event("bike-1", bike), event("bike-2", bike)]);

    expect(result.summary.activity_categories).toEqual(["bike"]);
    expect(result.summary.eventCount).toBe(2);
    expect(result.summary.totalDurationSeconds).toBe(7200);
    expect(result.summary.commonLoad).toMatchObject({
      status: "complete",
      load: 144,
      totalActivityCount: 2,
    });
  });

  it("keeps aggregate estimates unknown rather than converting them to zero", async () => {
    const bike = plan("plan-bike", structure("bike"));
    const run = plan("plan-run", structure("run"));
    const { result } = await summarize([event("bike", bike), event("run", run)], {
      "plan-bike": { estimated_duration: null, common_load: commonLoad(80, "partial") },
      "plan-run": { estimated_duration: 1800, common_load: commonLoad(null, "unavailable") },
    });

    expect(result.summary.totalDurationSeconds).toBeNull();
    expect(result.summary.commonLoad).toMatchObject({ status: "partial", load: 80 });
    expect(result.source.unavailableEstimateCount).toBe(2);
  });

  it("counts mixed stored plans as unavailable", async () => {
    const legacy = invalidPlan("plan-legacy", {
      version: 3,
      segments: structure("bike", 2).segments.map((segment, index) => ({
        ...segment,
        activity_category: index === 0 ? "bike" : "run",
      })),
    });
    const { result } = await summarize([event("legacy", legacy)]);

    expect(result.summary).toMatchObject({
      eventCount: 1,
      activity_categories: ["other"],
    });
  });

  it("counts unavailable, invalid, and unlinked plans without exposing issues", async () => {
    const invalid = invalidPlan("plan-invalid", { version: 3, segments: [] });
    const { result } = await summarize([
      event("unavailable", null, "deleted-plan"),
      event("invalid", invalid),
      event("unlinked", null),
    ]);

    expect(result.summary).toMatchObject({
      eventCount: 3,
      activity_categories: ["other"],
      totalDurationSeconds: null,
      commonLoad: expect.objectContaining({ status: "unavailable" }),
    });
    expect(result.source).toEqual({
      complete: true,
      eventCount: 3,
      unavailableEstimateCount: 3,
      unavailablePlanCount: 2,
      unlinkedPlanCount: 1,
    });
    expect(JSON.stringify(result)).not.toContain("issues");
  });

  it("uses scheduled and completed Events' planned estimates after the repository excludes cancelled Events", async () => {
    const bike = plan("plan-bike", structure("bike"));
    const run = plan("plan-run", structure("run"));
    const { result } = await summarize([event("scheduled", bike), event("completed", run)], {
      "plan-bike": { estimated_duration: 3600, common_load: commonLoad(80) },
      "plan-run": { estimated_duration: 1800, common_load: commonLoad(40) },
    });

    expect(result.summary).toMatchObject({
      eventCount: 2,
      totalDurationSeconds: 5400,
      commonLoad: expect.objectContaining({ status: "complete", load: 120 }),
    });
  });

  it("rejects an over-limit day instead of truncating it", async () => {
    const events = Array.from({ length: MAX_PLANNED_DAY_SUMMARY_EVENTS + 1 }, (_, index) =>
      event(`event-${index}`, null),
    );

    await expect(summarize(events)).rejects.toBeInstanceOf(PlannedDaySummaryLimitExceededError);
  });
});
