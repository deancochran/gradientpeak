import {
  activityPrescriptionQuantificationSchema,
  type CommonLoadResult,
  compileActivityPlan,
  createActivityPlanPrescriptionQuantificationBundle,
  createActivityQuantificationCalculationIdentity,
  createActivityQuantificationEvidenceIdentity,
  createPlanActivityQuantificationSubjectIdentity,
  createPlanOccurrenceActivityQuantificationSubjectIdentity,
  SYSTEM_TEMPLATES,
} from "@repo/core";
import { describe, expect, it, vi } from "vitest";
import {
  buildScheduleGapActivityPlanMatches,
  loadOwnedActivityPlansForScheduleGap,
} from "./scheduleGapActivityPlanMatches";

function structureForActivityCategory(activity_category: "run" | "bike") {
  const template = SYSTEM_TEMPLATES.find(
    (candidate) => compileActivityPlan(candidate.structure).activity_category === activity_category,
  );
  if (!template) throw new Error(`Missing ${activity_category} system template`);
  return template.structure;
}

function availableCommonLoad(
  load: number,
  activity_category: "bike" | "run" = "bike",
): CommonLoadResult {
  const thresholdEvidence =
    activity_category === "bike"
      ? ({ type: "ftp_watts", value: 250, unit: "watts" } as const)
      : ({ type: "threshold_speed_mps", value: 4, unit: "meters_per_second" } as const);
  return {
    status: "available",
    model: "gradientpeak_relative_load",
    version: "1",
    activity_category,
    method: activity_category === "bike" ? "power_threshold" : "run_pace_threshold",
    load,
    intensity: Math.sqrt(load / 100),
    contributingDurationSeconds: 3600,
    quality: {
      source: "manual",
      observed_at: "2026-07-18T00:00:00.000Z",
      valid_at: "2026-07-18T00:00:00.000Z",
      confidence: "high",
      stale: false,
      estimate: false,
      calculation_version: "1",
      evidence_fingerprint: "fixture",
    },
    thresholdEvidence: {
      ...thresholdEvidence,
      source: "manual",
      observedAt: "2026-07-18T00:00:00.000Z",
      validAt: "2026-07-18T00:00:00.000Z",
      freshness: "current",
      calculationVersion: "1",
      sourceFingerprint: "fixture",
    },
    evidenceFingerprint: "fixture",
    computedAsOf: "2026-07-18T00:00:00.000Z",
    estimated: true,
  };
}

function prescriptionQuantification(planId: string, commonLoad: CommonLoadResult) {
  const planSubjectIdentity = createPlanActivityQuantificationSubjectIdentity({ planId });
  const member = activityPrescriptionQuantificationSchema.parse({
    kind: "prescription",
    stage: "plan",
    subjectIdentity: createPlanOccurrenceActivityQuantificationSubjectIdentity({
      occurrenceId: `${planId}-occurrence`,
      parentSubjectIdentity: planSubjectIdentity,
    }),
    evidenceIdentity: createActivityQuantificationEvidenceIdentity({
      evidenceType: "plan_revision",
      sourceIds: [planId],
      revisionFingerprint: `revision-${planId}`,
      details: { planId },
    }),
    calculationIdentity: createActivityQuantificationCalculationIdentity({
      model: commonLoad.model,
      version: commonLoad.version,
      computedAt: commonLoad.computedAsOf,
      calibrationEvidenceFingerprint: commonLoad.evidenceFingerprint,
    }),
    activity_category: commonLoad.activity_category,
    duration: {
      elapsed: {
        status: "available",
        evidenceRole: "prescribed",
        value: 3600,
        unit: "seconds",
      },
      active: {
        status: "available",
        evidenceRole: "prescribed",
        value: 3600,
        unit: "seconds",
      },
      moving: {
        status: "unavailable",
        evidenceRole: "prescribed",
        value: null,
        unit: "seconds",
        reason: "not_prescribed",
      },
    },
    distance: {
      status: "unavailable",
      evidenceRole: "prescribed",
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
    commonLoad,
  });
  return createActivityPlanPrescriptionQuantificationBundle({ members: [member] });
}

function unavailableCommonLoad(): CommonLoadResult {
  return {
    status: "unavailable",
    model: "gradientpeak_relative_load",
    version: "1",
    activity_category: "bike",
    method: null,
    quality: null,
    thresholdEvidence: null,
    evidenceFingerprint: null,
    computedAsOf: "2026-07-18T00:00:00.000Z",
    contributingDurationSeconds: null,
    reason: "threshold_missing",
  };
}

describe("schedule-gap activity plan loading", () => {
  it("loads canonical plans without direct estimation-cache SQL", async () => {
    const execute = vi.fn(async (_query: unknown) => ({
      rows: [
        { id: "plan-1", profile_id: "profile-1", structure: structureForActivityCategory("run") },
      ],
    }));
    const result = await loadOwnedActivityPlansForScheduleGap({
      db: { execute } as any,
      profileId: "profile-1",
    });

    expect(result).toEqual([
      { id: "plan-1", profile_id: "profile-1", structure: structureForActivityCategory("run") },
    ]);
    const sqlTree = JSON.stringify(execute.mock.calls[0]?.[0]);
    expect(sqlTree).toContain("activity_plans");
    expect(sqlTree).not.toContain("activity_plan_derived_metrics_cache");
  });

  it("does not match a plan with unavailable authoritative TSS", () => {
    const result = buildScheduleGapActivityPlanMatches({
      targetDate: "2026-07-20",
      targetLoadDelta: 70,
      primaryActivityCategory: "bike",
      today: "2026-07-18",
      plans: [
        {
          id: "plan-1",
          name: "Stale plan",
          structure: structureForActivityCategory("bike"),
          prescriptionQuantification: prescriptionQuantification("plan-1", unavailableCommonLoad()),
        },
      ],
    });

    expect(result.matches).toEqual([]);
    expect(result.empty_reason).toBe("no_available_common_load");
  });

  it("distinguishes unsuitable matches from plans without estimated TSS", () => {
    const result = buildScheduleGapActivityPlanMatches({
      targetDate: "2026-07-20",
      targetLoadDelta: 70,
      primaryActivityCategory: "run",
      today: "2026-07-18",
      plans: [
        {
          id: "plan-1",
          name: "Bike plan",
          structure: structureForActivityCategory("bike"),
          prescriptionQuantification: prescriptionQuantification("plan-1", availableCommonLoad(70)),
        },
      ],
    });

    expect(result.matches).toEqual([]);
    expect(result.empty_reason).toBe("low_confidence");
  });

  it("derives canonical activity_category from strict plan structure", () => {
    const result = buildScheduleGapActivityPlanMatches({
      targetDate: "2026-07-20",
      targetLoadDelta: 70,
      primaryActivityCategory: "run",
      today: "2026-07-18",
      plans: [
        {
          id: "plan-1",
          name: "Tempo run",
          structure: structureForActivityCategory("run"),
          prescriptionQuantification: prescriptionQuantification(
            "plan-1",
            availableCommonLoad(70, "run"),
          ),
        },
      ],
    });

    expect(result.matches).toEqual([
      expect.objectContaining({
        activity_plan_id: "plan-1",
        activity_category: "run",
        reason_codes: expect.arrayContaining(["same_activity_category"]),
      }),
    ]);
  });
});
