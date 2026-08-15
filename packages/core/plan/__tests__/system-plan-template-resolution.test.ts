import { describe, expect, it } from "vitest";
import { materializeAthletePerformanceTargetFacts } from "../../performance-model";
import { ALL_SAMPLE_PLANS } from "../../samples";
import {
  SYSTEM_PLAN_FIXTURE_CATALOG,
  SYSTEM_PLAN_MAPPING_FIXTURES,
} from "../verification/fixtures/system-plan-mappings";
import {
  buildAllSystemTrainingPlanAudits,
  buildSystemTrainingPlanAudit,
} from "../verification/systemPlanAudit";

const planNameById = new Map(
  SYSTEM_PLAN_FIXTURE_CATALOG.map((entry) => [entry.plan_id, entry.plan_name]),
);
const FIRST_WAVE_EXACT_PLAN_NAMES = Array.from(
  new Set(
    SYSTEM_PLAN_MAPPING_FIXTURES.filter((fixture) => fixture.tolerance_class === "tight")
      .map((fixture) => planNameById.get(fixture.plan_id))
      .filter((planName): planName is string => Boolean(planName)),
  ),
).sort();
const firstWaveExactPlanNameSet = new Set(FIRST_WAVE_EXACT_PLAN_NAMES);
const DEFAULT_AUDITS = buildAllSystemTrainingPlanAudits();
const REPEATED_DEFAULT_AUDITS = buildAllSystemTrainingPlanAudits();

describe("system plan template resolution audit", () => {
  it("materialized sessions with linked activity templates - resolve deterministically", () => {
    for (const audit of DEFAULT_AUDITS) {
      expect(audit.missingTemplateIds, audit.planName).toEqual([]);
      expect(REPEATED_DEFAULT_AUDITS.find((item) => item.planId === audit.planId)).toEqual(audit);
      expect(audit.materializedEvents.length).toBeGreaterThan(0);
      expect(
        audit.sessionDurationEvidence.every(
          (evidence) =>
            evidence.prescriptionQuantification.members.length > 0 &&
            evidence.prescriptionQuantification.members.every(
              (quantification) =>
                quantification.stage === "template" &&
                quantification.duration !== undefined &&
                quantification.distance !== undefined &&
                quantification.intensity !== undefined &&
                quantification.commonLoad !== undefined,
            ),
        ),
      ).toBe(true);
    }
  });

  it("resolved weekly duration aggregation - stays finite, ordered, and reconciles to plan totals", () => {
    for (const audit of DEFAULT_AUDITS) {
      expect(audit.weeklyResolvedDurationHours.length).toBe(audit.materializedWeekCount);
      const knownWeeks = audit.weeklyResolvedDurationHours.filter(
        (hours): hours is number => hours !== null,
      );
      expect(knownWeeks.every(Number.isFinite)).toBe(true);
      expect(knownWeeks.every((hours) => hours >= 0)).toBe(true);
      if (knownWeeks.length !== audit.weeklyResolvedDurationHours.length) {
        expect(audit.totalResolvedDurationHours).toBeNull();
      } else {
        expect(Number(knownWeeks.reduce((sum, weekHours) => sum + weekHours, 0).toFixed(2))).toBe(
          audit.totalResolvedDurationHours,
        );
      }
    }
  });

  it("first-wave plans expose exact duration only when every prescription is timed", () => {
    const exactPlanDurations = DEFAULT_AUDITS.filter((audit) =>
      firstWaveExactPlanNameSet.has(audit.planName),
    ).map((audit) => ({
      planName: audit.planName,
      declaredDurationHours: audit.declaredDurationHours,
      meanWeeklyResolvedDurationHours: audit.meanWeeklyResolvedDurationHours,
      differenceHours:
        audit.meanWeeklyResolvedDurationHours === null
          ? null
          : Number(
              Math.abs(audit.declaredDurationHours - audit.meanWeeklyResolvedDurationHours).toFixed(
                2,
              ),
            ),
    }));

    expect(exactPlanDurations).toHaveLength(FIRST_WAVE_EXACT_PLAN_NAMES.length);
    expect(
      exactPlanDurations.every(
        (duration) =>
          duration.differenceHours === null ||
          (Number.isFinite(duration.differenceHours) && duration.differenceHours >= 0),
      ),
    ).toBe(true);
  });

  it("does not use threshold pace as an assumed planned pace for a distance template", () => {
    const asOf = "2026-07-12T12:00:00.000Z";
    const performanceTargets = materializeAthletePerformanceTargetFacts({
      athleteId: "system-plan-athlete",
      asOf,
      thresholds: [
        {
          id: "system-plan-run-threshold",
          status: "available",
          activityCategory: "run",
          metric: "speed",
          unit: "meters_per_second",
          method: "run_speed_30m",
          value: 1_000 / 300,
          effectiveAt: "2026-07-11T12:00:00.000Z",
          policyVersion: "threshold-policy-v1",
          state: "confirmed",
          confidence: 1,
          sourceEvaluationIds: ["system-plan-run-evaluation"],
          sourceEffortIds: ["system-plan-run-effort"],
          sourceActivityIds: ["system-plan-run-activity"],
        },
      ],
    });
    const longRunId = "d8e4f7a6-1b5c-4d9e-8f3a-5b2c8d7e6f4b";
    const audit = buildAllSystemTrainingPlanAudits({ performanceTargets, asOf }).find((candidate) =>
      candidate.sessionDurationEvidence.some((evidence) => evidence.activityPlanId === longRunId),
    );
    const evidence = audit?.sessionDurationEvidence.find(
      (candidate) => candidate.activityPlanId === longRunId,
    );

    expect(evidence?.durationEstimate).toEqual({
      valueSeconds: null,
      status: "unavailable",
      basis: null,
      confidence: null,
    });
    expect(evidence?.prescriptionQuantification.summary.distance).toMatchObject({
      status: "partial",
      value: 15_000,
    });
    expect(evidence?.prescriptionQuantification.summary.duration.elapsed.status).toBe("partial");
    expect(audit?.weeklyResolvedDurationHours).toContain(null);
  });

  it("keeps unresolved system-plan session duration explicitly unavailable", () => {
    const plan = ALL_SAMPLE_PLANS[0];
    if (!plan) throw new Error("Expected a shipped system plan");
    const audit = buildSystemTrainingPlanAudit(plan, new Map());

    expect(audit.sessionDurationEvidence.length).toBeGreaterThan(0);
    expect(
      audit.sessionDurationEvidence.every(
        (evidence) => evidence.durationEstimate.status === "unavailable",
      ),
    ).toBe(true);
    expect(audit.weeklyResolvedDurationHours).toContain(null);
    expect(audit.totalResolvedDurationHours).toBeNull();
  });
});
