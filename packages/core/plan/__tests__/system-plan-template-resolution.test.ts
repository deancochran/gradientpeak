import { describe, expect, it } from "vitest";
import { materializeAthletePerformanceTargetFacts } from "../../performance-model";
import { ALL_SAMPLE_PLANS } from "../../samples";
import { buildSystemTrainingPlanAudit } from "../verification/systemPlanAudit";
import {
  LOCAL_TRAINING_PLAN_FIXTURE,
  LOCAL_TRAINING_PLAN_TEMPLATES,
} from "./fixtures/local-training-plan-verification";

const localTemplateIndex = new Map(
  LOCAL_TRAINING_PLAN_TEMPLATES.map((template) => [template.id, template]),
);
const localAudit = buildSystemTrainingPlanAudit(LOCAL_TRAINING_PLAN_FIXTURE, localTemplateIndex);

describe("system plan template resolution audit", () => {
  it("keeps retired production plans empty while local linked templates resolve deterministically", () => {
    expect(ALL_SAMPLE_PLANS).toEqual([]);
    expect(localAudit.missingTemplateIds).toEqual([]);
    expect(buildSystemTrainingPlanAudit(LOCAL_TRAINING_PLAN_FIXTURE, localTemplateIndex)).toEqual(
      localAudit,
    );
    expect(localAudit.materializedEvents).toHaveLength(11);
    expect(
      localAudit.sessionDurationEvidence.every((evidence) =>
        evidence.prescriptionQuantification.members.every(
          (quantification) =>
            quantification.stage === "template" &&
            quantification.duration !== undefined &&
            quantification.commonLoad !== undefined,
        ),
      ),
    ).toBe(true);
  });

  it("resolved weekly duration aggregation - stays finite, ordered, and reconciles to plan totals", () => {
    expect(localAudit.weeklyResolvedDurationHours).toEqual([2.67, 2.67, 2.67, 2]);
    expect(localAudit.totalResolvedDurationHours).toBe(10.01);
  });

  it("retains an explicit empty production audit surface", () => {
    expect(ALL_SAMPLE_PLANS).toHaveLength(0);
  });

  it("uses compiled timing for a complete local prescription without athlete calibration", () => {
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
    const audit = buildSystemTrainingPlanAudit(LOCAL_TRAINING_PLAN_FIXTURE, localTemplateIndex, {
      performanceTargets,
      asOf,
    });
    const evidence = audit?.sessionDurationEvidence.find(
      (candidate) => candidate.activityPlanId === LOCAL_TRAINING_PLAN_TEMPLATES[2]?.id,
    );

    expect(evidence?.durationEstimate).toEqual({
      valueSeconds: 5400,
      status: "exact",
      basis: "compiled_time",
      confidence: "high",
    });
    expect(evidence?.prescriptionQuantification.summary.commonLoad.status).toBe("complete");
    expect(audit.weeklyResolvedDurationHours).not.toContain(null);
  });

  it("keeps a local session with a missing template explicitly unavailable", () => {
    const audit = buildSystemTrainingPlanAudit(LOCAL_TRAINING_PLAN_FIXTURE, new Map());

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
