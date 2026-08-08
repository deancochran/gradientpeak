import type { CreationNormalizationInput, PreviewReadinessSnapshot } from "@repo/core";
import {
  buildDeterministicProjectionPayload,
  buildProjectionChartPayloadFromDeterministicProjection,
  buildProjectionEngineInput,
  defaultAthletePreferenceProfile,
  normalizeCreationConfig,
} from "@repo/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildGoalProjectionPlan, computeLocalCreationPreview } from "./localPreview";

const frozenToday = new Date("2026-01-01T00:00:00.000Z");

const projectionInput = {
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
  recommended_baseline_load_range: { min: 280, max: 420 },
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
    behavior_controls: baseBehaviorControls,
  },
};

describe("computeLocalCreationPreview", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(frozenToday);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("builds a local projection chart and conflict summary", () => {
    const preview = computeLocalCreationPreview({
      projectionInput,
      creationInput: baseCreationInput,
      contextSummary,
      startingLongTermLoadOverride: 42,
      startingAtlOverride: 50,
    });

    expect(preview.projectionChart.points.length).toBeGreaterThan(0);
    expect(preview.projectionChart.periodization_phases.length).toBeGreaterThan(0);
    expect(Array.isArray(preview.conflicts)).toBe(true);
    expect(preview.feasibilitySummary).toBeDefined();
  });

  it("recomputes different projection outputs when inputs change", () => {
    const earlierGoal = computeLocalCreationPreview({
      projectionInput,
      contextSummary,
      creationInput: baseCreationInput,
    });

    const laterGoal = computeLocalCreationPreview({
      contextSummary,
      creationInput: baseCreationInput,
      projectionInput: {
        goals: [
          {
            ...projectionInput.goals[0],
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
      predicted_load: 320,
      predicted_fatigue_recentLoad: 48,
      feasibility_state: "aggressive",
      load_ramp_clamp_weeks: 0,
      longTermLoad_ramp_clamp_weeks: 0,
    };

    const preview = computeLocalCreationPreview({
      projectionInput,
      creationInput: baseCreationInput,
      contextSummary,
      previewBaseline: baseline,
    });

    expect(preview.readinessDeltaDiagnostics).toBeDefined();
    expect(preview.previewSnapshotBaseline).not.toBeNull();
  });

  it("forwards profile settings into goal readiness targets", () => {
    const preview = computeLocalCreationPreview({
      projectionInput,
      creationInput: baseCreationInput,
      contextSummary,
      profileSettings: {
        ...defaultAthletePreferenceProfile,
        goal_strategy_preferences: {
          ...defaultAthletePreferenceProfile.goal_strategy_preferences,
          target_surplus_preference: 0.45,
        },
      },
    });

    expect(preview.projectionChart.goal_assessments?.[0]?.goal_readiness_target).toBe(103);
  });

  it("keeps local preview projection in parity with server recompute mapping across fixture histories", () => {
    const fixtures: Array<{
      name: string;
      projectionInput: typeof projectionInput;
      creationInput: CreationNormalizationInput;
      startingLongTermLoadOverride?: number;
      startingAtlOverride?: number;
    }> = [
      {
        name: "low",
        projectionInput,
        creationInput: baseCreationInput,
        startingLongTermLoadOverride: 16,
        startingAtlOverride: 18,
      },
      {
        name: "sparse",
        projectionInput,
        creationInput: baseCreationInput,
        startingLongTermLoadOverride: 34,
        startingAtlOverride: 37,
      },
      {
        name: "rich",
        projectionInput,
        creationInput: {
          user_values: {
            behavior_controls: {
              ...baseBehaviorControls,
              aggressiveness: 0.7,
              recovery_priority: 0.45,
            },
          },
        } satisfies CreationNormalizationInput,
        startingLongTermLoadOverride: 58,
        startingAtlOverride: 62,
      },
      {
        name: "no-history",
        projectionInput,
        creationInput: baseCreationInput,
      },
    ];

    for (const fixture of fixtures) {
      const local = computeLocalCreationPreview({
        projectionInput: fixture.projectionInput,
        creationInput: fixture.creationInput,
        contextSummary,
        startingLongTermLoadOverride: fixture.startingLongTermLoadOverride,
        startingAtlOverride: fixture.startingAtlOverride,
      });
      const server = buildServerRecomputeProjectionChartLike({
        projectionInput: fixture.projectionInput,
        creationInput: fixture.creationInput,
        startingLongTermLoadOverride: fixture.startingLongTermLoadOverride,
        startingAtlOverride: fixture.startingAtlOverride,
      });

      const localDates = local.projectionChart.points.map((point) => point.date);
      const sortedDates = [...localDates].sort((a, b) => a.localeCompare(b));

      expect(localDates, `${fixture.name} local dates sorted`).toEqual(sortedDates);
      expect(server.points.map((point) => point.date)).toEqual(localDates);
      expect(local.projectionChart.goal_markers).toEqual(server.goal_markers);
      expect(local.projectionChart.constraint_summary).toEqual(server.constraint_summary);
      expect(local.projectionChart.load_resolution_summary).toEqual(server.load_resolution_summary);
      expect(local.projectionChart.projection_diagnostics?.load_resolution_summary).toEqual(
        server.projection_diagnostics?.load_resolution_summary,
      );

      const tolerance = 0.05;
      for (let i = 0; i < local.projectionChart.points.length; i += 1) {
        const localPoint = local.projectionChart.points[i];
        const serverPoint = server.points[i];
        if (!localPoint || !serverPoint) {
          throw new Error(`Missing projection point ${i} for ${fixture.name}`);
        }

        expect(localPoint.date).toBe(serverPoint.date);
        expect(
          Math.abs(localPoint.predicted_load - serverPoint.predicted_load),
          `${fixture.name} point ${i} predicted_load`,
        ).toBeLessThanOrEqual(tolerance);
        expect(
          Math.abs(
            localPoint.predicted_fatigue_recentLoad - serverPoint.predicted_fatigue_recentLoad,
          ),
          `${fixture.name} point ${i} predicted_fatigue_recentLoad`,
        ).toBeLessThanOrEqual(tolerance);
        expect(
          Math.abs(
            localPoint.predicted_fitness_longTermLoad - serverPoint.predicted_fitness_longTermLoad,
          ),
          `${fixture.name} point ${i} predicted_fitness_longTermLoad`,
        ).toBeLessThanOrEqual(tolerance);
        expect(
          Math.abs(localPoint.readiness_score - serverPoint.readiness_score),
          `${fixture.name} point ${i} readiness_score`,
        ).toBeLessThanOrEqual(tolerance);
      }

      expect(local.projectionChart.readiness_score).toBeCloseTo(server.readiness_score ?? 0, 4);
      expect(server.readiness_confidence).toBeDefined();
      expect(local.projectionChart.readiness_confidence).toBeCloseTo(
        server.readiness_confidence ?? 0,
        4,
      );
    }
  });
});

function buildServerRecomputeProjectionChartLike(input: {
  projectionInput: typeof projectionInput;
  creationInput: CreationNormalizationInput;
  startingLongTermLoadOverride?: number;
  startingAtlOverride?: number;
}) {
  const finalConfig = normalizeCreationConfig(input.creationInput);
  const expandedPlan = buildGoalProjectionPlan(input.projectionInput, {
    startingLongTermLoad: input.startingLongTermLoadOverride,
  });

  const deterministicProjection = buildDeterministicProjectionPayload(
    buildProjectionEngineInput({
      expanded_plan: expandedPlan,
      normalized_creation_config: finalConfig,
      starting_longTermLoad: input.startingLongTermLoadOverride,
      starting_recentLoad: input.startingAtlOverride,
    }),
  );

  return buildProjectionChartPayloadFromDeterministicProjection({
    expandedPlan,
    deterministicProjection,
  });
}
