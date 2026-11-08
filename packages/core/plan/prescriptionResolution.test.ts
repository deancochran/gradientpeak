import { describe, expect, it } from "vitest";
import { activityPlanSemanticHash, activityPlanStructureSchema } from "../activity-plan";
import { materializeAthletePerformanceTargetFacts } from "../performance-model";
import { buildPerformanceTargetFactsFixture } from "../testing/performance-model";
import { createAthletePlanningContextFromSnapshot } from "./athletePlanningContext";
import {
  DEFAULT_TRAINING_PLAN_POLICY_V2,
  prescriptionEstimateSchema,
  prescriptionResolutionManifestSchema,
  resolvePrescription,
  resolveTrainingPlanPreferences,
} from "./prescriptionResolution";

const ids = {
  plan: "11111111-1111-4111-8111-111111111111",
  block: "22222222-2222-4222-8222-222222222222",
  step: "33333333-3333-4333-8333-333333333333",
};
const noContext = { status: "no_context" as const, as_of: "2026-06-01T00:00:00.000Z" };
const defaults = {
  weekly_session_count: null,
  target_weekly_duration_minutes: null,
  maximum_session_duration_minutes: null,
  preferred_weekdays: [],
  rest_days: [],
  progression_style: null,
  recovery_priority: null,
};
const demand = {
  activity_category: "run" as const,
  training_intent: "aerobic_base" as const,
  target_duration_minutes: null,
  target_common_load: null,
  importance: "normal" as const,
};
function candidate(
  input: {
    id?: string;
    seconds?: number;
    meters?: number;
    repetitions?: number;
    repetitionCount?: number;
    target?: "RPE" | "speed" | "watts" | "bpm" | "%FTP" | "%ThresholdHR" | "%MaxHR";
    category?: "run" | "bike" | "swim" | "strength";
    open?: boolean;
    intensity?: number;
  } = {},
) {
  const category = input.category ?? "run";
  const target = input.target ?? "RPE";
  const duration = input.open
    ? { type: "untilFinished" as const }
    : input.meters
      ? { type: "distance" as const, meters: input.meters }
      : input.repetitionCount
        ? { type: "repetitions" as const, count: input.repetitionCount }
        : { type: "time" as const, seconds: input.seconds ?? 1800 };
  const intensity =
    input.intensity ??
    (target === "RPE"
      ? 4
      : target === "speed"
        ? 10
        : target === "watts"
          ? 180
          : target === "bpm"
            ? 150
            : 70);
  const id = input.id ?? ids.plan;
  const structure = activityPlanStructureSchema.parse({
    version: 5 as const,
    activity_category: category,
    items:
      input.repetitions === undefined || input.repetitions === 1
        ? [
            {
              type: "step",
              id: ids.step,
              name: "Work",
              duration,
              targets: [{ type: target, intensity }],
            },
          ]
        : [
            {
              type: "repeat",
              id: ids.block,
              count: input.repetitions,
              steps: [
                {
                  type: "step",
                  id: ids.step,
                  name: "Work",
                  duration,
                  targets: [{ type: target, intensity }],
                },
              ],
            },
          ],
  });
  return {
    id,
    revision: 1,
    semantic_hash: activityPlanSemanticHash({ structure, trainingIntent: "aerobic_base" }),
    activity_category: category,
    training_intent: "aerobic_base" as const,
    structure,
  };
}
function richBaseline(value = 250, asOf = "2026-06-01T00:00:00.000Z") {
  return {
    status: "available" as const,
    revision: 7,
    context: createAthletePlanningContextFromSnapshot({
      asOf,
      profileMetrics: [],
      activityEfforts: [],
      performanceTargets: materializeAthletePerformanceTargetFacts({
        athleteId: "athlete",
        asOf,
        thresholds: [
          {
            id: "bike-power",
            status: "available",
            activityCategory: "bike",
            metric: "power",
            unit: "watts",
            method: "bike_power_30m",
            value,
            effectiveAt: "2026-05-30T00:00:00.000Z",
            policyVersion: "threshold-policy-v1",
            state: "confirmed",
            confidence: 1,
            sourceEvaluationIds: ["evaluation"],
            sourceEffortIds: ["effort"],
            sourceActivityIds: ["activity"],
          },
        ],
      }),
    }),
  };
}
describe("resolvePrescription V4", () => {
  it("has deterministic fixed-plan defaults and fingerprints", () => {
    const first = resolvePrescription({
      demand,
      preferences: defaults,
      baseline: noContext,
      candidates: [candidate()],
    });
    const second = resolvePrescription({
      demand,
      preferences: DEFAULT_TRAINING_PLAN_POLICY_V2.preference_defaults,
      baseline: { ...noContext, as_of: "2026-06-02T00:00:00.000Z" },
      candidates: [candidate()],
    });
    expect(first).toMatchObject({
      status: "resolved",
      manifest: {
        resolver_version: "prescription-resolver-v2",
        policy_version: "training-plan-policy-v2",
      },
    });
    expect(second).toMatchObject({ status: "resolved" });
    if (first.status === "resolved" && second.status === "resolved") {
      expect(first.manifest.fingerprint).toBe(second.manifest.fingerprint);
      expect(first.manifest.fallback_level).toBe("system_default_no_context");
      expect(first.manifest.resolved_structure).toEqual(candidate().structure);
      expect("adaptation_values" in first.manifest).toBe(false);
    }
  });
  it("uses scheduling preferences for constraints and metadata without rewriting the plan", () => {
    const preferred = resolvePrescription({
      demand,
      preferences: { ...defaults, preferred_weekdays: [2], progression_style: "ambitious" },
      baseline: noContext,
      candidates: [candidate()],
      planning_weekday: 2,
    });
    const rest = resolvePrescription({
      demand,
      preferences: { ...defaults, rest_days: [2] },
      baseline: noContext,
      candidates: [candidate()],
      planning_weekday: 2,
    });
    expect(preferred).toMatchObject({
      status: "resolved",
      manifest: { reason_codes: ["preferred_weekday"] },
    });
    expect(rest).toMatchObject({ status: "needs_input", missing: [{ code: "planning_weekday" }] });
  });
  it("ranks fixed exact candidates independently of row order and rejects duplicate IDs", () => {
    const short = candidate({ id: "11111111-1111-4111-8111-111111111112", seconds: 1800 });
    const long = candidate({ id: "11111111-1111-4111-8111-111111111113", seconds: 3600 });
    const selected = resolvePrescription({
      demand,
      preferences: defaults,
      baseline: noContext,
      candidates: [long, short],
    });
    const reversed = resolvePrescription({
      demand,
      preferences: defaults,
      baseline: noContext,
      candidates: [short, long],
    });
    expect(selected).toMatchObject({ status: "resolved" });
    expect(reversed).toMatchObject({ status: "resolved" });
    if (selected.status === "resolved" && reversed.status === "resolved")
      expect(selected.manifest.activity_plan_id).toBe(reversed.manifest.activity_plan_id);
    expect(
      resolvePrescription({
        demand,
        preferences: defaults,
        baseline: noContext,
        candidates: [short, short],
      }),
    ).toMatchObject({ status: "unsupported", reasons: [{ code: "duplicate_candidate_id" }] });
  });
  it("uses target Common Load as an authoritative fixed-plan selection objective", () => {
    expect(
      resolvePrescription({
        demand: { ...demand, target_common_load: 50 },
        preferences: defaults,
        baseline: noContext,
        candidates: [candidate()],
      }),
    ).toMatchObject({ status: "needs_input", missing: [{ code: "common_load_estimate" }] });
    const low = candidate({
      id: "11111111-1111-4111-8111-111111111121",
      category: "bike",
      target: "%FTP",
      intensity: 50,
    });
    const high = candidate({
      id: "11111111-1111-4111-8111-111111111122",
      category: "bike",
      target: "%FTP",
      intensity: 100,
    });
    const bikeDemand = { ...demand, activity_category: "bike" as const };
    const highOnly = resolvePrescription({
      demand: bikeDemand,
      preferences: defaults,
      baseline: noContext,
      candidates: [high],
    });
    expect(highOnly).toMatchObject({ status: "resolved" });
    if (highOnly.status === "resolved")
      expect(
        resolvePrescription({
          demand: {
            ...bikeDemand,
            target_common_load: highOnly.manifest.prescription_estimate.common_load.value,
          },
          preferences: defaults,
          baseline: noContext,
          candidates: [low, high],
        }),
      ).toMatchObject({ status: "resolved", manifest: { activity_plan_id: high.id } });
  });
  it("applies the duration hard cap to authored repetitions and leaves open completion unavailable", () => {
    const repeated = candidate({ seconds: 600, repetitions: 4 });
    expect(
      resolvePrescription({
        demand,
        preferences: { ...defaults, maximum_session_duration_minutes: 40 },
        baseline: noContext,
        candidates: [repeated],
      }),
    ).toMatchObject({
      status: "resolved",
      manifest: { prescription_estimate: { duration: { value_seconds: 2400 } } },
    });
    expect(
      resolvePrescription({
        demand,
        preferences: { ...defaults, maximum_session_duration_minutes: 30 },
        baseline: noContext,
        candidates: [repeated],
      }),
    ).toMatchObject({ status: "unsupported", reasons: [{ code: "hard_duration_exceeded" }] });
    expect(
      resolvePrescription({
        demand,
        preferences: defaults,
        baseline: noContext,
        candidates: [candidate({ open: true })],
      }),
    ).toMatchObject({ status: "unsupported", reasons: [{ code: "hard_duration_exceeded" }] });
  });
  it("estimates fixed distance steps and reports unavailable rate or unsupported repetitions", () => {
    expect(
      resolvePrescription({
        demand: { ...demand, target_duration_minutes: 25 },
        preferences: defaults,
        baseline: noContext,
        candidates: [candidate({ meters: 5000, target: "speed", intensity: 14.4 })],
      }),
    ).toMatchObject({
      status: "resolved",
      manifest: {
        prescription_estimate: { duration: { status: "estimated", value_seconds: 1250 } },
      },
    });
    expect(
      resolvePrescription({
        demand,
        preferences: defaults,
        baseline: noContext,
        candidates: [candidate({ meters: 400 })],
      }),
    ).toMatchObject({ status: "needs_input", missing: [{ code: "duration_estimate" }] });
    expect(
      resolvePrescription({
        demand,
        preferences: defaults,
        baseline: noContext,
        candidates: [candidate({ repetitionCount: 20 })],
      }),
    ).toMatchObject({ status: "unsupported", reasons: [{ code: "unsupported_duration" }] });
  });
  it("requires matching fresh facts for absolute targets and preserves relative FTP semantics", () => {
    const absolute = candidate({ category: "bike", target: "watts" });
    const bikeDemand = { ...demand, activity_category: "bike" as const };
    expect(
      resolvePrescription({
        demand: bikeDemand,
        preferences: defaults,
        baseline: noContext,
        candidates: [absolute],
      }),
    ).toMatchObject({ status: "needs_input", missing: [{ code: "absolute_target_evidence" }] });
    expect(
      resolvePrescription({
        demand: bikeDemand,
        preferences: defaults,
        baseline: richBaseline(),
        candidates: [absolute],
      }),
    ).toMatchObject({ status: "resolved", manifest: { fallback_level: "evidence_informed" } });
    expect(
      resolvePrescription({
        demand: bikeDemand,
        preferences: defaults,
        baseline: noContext,
        candidates: [candidate({ category: "bike", target: "%FTP" })],
      }),
    ).toMatchObject({
      status: "resolved",
      manifest: { fallback_level: "system_default_no_context" },
    });
  });
  it("retains fresh LTHR alongside MaxHR for percent-MaxHR Common Load estimation", () => {
    const asOf = "2026-06-01T00:00:00.000Z";
    const performanceTargets = buildPerformanceTargetFactsFixture({
      asOf,
      lthrBpm: { run: 175 },
      maxHrBpm: { run: 195 },
    });
    if (
      performanceTargets.heartRate.run.lthr.status !== "available" ||
      performanceTargets.heartRate.run.maxHr.status !== "available"
    )
      throw new Error("heart-rate fixture is unexpectedly unavailable");
    performanceTargets.heartRate.run.lthr.freshness = "fresh";
    performanceTargets.heartRate.run.maxHr.freshness = "fresh";
    const baseline = {
      status: "available" as const,
      revision: 9,
      context: createAthletePlanningContextFromSnapshot({
        asOf,
        profileMetrics: [],
        activityEfforts: [],
        performanceTargets,
      }),
    };
    const result = resolvePrescription({
      demand: { ...demand, target_common_load: 30 },
      preferences: defaults,
      baseline,
      candidates: [candidate({ target: "%MaxHR", intensity: 85 })],
    });
    expect(result).toMatchObject({ status: "resolved" });
    if (result.status === "resolved") {
      expect(result.manifest.prescription_estimate.common_load.value).not.toBeNull();
      expect(result.manifest.evidence_facts.map((fact) => fact.metric).sort()).toEqual([
        "lthr",
        "maxHr",
      ]);
    }
  });
  it("validates V4 manifest integrity and candidate boundaries", () => {
    const resolved = resolvePrescription({
      demand,
      preferences: defaults,
      baseline: noContext,
      candidates: [candidate()],
    });
    expect(resolved).toMatchObject({ status: "resolved" });
    if (resolved.status === "resolved") {
      expect(
        prescriptionResolutionManifestSchema.safeParse({
          ...resolved.manifest,
          resolved_structure_hash: `v1:sha256:${"0".repeat(64)}`,
        }).success,
      ).toBe(false);
      expect(
        prescriptionEstimateSchema.safeParse({
          ...resolved.manifest.prescription_estimate,
          common_load: { status: "partial", value: null },
        }).success,
      ).toBe(false);
    }
    expect(
      resolvePrescription({
        demand,
        preferences: defaults,
        baseline: noContext,
        activity_plan_id: "99999999-9999-4999-8999-999999999999",
        candidates: [candidate()],
      }),
    ).toMatchObject({ status: "unsupported", reasons: [{ code: "explicit_plan_missing" }] });
    expect(resolveTrainingPlanPreferences(defaults)).toEqual(
      DEFAULT_TRAINING_PLAN_POLICY_V2.preference_defaults,
    );
  });
});
