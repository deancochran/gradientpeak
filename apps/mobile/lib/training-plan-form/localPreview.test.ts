import type { CreationNormalizationInput, PreviewReadinessSnapshot } from "@repo/core";
import {
  buildDeterministicProjectionPayload,
  buildProjectionEngineInput,
  deterministicUuidFromSeed,
  normalizeCreationConfig,
} from "@repo/core";
import { describe, expect, it } from "vitest";
import { buildExpandedPlanFromMinimalGoal, computeLocalCreationPreview } from "./localPreview";

const minimalPlan = {
  goals: [
    {
      name: "Spring race",
      target_date: "2026-06-01",
      priority: 1,
      targets: [
        {
          target_type: "hr_threshold" as const,
          target_lthr_bpm: 172,
        },
      ],
    },
  ],
};

const contextSummary = {
  history_availability_state: "sparse" as const,
  recent_consistency_marker: "moderate" as const,
  effort_confidence_marker: "moderate" as const,
  profile_metric_completeness_marker: "moderate" as const,
  signal_quality: 0.6,
  recommended_baseline_tss_range: { min: 280, max: 420 },
  recommended_recent_influence_range: { min: -0.2, max: 0.3 },
  recommended_sessions_per_week_range: { min: 3, max: 5 },
  rationale_codes: [],
};

const baseBehaviorControls = {
  aggressiveness: 0.45,
  variability: 0.45,
  spike_frequency: 0.35,
  shape_target: 0,
  shape_strength: 0.35,
  recovery_priority: 0.6,
  starting_fitness_confidence: 0.6,
};

const baseCreationInput: CreationNormalizationInput = {
  user_values: {
    behavior_controls_v1: baseBehaviorControls,
  },
};

describe("computeLocalCreationPreview", () => {
  it("builds a local projection chart and conflict summary", () => {
    const preview = computeLocalCreationPreview({
      minimalPlan,
      creationInput: baseCreationInput,
      contextSummary,
      startingCtlOverride: 42,
      startingAtlOverride: 50,
    });

    expect(preview.projectionChart.points.length).toBeGreaterThan(0);
    expect(preview.projectionChart.periodization_phases.length).toBeGreaterThan(0);
    expect(Array.isArray(preview.conflicts)).toBe(true);
    expect(preview.feasibilitySummary).toBeDefined();
  });

  it("recomputes different projection outputs when inputs change", () => {
    const earlierGoal = computeLocalCreationPreview({
      minimalPlan,
      contextSummary,
      creationInput: baseCreationInput,
    });

    const laterGoal = computeLocalCreationPreview({
      contextSummary,
      creationInput: baseCreationInput,
      minimalPlan: {
        goals: [
          {
            ...minimalPlan.goals[0],
            target_date: "2026-07-01",
          },
        ],
      },
    });

    expect(earlierGoal.projectionChart.end_date).not.toBe(laterGoal.projectionChart.end_date);
    expect(earlierGoal.projectionChart.points.length).not.toBe(
      laterGoal.projectionChart.points.length,
    );
  });

  it("computes readiness delta diagnostics when baseline is provided", () => {
    const baseline: PreviewReadinessSnapshot = {
      readiness_score: 55,
      predicted_load_tss: 320,
      predicted_fatigue_atl: 48,
      feasibility_state: "aggressive",
      tss_ramp_clamp_weeks: 0,
      ctl_ramp_clamp_weeks: 0,
    };

    const preview = computeLocalCreationPreview({
      minimalPlan,
      creationInput: baseCreationInput,
      contextSummary,
      previewBaseline: baseline,
    });

    expect(preview.readinessDeltaDiagnostics).toBeDefined();
    expect(preview.previewSnapshotBaseline).not.toBeNull();
  });

  it("keeps local preview projection in parity with server recompute mapping across fixture histories", () => {
    const fixtures: Array<{
      name: string;
      minimalPlan: typeof minimalPlan;
      creationInput: CreationNormalizationInput;
      startingCtlOverride?: number;
      startingAtlOverride?: number;
    }> = [
      {
        name: "low",
        minimalPlan,
        creationInput: baseCreationInput,
        startingCtlOverride: 16,
        startingAtlOverride: 18,
      },
      {
        name: "sparse",
        minimalPlan,
        creationInput: baseCreationInput,
        startingCtlOverride: 34,
        startingAtlOverride: 37,
      },
      {
        name: "rich",
        minimalPlan,
        creationInput: {
          user_values: {
            behavior_controls_v1: {
              ...baseBehaviorControls,
              aggressiveness: 0.7,
              recovery_priority: 0.45,
            },
          },
        } satisfies CreationNormalizationInput,
        startingCtlOverride: 58,
        startingAtlOverride: 62,
      },
      {
        name: "no-history",
        minimalPlan,
        creationInput: baseCreationInput,
      },
    ];

    for (const fixture of fixtures) {
      const local = computeLocalCreationPreview({
        minimalPlan: fixture.minimalPlan,
        creationInput: fixture.creationInput,
        contextSummary,
        startingCtlOverride: fixture.startingCtlOverride,
        startingAtlOverride: fixture.startingAtlOverride,
      });
      const server = buildServerRecomputeProjectionChartLike({
        minimalPlan: fixture.minimalPlan,
        creationInput: fixture.creationInput,
        startingCtlOverride: fixture.startingCtlOverride,
        startingAtlOverride: fixture.startingAtlOverride,
      });

      const localDates = local.projectionChart.points.map((point) => point.date);
      const sortedDates = [...localDates].sort((a, b) => a.localeCompare(b));

      expect(localDates, `${fixture.name} local dates sorted`).toEqual(sortedDates);
      expect(server.points.map((point) => point.date)).toEqual(localDates);
      expect(local.projectionChart.goal_markers).toEqual(server.goal_markers);
      expect(local.projectionChart.constraint_summary).toEqual(server.constraint_summary);

      const tolerance = 0.05;
      for (let i = 0; i < local.projectionChart.points.length; i += 1) {
        const localPoint = local.projectionChart.points[i]!;
        const serverPoint = server.points[i]!;

        expect(localPoint.date).toBe(serverPoint.date);
        expect(
          Math.abs(localPoint.predicted_load_tss - serverPoint.predicted_load_tss),
          `${fixture.name} point ${i} predicted_load_tss`,
        ).toBeLessThanOrEqual(tolerance);
        expect(
          Math.abs(localPoint.predicted_fatigue_atl - serverPoint.predicted_fatigue_atl),
          `${fixture.name} point ${i} predicted_fatigue_atl`,
        ).toBeLessThanOrEqual(tolerance);
        expect(
          Math.abs(localPoint.predicted_fitness_ctl - serverPoint.predicted_fitness_ctl),
          `${fixture.name} point ${i} predicted_fitness_ctl`,
        ).toBeLessThanOrEqual(tolerance);
        expect(
          Math.abs(localPoint.readiness_score - serverPoint.readiness_score),
          `${fixture.name} point ${i} readiness_score`,
        ).toBeLessThanOrEqual(tolerance);
      }

      expect(local.projectionChart.readiness_score).toBeCloseTo(server.readiness_score, 4);
      expect(server.readiness_confidence).toBeDefined();
      expect(local.projectionChart.readiness_confidence).toBeCloseTo(
        server.readiness_confidence ?? 0,
        4,
      );
    }
  });
});

function buildServerRecomputeProjectionChartLike(input: {
  minimalPlan: typeof minimalPlan;
  creationInput: CreationNormalizationInput;
  startingCtlOverride?: number;
  startingAtlOverride?: number;
}) {
  const finalConfig = normalizeCreationConfig(input.creationInput);
  const expandedPlan = buildExpandedPlanFromMinimalGoal(input.minimalPlan, {
    startingCtl: input.startingCtlOverride,
  });

  const deterministicProjection = buildDeterministicProjectionPayload(
    buildProjectionEngineInput({
      expanded_plan: expandedPlan,
      normalized_creation_config: finalConfig,
      starting_ctl: input.startingCtlOverride,
      starting_atl: input.startingAtlOverride,
    }),
  );

  return {
    ...deterministicProjection,
    periodization_phases: expandedPlan.blocks.map((block, index) => ({
      id: deterministicUuidFromSeed(
        `projection-phase|${expandedPlan.start_date}|${expandedPlan.end_date}|${index}|${block.name}|${block.start_date}|${block.end_date}`,
      ),
      name: block.name,
      start_date: block.start_date,
      end_date: block.end_date,
      target_weekly_tss_min: Math.round((block.target_weekly_tss_range?.min ?? 0) * 10) / 10,
      target_weekly_tss_max: Math.round((block.target_weekly_tss_range?.max ?? 0) * 10) / 10,
    })),
    microcycles: deterministicProjection.microcycles.map((microcycle) => ({
      id: deterministicUuidFromSeed(
        `projection-microcycle|${expandedPlan.start_date}|${microcycle.week_start_date}|${microcycle.week_end_date}`,
      ),
      ...microcycle,
    })),
  };
}
