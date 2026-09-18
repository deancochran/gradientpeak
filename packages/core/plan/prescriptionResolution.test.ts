import { describe, expect, it } from "vitest";
import { materializeAthletePerformanceTargetFacts } from "../performance-model";
import { createAthletePlanningContextFromSnapshot } from "./athletePlanningContext";
import {
  DEFAULT_TRAINING_PLAN_POLICY_V1,
  prescriptionEstimateSchema,
  prescriptionResolutionManifestSchema,
  resolvePrescription,
  resolveTrainingPlanPreferences,
  semanticAdaptationValuesSchema,
} from "./prescriptionResolution";

const ids = {
  plan: "11111111-1111-4111-8111-111111111111",
  segment: "22222222-2222-4222-8222-222222222222",
  interval: "33333333-3333-4333-8333-333333333333",
  step: "44444444-4444-4444-8444-444444444444",
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
    category?: "run" | "bike" | "swim";
    adaptation?: boolean;
    restSeconds?: number;
    open?: boolean;
    intensity?: number;
  } = {},
) {
  const category = input.category ?? "run";
  const target = input.target ?? "RPE";
  const seconds = input.seconds ?? 1800;
  const step = {
    id: ids.step,
    name: "Work",
    duration: input.open
      ? { type: "untilFinished" as const }
      : input.meters
        ? { type: "distance" as const, meters: input.meters }
        : input.repetitionCount
          ? { type: "repetitions" as const, count: input.repetitionCount }
          : { type: "time" as const, seconds },
    targets: [
      {
        type: target,
        intensity:
          input.intensity ??
          (target === "RPE"
            ? 4
            : target === "speed"
              ? 10
              : target === "watts"
                ? 180
                : target === "bpm"
                  ? 150
                  : 70),
      },
    ],
  };
  return {
    id: input.id ?? ids.plan,
    revision: 1,
    semantic_hash: `v1:sha256:${(input.id ?? ids.plan).replaceAll("-", "").padEnd(64, "a").slice(0, 64)}`,
    activity_category: category,
    training_intent: "aerobic_base" as const,
    structure: {
      version: 3 as const,
      activity_category: category,
      segments: [
        {
          id: ids.segment,
          name: "Activity",
          role: "activity" as const,
          intervals: [
            {
              id: ids.interval,
              name: "Set",
              repetitions: input.repetitions ?? 1,
              steps: [step],
            },
          ],
        },
        ...(input.restSeconds
          ? [
              {
                id: "55555555-5555-4555-8555-555555555555",
                name: "Rest",
                role: "rest" as const,
                duration: { type: "time" as const, seconds: input.restSeconds },
              },
            ]
          : []),
      ],
    },
    ...(input.adaptation
      ? {
          adaptation: {
            controls: [
              {
                id: "66666666-6666-4666-8666-666666666661",
                key: "work_seconds",
                label: "Work duration",
                kind: "step_quantity" as const,
                range: { minimum: 900, default: seconds, maximum: 7200, increment: 300 },
                targets: [
                  {
                    type: "step_quantity" as const,
                    activitySegmentId: ids.segment,
                    intervalId: ids.interval,
                    stepId: ids.step,
                    quantityType: "time" as const,
                  },
                ],
              },
              {
                id: "66666666-6666-4666-8666-666666666662",
                key: "work_repetitions",
                label: "Work repetitions",
                kind: "interval_repetitions" as const,
                range: { minimum: 1, default: 1, maximum: 4, increment: 1 },
                targets: [
                  {
                    type: "interval_repetitions" as const,
                    activitySegmentId: ids.segment,
                    intervalId: ids.interval,
                  },
                ],
              },
              {
                id: "66666666-6666-4666-8666-666666666663",
                key: "recovery_seconds",
                label: "Recovery duration",
                kind: "recovery_quantity" as const,
                range: { minimum: 60, default: 120, maximum: 300, increment: 60 },
                targets: [
                  {
                    type: "rest_segment" as const,
                    segmentId: "55555555-5555-4555-8555-555555555555",
                  },
                ],
              },
              {
                id: "66666666-6666-4666-8666-666666666664",
                key: "work_intensity",
                label: "Work intensity",
                kind: "target_intensity" as const,
                range: {
                  minimum: 2,
                  default: target === "RPE" ? 4 : 70,
                  maximum: target === "RPE" ? 8 : 100,
                  increment: 1,
                },
                targets: [
                  {
                    type: "target_intensity" as const,
                    activitySegmentId: ids.segment,
                    intervalId: ids.interval,
                    stepId: ids.step,
                    targetType: target,
                  },
                ],
              },
            ],
          },
        }
      : {}),
  };
}

function richBaseline(value = 250, asOf = "2026-06-01T00:00:00.000Z") {
  const performanceTargets = materializeAthletePerformanceTargetFacts({
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
  });
  return {
    status: "available" as const,
    revision: 7,
    context: createAthletePlanningContextFromSnapshot({
      asOf,
      profileMetrics: [],
      activityEfforts: [],
      performanceTargets,
    }),
  };
}

describe("resolvePrescription", () => {
  it("has deterministic no-context defaults and treats explicit defaults as identical", () => {
    const first = resolvePrescription({
      demand,
      preferences: defaults,
      baseline: noContext,
      candidates: [candidate()],
    });
    const second = resolvePrescription({
      demand,
      preferences: DEFAULT_TRAINING_PLAN_POLICY_V1.preference_defaults,
      baseline: noContext,
      candidates: [candidate()],
    });
    expect(first).toMatchObject({ status: "resolved" });
    expect(second).toMatchObject({ status: "resolved" });
    if (first.status === "resolved" && second.status === "resolved") {
      expect(first.manifest.fingerprint).toBe(second.manifest.fingerprint);
      expect(first.manifest.fallback_level).toBe("system_default_no_context");
    }
  });

  it("does not make a no-context resolution depend on the request timestamp", () => {
    const earlier = resolvePrescription({
      demand,
      preferences: defaults,
      baseline: { status: "no_context", as_of: "2026-06-01T00:00:00.000Z" },
      candidates: [candidate()],
    });
    const later = resolvePrescription({
      demand,
      preferences: defaults,
      baseline: { status: "no_context", as_of: "2026-06-01T00:00:01.000Z" },
      candidates: [candidate()],
    });

    expect(earlier).toMatchObject({ status: "resolved" });
    expect(later).toMatchObject({ status: "resolved" });
    if (earlier.status === "resolved" && later.status === "resolved") {
      expect(later.manifest.fingerprint).toBe(earlier.manifest.fingerprint);
    }
  });

  it("does not make an evidence-backed resolution depend on its evaluation clock", () => {
    const absolute = candidate({ category: "bike", target: "watts" });
    const bikeDemand = { ...demand, activity_category: "bike" as const };
    const earlier = resolvePrescription({
      demand: bikeDemand,
      preferences: defaults,
      baseline: richBaseline(250, "2026-06-01T00:00:00.000Z"),
      candidates: [absolute],
    });
    const later = resolvePrescription({
      demand: bikeDemand,
      preferences: defaults,
      baseline: richBaseline(250, "2026-06-01T00:00:01.000Z"),
      candidates: [absolute],
    });
    expect(earlier).toMatchObject({ status: "resolved" });
    expect(later).toMatchObject({ status: "resolved" });
    if (earlier.status === "resolved" && later.status === "resolved")
      expect(later.manifest.fingerprint).toBe(earlier.manifest.fingerprint);
  });

  it("uses scheduling preferences in effective targets, policy selection, and reasons", () => {
    const adaptable = candidate({ adaptation: true, restSeconds: 120 });
    const base = resolvePrescription({
      demand,
      preferences: defaults,
      baseline: noContext,
      candidates: [adaptable],
      planning_weekday: 2,
    });
    const weekly = resolvePrescription({
      demand,
      preferences: { ...defaults, weekly_session_count: 6 },
      baseline: noContext,
      candidates: [adaptable],
    });
    const duration = resolvePrescription({
      demand,
      preferences: { ...defaults, target_weekly_duration_minutes: 360 },
      baseline: noContext,
      candidates: [adaptable],
    });
    const progression = resolvePrescription({
      demand,
      preferences: { ...defaults, progression_style: "ambitious" },
      baseline: noContext,
      candidates: [adaptable],
    });
    const recovery = resolvePrescription({
      demand,
      preferences: { ...defaults, recovery_priority: "high" },
      baseline: noContext,
      candidates: [adaptable],
    });
    const preferred = resolvePrescription({
      demand,
      preferences: { ...defaults, preferred_weekdays: [2] },
      baseline: noContext,
      candidates: [adaptable],
      planning_weekday: 2,
    });
    const rest = resolvePrescription({
      demand,
      preferences: { ...defaults, rest_days: [2] },
      baseline: noContext,
      candidates: [adaptable],
      planning_weekday: 2,
    });
    expect(base).toMatchObject({ status: "resolved" });
    expect(weekly).toMatchObject({ status: "resolved" });
    expect(duration).toMatchObject({ status: "resolved" });
    if (
      base.status === "resolved" &&
      weekly.status === "resolved" &&
      duration.status === "resolved" &&
      progression.status === "resolved" &&
      recovery.status === "resolved" &&
      preferred.status === "resolved"
    ) {
      expect(weekly.manifest.adaptation_values.work_seconds).not.toBe(
        base.manifest.adaptation_values.work_seconds,
      );
      expect(duration.manifest.adaptation_values.work_seconds).not.toBe(
        base.manifest.adaptation_values.work_seconds,
      );
      expect(progression.manifest.fingerprint).not.toBe(base.manifest.fingerprint);
      expect(recovery.manifest.adaptation_values.recovery_seconds).toBe(300);
      expect(recovery.manifest.fingerprint).not.toBe(base.manifest.fingerprint);
      expect(preferred.manifest.reason_codes).toContain("preferred_weekday");
    }
    expect(rest).toMatchObject({ status: "needs_input", missing: [{ code: "planning_weekday" }] });
  });

  it("ranks exact candidates independently of row order and rejects duplicate IDs", () => {
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

  it("uses target Common Load as an authoritative selection objective", () => {
    expect(
      resolvePrescription({
        demand: { ...demand, target_common_load: 50 },
        preferences: defaults,
        baseline: noContext,
        candidates: [candidate({ target: "RPE" })],
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
    if (highOnly.status !== "resolved") return;
    const highLoad = highOnly.manifest.prescription_estimate.common_load.value;
    expect(highLoad).not.toBeNull();
    const selected = resolvePrescription({
      demand: { ...bikeDemand, target_common_load: highLoad },
      preferences: defaults,
      baseline: noContext,
      candidates: [low, high],
    });
    expect(selected).toMatchObject({
      status: "resolved",
      manifest: { activity_plan_id: high.id },
    });
  });

  it("rejects an aggregate adaptation domain before allocating it", () => {
    const oversized = candidate();
    const target = {
      type: "target_intensity" as const,
      activitySegmentId: ids.segment,
      intervalId: ids.interval,
      stepId: ids.step,
      targetType: "%FTP" as const,
    };
    expect(
      resolvePrescription({
        demand,
        preferences: defaults,
        baseline: noContext,
        candidates: [
          {
            ...oversized,
            adaptation: {
              controls: [
                {
                  id: "99999999-9999-4999-8999-999999999991",
                  key: "first",
                  label: "First",
                  kind: "target_intensity" as const,
                  range: { minimum: 1, default: 1, maximum: 101, increment: 1 },
                  targets: [target],
                },
                {
                  id: "99999999-9999-4999-8999-999999999992",
                  key: "second",
                  label: "Second",
                  kind: "target_intensity" as const,
                  range: { minimum: 1, default: 1, maximum: 101, increment: 1 },
                  targets: [target],
                },
              ],
            },
          },
        ],
      }),
    ).toMatchObject({
      status: "unsupported",
      reasons: [{ code: "adaptation_surface_limit_exceeded" }],
    });
  });

  it("treats the maximum duration as hard, includes rest, and makes open duration unavailable", () => {
    const withRest = candidate({ seconds: 3000, restSeconds: 900 });
    const resolved = resolvePrescription({
      demand: { ...demand, target_duration_minutes: 65 },
      preferences: { ...defaults, maximum_session_duration_minutes: 65 },
      baseline: noContext,
      candidates: [withRest],
    });
    expect(resolved).toMatchObject({ status: "resolved" });
    if (resolved.status === "resolved") {
      expect(resolved.manifest.prescription_estimate.duration.value_seconds).toBe(3900);
      expect(resolved.manifest.prescription_estimate.rest_seconds).toBe(900);
    }
    expect(
      resolvePrescription({
        demand,
        preferences: { ...defaults, maximum_session_duration_minutes: 60 },
        baseline: noContext,
        candidates: [withRest],
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

  it("resolves distance prescriptions from authored speed and requests rate evidence when unavailable", () => {
    const explicitSpeed = resolvePrescription({
      demand: { ...demand, target_duration_minutes: 25 },
      preferences: defaults,
      baseline: noContext,
      candidates: [candidate({ meters: 5000, target: "speed", intensity: 14.4 })],
    });
    expect(explicitSpeed).toMatchObject({
      status: "resolved",
      manifest: {
        prescription_estimate: {
          duration: { status: "estimated", value_seconds: 1250 },
        },
      },
    });

    const missingSpeed = resolvePrescription({
      demand: { ...demand, target_duration_minutes: 60 },
      preferences: defaults,
      baseline: noContext,
      candidates: [candidate({ meters: 400, repetitions: 25, target: "RPE", intensity: 7 })],
    });
    expect(missingSpeed).toMatchObject({
      status: "needs_input",
      missing: [{ code: "duration_estimate", activity_category: "run" }],
    });

    expect(
      resolvePrescription({
        demand,
        preferences: defaults,
        baseline: noContext,
        candidates: [candidate({ repetitionCount: 20 })],
      }),
    ).toMatchObject({ status: "unsupported", reasons: [{ code: "unsupported_duration" }] });
  });

  it("requires fresh matching evidence only for absolute objectives and does not use unrelated or stale facts", () => {
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
    const rich = resolvePrescription({
      demand: bikeDemand,
      preferences: defaults,
      baseline: richBaseline(),
      candidates: [absolute],
    });
    expect(rich).toMatchObject({ status: "resolved" });
    if (rich.status === "resolved") expect(rich.manifest.fallback_level).toBe("evidence_informed");
    const stale = richBaseline();
    stale.context.performanceTargets.thresholds.bike.freshness = "stale";
    expect(
      resolvePrescription({
        demand: bikeDemand,
        preferences: defaults,
        baseline: stale,
        candidates: [absolute],
      }),
    ).toMatchObject({
      status: "needs_input",
      missing: [{ code: "absolute_target_evidence" }],
    });
    expect(
      resolvePrescription({
        demand,
        preferences: defaults,
        baseline: richBaseline(),
        candidates: [candidate()],
      }),
    ).toMatchObject({
      status: "resolved",
      manifest: { fallback_level: "preference_informed" },
    });
    const relativeWithoutEvidence = resolvePrescription({
      demand: bikeDemand,
      preferences: defaults,
      baseline: noContext,
      candidates: [candidate({ category: "bike", target: "%FTP" })],
    });
    const relativeWithEvidence = resolvePrescription({
      demand: bikeDemand,
      preferences: defaults,
      baseline: richBaseline(),
      candidates: [candidate({ category: "bike", target: "%FTP" })],
    });
    expect(relativeWithoutEvidence).toMatchObject({
      status: "resolved",
      manifest: {
        fallback_level: "system_default_no_context",
        prescription_estimate: { common_load: { status: "complete" } },
      },
    });
    expect(relativeWithEvidence).toMatchObject({
      status: "resolved",
      manifest: { fallback_level: "evidence_informed", athlete_context_revision: 7 },
    });
  });

  it("composes duration with progression volume and adapts overlong authored plans before applying the hard cap", () => {
    const composed = candidate({ seconds: 1800, restSeconds: 120, adaptation: true });
    const sixty = resolvePrescription({
      demand: { ...demand, target_duration_minutes: 60 },
      preferences: defaults,
      baseline: noContext,
      candidates: [composed],
    });
    expect(sixty).toMatchObject({ status: "resolved" });
    if (sixty.status === "resolved")
      expect(sixty.manifest.prescription_estimate.duration.value_seconds).toBeLessThan(4500);
    const authoredOverlong = candidate({ seconds: 7200, restSeconds: 120, adaptation: true });
    const capped = resolvePrescription({
      demand: { ...demand, target_duration_minutes: 60 },
      preferences: { ...defaults, maximum_session_duration_minutes: 60 },
      baseline: noContext,
      candidates: [authoredOverlong],
    });
    expect(capped).toMatchObject({ status: "resolved" });
    if (capped.status === "resolved")
      expect(capped.manifest.prescription_estimate.duration.value_seconds).toBeLessThanOrEqual(
        3600,
      );
  });

  it("selects bounded adaptive duration increases and reductions from authored session demands", () => {
    const adaptable = candidate({ seconds: 1800, restSeconds: 120, adaptation: true });
    const resolveForDuration = (target_duration_minutes: number) =>
      resolvePrescription({
        demand: { ...demand, target_duration_minutes },
        preferences: defaults,
        baseline: noContext,
        candidates: [adaptable],
      });
    const reduced = resolveForDuration(25);
    const progressed = resolveForDuration(60);

    expect(reduced).toMatchObject({ status: "resolved" });
    expect(progressed).toMatchObject({ status: "resolved" });
    if (reduced.status !== "resolved" || progressed.status !== "resolved") return;

    expect(progressed.manifest.adaptation_values.work_seconds).toBeGreaterThan(
      reduced.manifest.adaptation_values.work_seconds ?? 0,
    );
    expect(progressed.manifest.prescription_estimate.duration.value_seconds).toBeGreaterThan(
      reduced.manifest.prescription_estimate.duration.value_seconds ?? 0,
    );
    expect(progressed.manifest.session_demand.target_duration_minutes).toBe(60);
    expect(reduced.manifest.session_demand.target_duration_minutes).toBe(25);
  });

  it("validates manifest integrity and fingerprints the effective evidence", () => {
    const absolute = candidate({ category: "bike", target: "watts" });
    const bikeDemand = { ...demand, activity_category: "bike" as const };
    const first = resolvePrescription({
      demand: bikeDemand,
      preferences: defaults,
      baseline: richBaseline(250),
      candidates: [absolute],
    });
    const second = resolvePrescription({
      demand: bikeDemand,
      preferences: defaults,
      baseline: richBaseline(260),
      candidates: [absolute],
    });
    expect(first).toMatchObject({ status: "resolved" });
    expect(second).toMatchObject({ status: "resolved" });
    if (first.status === "resolved" && second.status === "resolved") {
      expect(first.manifest.fingerprint).not.toBe(second.manifest.fingerprint);
      expect(
        prescriptionResolutionManifestSchema.safeParse({
          ...first.manifest,
          resolved_structure_hash: `v1:sha256:${"0".repeat(64)}`,
        }).success,
      ).toBe(false);
      expect(semanticAdaptationValuesSchema.safeParse({ custom_control: -1 }).success).toBe(true);
      expect(semanticAdaptationValuesSchema.safeParse({ custom_control: Number.NaN }).success).toBe(
        false,
      );
      expect(
        prescriptionEstimateSchema.safeParse({
          ...first.manifest.prescription_estimate,
          common_load: { status: "partial", value: null },
        }).success,
      ).toBe(false);
      expect(
        prescriptionResolutionManifestSchema.safeParse({
          ...first.manifest,
          athlete_context_revision: null,
        }).success,
      ).toBe(false);
      expect(
        prescriptionResolutionManifestSchema.safeParse({
          ...first.manifest,
          fallback_level: "preference_informed",
        }).success,
      ).toBe(false);
      expect(
        prescriptionResolutionManifestSchema.safeParse({
          ...first.manifest,
          training_plan_id: ids.plan,
        }).success,
      ).toBe(false);
    }
  });

  it("rejects category mismatch, missing explicit plans, and the bounded 1001-candidate catalog", () => {
    const valid = candidate();
    expect(
      resolvePrescription({
        demand,
        preferences: defaults,
        baseline: noContext,
        activity_plan_id: "99999999-9999-4999-8999-999999999999",
        candidates: [valid],
      }),
    ).toMatchObject({ status: "unsupported", reasons: [{ code: "explicit_plan_missing" }] });
    expect(
      resolvePrescription({
        demand,
        preferences: defaults,
        baseline: noContext,
        candidates: Array.from({ length: 1001 }, (_, index) =>
          candidate({ id: `11111111-1111-4111-8111-${String(index).padStart(12, "0")}` }),
        ),
      }),
    ).toMatchObject({ status: "unsupported", reasons: [{ code: "candidate_limit_exceeded" }] });
    expect(resolveTrainingPlanPreferences(defaults)).toEqual(
      DEFAULT_TRAINING_PLAN_POLICY_V1.preference_defaults,
    );
  });
});
