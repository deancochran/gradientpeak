import { describe, expect, it } from "vitest";
import {
  buildDeterministicProjectionPayload,
  clampNoHistoryFloorByAvailability,
  collectNoHistoryEvidence,
  deriveNoHistoryProjectionFloor,
  deriveGoalDemandProfileFromTargets,
  determineNoHistoryFitnessLevel,
  getOptimizationProfileBehavior,
  mapFeasibilityToConfidence,
  resolveNoHistoryAnchor,
  classifyBuildTimeFeasibility,
  getProjectionWeekPattern,
  weeklyLoadFromBlockAndBaseline,
} from "../projectionCalculations";
import { buildDeterministicProjectionPayload as buildDeterministicProjectionPayloadFromEngine } from "../projection/engine";

describe("projection calculations", () => {
  it("keeps engine entrypoint behavior aligned with legacy projectionCalculations export", () => {
    const input: Parameters<typeof buildDeterministicProjectionPayload>[0] = {
      timeline: {
        start_date: "2026-01-05",
        end_date: "2026-01-25",
      },
      blocks: [
        {
          name: "Build",
          phase: "build",
          start_date: "2026-01-05",
          end_date: "2026-01-25",
          target_weekly_tss_range: { min: 280, max: 320 },
        },
      ],
      goals: [
        {
          id: "goal-1",
          name: "B Race",
          target_date: "2026-01-25",
          priority: 1,
        },
      ],
      starting_ctl: 35,
    };

    const legacyProjection = buildDeterministicProjectionPayload(input);
    const engineProjection =
      buildDeterministicProjectionPayloadFromEngine(input);

    expect(engineProjection).toEqual(legacyProjection);
  });

  it("blends block target range and baseline weekly TSS", () => {
    const weeklyTss = weeklyLoadFromBlockAndBaseline(
      {
        target_weekly_tss_range: { min: 280, max: 320 },
      },
      200,
    );

    expect(weeklyTss).toBe(240);
  });

  it("uses baseline weekly TSS when block has no target range", () => {
    expect(weeklyLoadFromBlockAndBaseline(undefined, 187.34)).toBe(187.3);
  });

  it("uses prior state and demand context in rolling weekly composition", () => {
    const weeklyTss = weeklyLoadFromBlockAndBaseline(
      {
        target_weekly_tss_range: { min: 260, max: 300 },
      },
      200,
      {
        previous_week_tss: 320,
        demand_floor_weekly_tss: 360,
      },
    );

    expect(weeklyTss).toBe(316);
  });

  it("classifies event week when goal lands inside week", () => {
    const pattern = getProjectionWeekPattern({
      blockPhase: "build",
      weekIndexWithinBlock: 1,
      weekStartDate: "2026-03-09",
      weekEndDate: "2026-03-15",
      goals: [{ target_date: "2026-03-12" }],
    });

    expect(pattern).toEqual({ pattern: "event", multiplier: 0.82 });
  });

  it("classifies pre-goal week as taper", () => {
    const pattern = getProjectionWeekPattern({
      blockPhase: "build",
      weekIndexWithinBlock: 1,
      weekStartDate: "2026-03-02",
      weekEndDate: "2026-03-08",
      goals: [{ target_date: "2026-03-14" }],
    });

    expect(pattern).toEqual({ pattern: "taper", multiplier: 0.9 });
  });

  it("applies stronger taper impact for higher-priority goals", () => {
    const highPriorityPattern = getProjectionWeekPattern({
      blockPhase: "build",
      weekIndexWithinBlock: 1,
      weekStartDate: "2026-03-02",
      weekEndDate: "2026-03-08",
      goals: [{ target_date: "2026-03-13", priority: 1 }],
    });
    const lowPriorityPattern = getProjectionWeekPattern({
      blockPhase: "build",
      weekIndexWithinBlock: 1,
      weekStartDate: "2026-03-02",
      weekEndDate: "2026-03-08",
      goals: [{ target_date: "2026-03-13", priority: 8 }],
    });

    expect(highPriorityPattern.pattern).toBe("taper");
    expect(lowPriorityPattern.pattern).toBe("taper");
    expect(highPriorityPattern.multiplier).toBeLessThan(
      lowPriorityPattern.multiplier,
    );
  });

  it("blends multi-goal taper influence using priority-aware weighting", () => {
    const highPriorityOnly = getProjectionWeekPattern({
      blockPhase: "build",
      weekIndexWithinBlock: 1,
      weekStartDate: "2026-03-02",
      weekEndDate: "2026-03-08",
      goals: [{ target_date: "2026-03-10", priority: 1 }],
    });
    const lowPriorityOnly = getProjectionWeekPattern({
      blockPhase: "build",
      weekIndexWithinBlock: 1,
      weekStartDate: "2026-03-02",
      weekEndDate: "2026-03-08",
      goals: [{ target_date: "2026-03-09", priority: 8 }],
    });
    const combined = getProjectionWeekPattern({
      blockPhase: "build",
      weekIndexWithinBlock: 1,
      weekStartDate: "2026-03-02",
      weekEndDate: "2026-03-08",
      goals: [
        { target_date: "2026-03-10", priority: 1 },
        { target_date: "2026-03-09", priority: 8 },
      ],
    });

    expect(combined.pattern).toBe("taper");
    expect(combined.multiplier).toBeGreaterThan(highPriorityOnly.multiplier);
    expect(combined.multiplier).toBeLessThan(lowPriorityOnly.multiplier);
  });

  it("uses continuous weekly evolution without discrete deload cliffs", () => {
    const projection = buildDeterministicProjectionPayload({
      timeline: {
        start_date: "2026-01-05",
        end_date: "2026-02-01",
      },
      blocks: [
        {
          name: "Build",
          phase: "build",
          start_date: "2026-01-05",
          end_date: "2026-02-01",
          target_weekly_tss_range: { min: 280, max: 280 },
        },
      ],
      goals: [
        {
          id: "goal-1",
          name: "steady",
          target_date: "2026-03-01",
          priority: 1,
        },
      ],
      starting_ctl: 40,
    });

    const week3 = projection.microcycles[2]?.planned_weekly_tss ?? 0;
    const week4 = projection.microcycles[3]?.planned_weekly_tss ?? 0;
    expect(week4).toBeGreaterThan(0);
    expect(Math.abs(week4 - week3)).toBeLessThanOrEqual(
      Math.max(15, week3 * 0.1),
    );
  });
});

describe("deterministic projection goal conflict weighting", () => {
  it("reduces weekly TSS more when the conflicting high-priority goal is more urgent", () => {
    const highPriorityUrgent = buildDeterministicProjectionPayload({
      timeline: {
        start_date: "2026-03-02",
        end_date: "2026-03-08",
      },
      blocks: [
        {
          name: "Build",
          phase: "build",
          start_date: "2026-03-02",
          end_date: "2026-03-08",
          target_weekly_tss_range: { min: 200, max: 200 },
        },
      ],
      goals: [
        {
          id: "goal-urgent",
          name: "A race",
          target_date: "2026-03-10",
          priority: 10,
        },
        {
          id: "goal-secondary",
          name: "B race",
          target_date: "2026-03-13",
          priority: 0,
        },
      ],
      starting_ctl: 28,
      creation_config: {
        optimization_profile: "balanced",
        post_goal_recovery_days: 0,
        max_weekly_tss_ramp_pct: 20,
        max_ctl_ramp_per_week: 8,
      },
    });

    const lowPriorityUrgent = buildDeterministicProjectionPayload({
      timeline: {
        start_date: "2026-03-02",
        end_date: "2026-03-08",
      },
      blocks: [
        {
          name: "Build",
          phase: "build",
          start_date: "2026-03-02",
          end_date: "2026-03-08",
          target_weekly_tss_range: { min: 200, max: 200 },
        },
      ],
      goals: [
        {
          id: "goal-urgent",
          name: "A race",
          target_date: "2026-03-10",
          priority: 0,
        },
        {
          id: "goal-secondary",
          name: "B race",
          target_date: "2026-03-13",
          priority: 10,
        },
      ],
      starting_ctl: 28,
      creation_config: {
        optimization_profile: "balanced",
        post_goal_recovery_days: 0,
        max_weekly_tss_ramp_pct: 20,
        max_ctl_ramp_per_week: 8,
      },
    });

    expect(
      highPriorityUrgent.microcycles[0]?.planned_weekly_tss,
    ).toBeLessThanOrEqual(
      lowPriorityUrgent.microcycles[0]?.planned_weekly_tss ?? 0,
    );
  });
});

describe("deterministic inferred current state", () => {
  const baseInput: Parameters<typeof buildDeterministicProjectionPayload>[0] = {
    timeline: {
      start_date: "2026-03-02",
      end_date: "2026-03-23",
    },
    blocks: [
      {
        name: "Build",
        phase: "build",
        start_date: "2026-03-02",
        end_date: "2026-03-23",
        target_weekly_tss_range: { min: 200, max: 240 },
      },
    ],
    goals: [
      {
        id: "goal-state",
        name: "Spring race",
        target_date: "2026-03-23",
        priority: 2,
      },
    ],
    starting_ctl: 32,
    starting_atl: 35,
  };

  it("emits inferred_current_state with bootstrap metadata", () => {
    const projection = buildDeterministicProjectionPayload(baseInput);

    expect(projection.inferred_current_state.as_of).toBe(
      "2026-03-02T00:00:00.000Z",
    );
    expect(projection.inferred_current_state.mean.ctl).toBeGreaterThanOrEqual(
      0,
    );
    expect(projection.inferred_current_state.mean.atl).toBeGreaterThanOrEqual(
      0,
    );
    expect(
      projection.inferred_current_state.uncertainty.state_variance,
    ).toBeGreaterThanOrEqual(0);
    expect(
      projection.inferred_current_state.uncertainty.state_variance,
    ).toBeLessThanOrEqual(1);
    expect(
      projection.inferred_current_state.evidence_quality.score,
    ).toBeGreaterThanOrEqual(0);
    expect(
      projection.inferred_current_state.evidence_quality.score,
    ).toBeLessThanOrEqual(1);
    expect(
      projection.inferred_current_state.metadata.missingness_counter,
    ).toBeGreaterThanOrEqual(0);
    expect(
      projection.inferred_current_state.metadata.evidence_counter,
    ).toBeGreaterThanOrEqual(0);
  });

  it("reuses prior inferred snapshot deterministically", () => {
    const priorSnapshot = {
      mean: {
        ctl: 60,
        atl: 55,
        tsb: 5,
        slb: 0.92,
        durability: 72,
        readiness: 70,
      },
      uncertainty: {
        state_variance: 0.22,
        confidence: 0.78,
      },
      evidence_quality: {
        score: 0.82,
        missingness_ratio: 0.18,
      },
      as_of: "2026-03-02T00:00:00.000Z",
      metadata: {
        updated_at: "2026-03-02T00:00:00.000Z",
        missingness_counter: 2,
        evidence_counter: 8,
      },
    };

    const first = buildDeterministicProjectionPayload({
      ...baseInput,
      prior_inferred_snapshot: priorSnapshot,
    });
    const second = buildDeterministicProjectionPayload({
      ...baseInput,
      prior_inferred_snapshot: priorSnapshot,
    });

    expect(first.inferred_current_state).toEqual(second.inferred_current_state);
    expect(
      first.constraint_summary.starting_state.starting_state_is_prior,
    ).toBe(true);
    expect(
      first.constraint_summary.starting_state.starting_ctl,
    ).toBeGreaterThan(baseInput.starting_ctl ?? 0);
    expect(first.constraint_summary.starting_state.starting_ctl).toBe(
      first.inferred_current_state.mean.ctl,
    );
  });
});

describe("deterministic weekly TSS optimizer", () => {
  const optimizerFixture: Parameters<
    typeof buildDeterministicProjectionPayload
  >[0] = {
    timeline: {
      start_date: "2026-01-05",
      end_date: "2026-02-08",
    },
    blocks: [
      {
        name: "Build",
        phase: "build",
        start_date: "2026-01-05",
        end_date: "2026-02-08",
        target_weekly_tss_range: { min: 320, max: 360 },
      },
    ],
    goals: [
      {
        id: "goal-a",
        name: "Goal A",
        target_date: "2026-02-08",
        priority: 1,
      },
    ],
    starting_ctl: 44,
    creation_config: {
      optimization_profile: "outcome_first",
      post_goal_recovery_days: 0,
      max_weekly_tss_ramp_pct: 16,
      max_ctl_ramp_per_week: 8,
    },
  };

  const weightedGoalReadiness = (
    projection: ReturnType<typeof buildDeterministicProjectionPayload>,
  ): number => {
    const resolveGoalReadiness = (targetDate: string): number => {
      const exact = projection.points.find(
        (point) => point.date === targetDate,
      );
      if (exact) {
        return exact.readiness_score;
      }

      let nearest = projection.points[0];
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (const point of projection.points) {
        const distance = Math.abs(
          Date.parse(`${point.date}T00:00:00.000Z`) -
            Date.parse(`${targetDate}T00:00:00.000Z`),
        );
        if (distance < nearestDistance) {
          nearest = point;
          nearestDistance = distance;
        }
      }

      return nearest?.readiness_score ?? 0;
    };

    let weightedTotal = 0;
    let totalWeight = 0;
    for (const goal of projection.goal_markers) {
      const priority = Math.max(
        1,
        Math.min(10, Math.round(goal.priority ?? 1)),
      );
      const weight = 11 - priority;
      weightedTotal += resolveGoalReadiness(goal.target_date) * weight;
      totalWeight += weight;
    }

    return totalWeight > 0 ? weightedTotal / totalWeight : 0;
  };

  it("does not worsen weekly decisions vs naive constrained path", () => {
    const optimized = buildDeterministicProjectionPayload(optimizerFixture);
    const naive = buildDeterministicProjectionPayload({
      ...optimizerFixture,
      disable_weekly_tss_optimizer: true,
    });

    const hasDecisionDiff = optimized.microcycles.some(
      (cycle, index) =>
        cycle.planned_weekly_tss !==
        naive.microcycles[index]?.planned_weekly_tss,
    );

    if (hasDecisionDiff) {
      expect(weightedGoalReadiness(optimized)).toBeGreaterThanOrEqual(
        weightedGoalReadiness(naive),
      );
    } else {
      expect(optimized.microcycles).toEqual(naive.microcycles);
    }
  });

  it("improves or preserves weighted goal-day readiness", () => {
    const optimized = buildDeterministicProjectionPayload(optimizerFixture);
    const naive = buildDeterministicProjectionPayload({
      ...optimizerFixture,
      disable_weekly_tss_optimizer: true,
    });

    expect(weightedGoalReadiness(optimized)).toBeGreaterThanOrEqual(
      weightedGoalReadiness(naive),
    );
  });

  it("maximizes safe preparedness toward readiness 100", () => {
    const optimized = buildDeterministicProjectionPayload(optimizerFixture);
    const baseline = buildDeterministicProjectionPayload({
      ...optimizerFixture,
      disable_weekly_tss_optimizer: true,
    });

    expect(optimized.readiness_score).toBeGreaterThanOrEqual(
      baseline.readiness_score,
    );
    expect(
      optimized.microcycles.every((cycle) => {
        const tssRamp = cycle.metadata.tss_ramp;
        const ctlRamp = cycle.metadata.ctl_ramp;
        const requestedRampPct =
          tssRamp.previous_week_tss <= 0
            ? 0
            : ((tssRamp.applied_weekly_tss - tssRamp.previous_week_tss) /
                tssRamp.previous_week_tss) *
              100;

        return (
          requestedRampPct <= tssRamp.max_weekly_tss_ramp_pct + 0.001 &&
          ctlRamp.applied_ctl_ramp <= ctlRamp.max_ctl_ramp_per_week + 0.001
        );
      }),
    ).toBe(true);
  });

  it("remains deterministic for multi-goal plans", () => {
    const multiGoalInput: Parameters<
      typeof buildDeterministicProjectionPayload
    >[0] = {
      ...optimizerFixture,
      goals: [
        {
          id: "goal-primary",
          name: "Primary",
          target_date: "2026-02-08",
          priority: 1,
        },
        {
          id: "goal-secondary",
          name: "Secondary",
          target_date: "2026-01-31",
          priority: 4,
        },
      ],
    };

    const first = buildDeterministicProjectionPayload(multiGoalInput);
    const second = buildDeterministicProjectionPayload(multiGoalInput);

    expect(first.microcycles).toEqual(second.microcycles);
    expect(first.points).toEqual(second.points);
  });

  it("maps optimization profile to distinct optimizer behavior", () => {
    const aggressive = getOptimizationProfileBehavior("outcome_first");
    const balanced = getOptimizationProfileBehavior("balanced");
    const stable = getOptimizationProfileBehavior("sustainable");

    expect(aggressive.optimizer_lookahead_weeks).toBeGreaterThan(
      balanced.optimizer_lookahead_weeks,
    );
    expect(stable.volatility_penalty_weight).toBeGreaterThan(
      balanced.volatility_penalty_weight,
    );
    expect(aggressive.goal_readiness_weight).toBeGreaterThan(
      stable.goal_readiness_weight,
    );
  });
});

describe("no-history anchor orchestration", () => {
  it("applies confidence-weighted metadata for sparse history", () => {
    const anchor = resolveNoHistoryAnchor({
      history_availability_state: "sparse",
      goal_tier: "high",
      weeks_to_event: 18,
      context_summary: {
        history_availability_state: "sparse",
        recent_consistency_marker: "high",
        effort_confidence_marker: "high",
        profile_metric_completeness_marker: "high",
        signal_quality: 0.95,
        recommended_baseline_tss_range: { min: 120, max: 280 },
        recommended_recent_influence_range: { min: -0.2, max: 0.3 },
        recommended_sessions_per_week_range: { min: 4, max: 6 },
        rationale_codes: ["history_sparse"],
      },
    });

    expect(anchor.projection_floor_applied).toBe(true);
    expect(anchor.projection_floor_values).not.toBeNull();
    expect(anchor.fitness_level).toBeTypeOf("string");
    expect(anchor.evidence_confidence?.state).toBe("sparse");
    expect(anchor.evidence_confidence?.score ?? 0).toBeGreaterThan(0);
  });

  it("keeps rich/fresh evidence dominant without forcing floor priors", () => {
    const anchor = resolveNoHistoryAnchor({
      history_availability_state: "rich",
      goal_tier: "medium",
      weeks_to_event: 18,
      context_summary: {
        history_availability_state: "rich",
        recent_consistency_marker: "high",
        effort_confidence_marker: "high",
        profile_metric_completeness_marker: "high",
        signal_quality: 0.95,
        recommended_baseline_tss_range: { min: 180, max: 320 },
        recommended_recent_influence_range: { min: -0.1, max: 0.2 },
        recommended_sessions_per_week_range: { min: 5, max: 7 },
        rationale_codes: ["history_rich"],
      },
    });

    expect(anchor.projection_floor_applied).toBe(false);
    expect(anchor.projection_floor_values).toBeNull();
    expect(anchor.evidence_confidence?.state).toBe("rich");
    expect(anchor.evidence_confidence?.score ?? 0).toBeGreaterThan(0.7);
  });

  it("discounts confidence when stale markers are present", () => {
    const stale = resolveNoHistoryAnchor({
      history_availability_state: "rich",
      goal_tier: "medium",
      weeks_to_event: 18,
      context_summary: {
        history_availability_state: "rich",
        recent_consistency_marker: "high",
        effort_confidence_marker: "high",
        profile_metric_completeness_marker: "high",
        signal_quality: 0.95,
        recommended_baseline_tss_range: { min: 180, max: 320 },
        recommended_recent_influence_range: { min: -0.1, max: 0.2 },
        recommended_sessions_per_week_range: { min: 5, max: 7 },
        rationale_codes: ["history_stale"],
      },
    });

    expect(stale.evidence_confidence?.state).toBe("stale");
    expect(stale.evidence_confidence?.score ?? 1).toBeLessThan(0.8);
  });

  it("applies strong confidence floor for aggressive marathon pace targets", () => {
    const anchor = resolveNoHistoryAnchor({
      history_availability_state: "none",
      goal_tier: "high",
      goal_targets: [
        {
          target_type: "race_performance",
          distance_m: 42195,
          target_time_s: 10740,
        },
      ],
      weeks_to_event: 40,
      context_summary: {
        history_availability_state: "none",
        recent_consistency_marker: "low",
        effort_confidence_marker: "low",
        profile_metric_completeness_marker: "low",
        signal_quality: 0.05,
        recommended_baseline_tss_range: { min: 30, max: 60 },
        recommended_recent_influence_range: { min: -0.5, max: 0.5 },
        recommended_sessions_per_week_range: { min: 3, max: 5 },
        rationale_codes: ["history_none"],
      },
    });

    expect(anchor.required_peak_weekly_tss?.target ?? 0).toBeGreaterThan(450);
    expect(anchor.evidence_confidence?.score ?? 0).toBeGreaterThanOrEqual(0.75);
    expect(anchor.fitness_inference_reasons).toContain(
      "demand_model_dynamic_continuous_v1",
    );
    expect(anchor.fitness_inference_reasons).toContain(
      "race_performance_target_with_pace",
    );
  });

  it("keeps demand continuous for nearby marathon target times", () => {
    const faster = deriveGoalDemandProfileFromTargets({
      goalTier: "high",
      weeksToEvent: 18,
      goalTargets: [
        {
          target_type: "race_performance",
          distance_m: 42195,
          target_time_s: 11400,
        },
      ],
    });
    const slightlySlower = deriveGoalDemandProfileFromTargets({
      goalTier: "high",
      weeksToEvent: 18,
      goalTargets: [
        {
          target_type: "race_performance",
          distance_m: 42195,
          target_time_s: 11460,
        },
      ],
    });

    const delta =
      (faster.required_event_demand_range.target ?? 0) -
      (slightlySlower.required_event_demand_range.target ?? 0);

    expect(delta).toBeGreaterThan(0);
    expect(delta).toBeLessThan(1);
  });

  it("keeps race demand monotonic with faster targets requiring at least as much demand", () => {
    const targetTimes = [15000, 13500, 12600, 11700, 10800];
    const demands = targetTimes.map(
      (targetTime) =>
        deriveGoalDemandProfileFromTargets({
          goalTier: "high",
          weeksToEvent: 20,
          goalTargets: [
            {
              target_type: "race_performance",
              distance_m: 42195,
              target_time_s: targetTime,
            },
          ],
        }).required_event_demand_range.target,
    );

    for (let i = 1; i < demands.length; i += 1) {
      expect(demands[i - 1] ?? 0).toBeLessThanOrEqual(demands[i] ?? 0);
    }
  });

  it("produces non-bucket demand outputs across marathon time sweep", () => {
    const times = Array.from({ length: 13 }, (_, index) => 10800 + index * 300);
    const distinctDemands = new Set(
      times.map(
        (targetTime) =>
          deriveGoalDemandProfileFromTargets({
            goalTier: "high",
            weeksToEvent: 22,
            goalTargets: [
              {
                target_type: "race_performance",
                distance_m: 42195,
                target_time_s: targetTime,
              },
            ],
          }).required_event_demand_range.target,
      ),
    );

    expect(distinctDemands.size).toBeGreaterThan(8);
  });

  it("keeps CTL and weekly TSS floor invariant from canonical matrix", () => {
    const floor = deriveNoHistoryProjectionFloor("high", "weak");

    expect(floor.start_ctl_floor).toBe(35);
    expect(floor.start_weekly_tss_floor).toBe(
      Math.round(floor.start_ctl_floor * 7),
    );
  });

  it("clamps no-history floor by availability and returns clamp flag", () => {
    const floor = deriveNoHistoryProjectionFloor("high", "strong");
    const clamped = clampNoHistoryFloorByAvailability(
      floor,
      {
        availability_days: [
          {
            day: "monday",
            windows: [{ start_minute_of_day: 360, end_minute_of_day: 420 }],
          },
          {
            day: "wednesday",
            windows: [{ start_minute_of_day: 360, end_minute_of_day: 420 }],
          },
          {
            day: "saturday",
            windows: [{ start_minute_of_day: 480, end_minute_of_day: 600 }],
          },
        ],
        hard_rest_days: ["wednesday"],
        max_single_session_duration_minutes: 90,
      },
      {
        version: "test-intensity-v1",
        weak_if: 0.66,
        strong_if: 0.72,
        conservative_if: 0.62,
      },
    );

    expect(clamped.floor_clamped_by_availability).toBe(true);
    expect(clamped.reasons).toContain("floor_clamped_by_availability");
    expect(clamped.start_weekly_tss).toBe(Math.round(clamped.start_ctl * 7));
    expect(clamped.start_weekly_tss).toBeLessThan(floor.start_weekly_tss_floor);
  });

  it("defaults fitness inference to weak with deterministic reason tokens", () => {
    const evidence = collectNoHistoryEvidence({
      context_summary: {
        history_availability_state: "none",
        recent_consistency_marker: "moderate",
        effort_confidence_marker: "low",
        profile_metric_completeness_marker: "moderate",
        signal_quality: 0.55,
        recommended_baseline_tss_range: { min: 30, max: 80 },
        recommended_recent_influence_range: { min: -0.4, max: 0.4 },
        recommended_sessions_per_week_range: { min: 3, max: 4 },
        rationale_codes: ["history_none", "profile_metrics_moderate"],
      },
    });
    const inferred = determineNoHistoryFitnessLevel(evidence);

    expect(inferred.fitnessLevel).toBe("weak");
    expect(inferred.reasons).toContain(
      "fitness_defaulted_to_weak_insufficient_strong_signals",
    );

    const resolved = resolveNoHistoryAnchor({
      history_availability_state: "none",
      goal_tier: "medium",
      weeks_to_event: 9,
      context_summary: {
        history_availability_state: "none",
        recent_consistency_marker: "moderate",
        effort_confidence_marker: "low",
        profile_metric_completeness_marker: "moderate",
        signal_quality: 0.55,
        recommended_baseline_tss_range: { min: 30, max: 80 },
        recommended_recent_influence_range: { min: -0.4, max: 0.4 },
        recommended_sessions_per_week_range: { min: 3, max: 4 },
        rationale_codes: ["history_none"],
      },
    });

    expect(resolved.fitness_level).toBe("weak");
    expect(resolved.fitness_inference_reasons).toContain(
      "availability_missing_skip_floor_clamp",
    );
    expect(resolved.starting_ctl_for_projection).toBe(0);
    expect(resolved.fitness_inference_reasons).toContain(
      "starting_ctl_defaulted_never_trained",
    );
  });

  it("supports no-history starting ctl override when explicitly provided", () => {
    const resolved = resolveNoHistoryAnchor({
      history_availability_state: "none",
      goal_tier: "medium",
      weeks_to_event: 12,
      starting_ctl_override: 18,
      context_summary: {
        history_availability_state: "none",
        recent_consistency_marker: "moderate",
        effort_confidence_marker: "low",
        profile_metric_completeness_marker: "moderate",
        signal_quality: 0.5,
        recommended_baseline_tss_range: { min: 30, max: 90 },
        recommended_recent_influence_range: { min: -0.4, max: 0.4 },
        recommended_sessions_per_week_range: { min: 3, max: 5 },
        rationale_codes: ["history_none"],
      },
    });

    expect(resolved.starting_ctl_for_projection).toBe(18);
    expect(resolved.starting_weekly_tss_for_projection).toBe(126);
    expect(resolved.fitness_inference_reasons).toContain(
      "starting_ctl_override_applied",
    );
  });

  it("maps feasibility bands to confidence levels", () => {
    expect(classifyBuildTimeFeasibility("high", 17)).toBe("full");
    expect(classifyBuildTimeFeasibility("high", 12)).toBe("limited");
    expect(classifyBuildTimeFeasibility("high", 10)).toBe("insufficient");

    expect(mapFeasibilityToConfidence("full")).toBe("high");
    expect(mapFeasibilityToConfidence("limited")).toBe("medium");
    expect(mapFeasibilityToConfidence("insufficient")).toBe("low");
  });

  it("downgrades no-history confidence for weak multi-goal long horizon", () => {
    const resolved = resolveNoHistoryAnchor({
      history_availability_state: "none",
      goal_tier: "high",
      weeks_to_event: 60,
      total_horizon_weeks: 90,
      goal_count: 2,
      context_summary: {
        history_availability_state: "none",
        recent_consistency_marker: "moderate",
        effort_confidence_marker: "low",
        profile_metric_completeness_marker: "moderate",
        signal_quality: 0.5,
        recommended_baseline_tss_range: { min: 30, max: 90 },
        recommended_recent_influence_range: { min: -0.4, max: 0.4 },
        recommended_sessions_per_week_range: { min: 3, max: 5 },
        rationale_codes: ["history_none"],
      },
    });

    expect(resolved.projection_floor_confidence).toBe("medium");
    expect(resolved.fitness_inference_reasons).toContain(
      "confidence_downgraded_multi_goal_plan",
    );
  });

  it("emits demand-band floor metadata on constrained early weeks", () => {
    const projection = buildDeterministicProjectionPayload({
      timeline: {
        start_date: "2026-01-05",
        end_date: "2026-03-01",
      },
      blocks: [
        {
          name: "Base",
          phase: "build",
          start_date: "2026-01-05",
          end_date: "2026-01-25",
          target_weekly_tss_range: { min: 90, max: 110 },
        },
      ],
      goals: [
        {
          id: "goal-marathon",
          name: "Marathon",
          target_date: "2026-05-10",
          priority: 1,
        },
      ],
      starting_ctl: 12,
      creation_config: {
        optimization_profile: "balanced",
        post_goal_recovery_days: 5,
        max_weekly_tss_ramp_pct: 20,
        max_ctl_ramp_per_week: 8,
      },
      no_history_context: {
        history_availability_state: "none",
        goal_tier: "high",
        weeks_to_event: 18,
        context_summary: {
          history_availability_state: "none" as const,
          recent_consistency_marker: "moderate",
          effort_confidence_marker: "low",
          profile_metric_completeness_marker: "moderate",
          signal_quality: 0.55,
          recommended_baseline_tss_range: { min: 30, max: 90 },
          recommended_recent_influence_range: { min: -0.4, max: 0.4 },
          recommended_sessions_per_week_range: { min: 3, max: 5 },
          rationale_codes: ["history_none"],
        },
      },
    });

    expect(projection.no_history.projection_floor_applied).toBe(true);
    expect(
      projection.no_history.projection_floor_values?.start_weekly_tss,
    ).toBe(245);
    expect(projection.no_history.evidence_confidence).toBeTruthy();
    expect(projection.no_history.projection_feasibility).toBeTruthy();
    expect(projection.constraint_summary.starting_state.starting_ctl).toBe(0);
    expect(
      projection.microcycles
        .slice(0, 6)
        .some((cycle) =>
          Number.isFinite(
            cycle.metadata.tss_ramp.demand_band_minimum_weekly_tss ??
              Number.NaN,
          ),
        ),
    ).toBe(true);
  });

  it("computes bounded deterministic readiness score and maps readiness band", () => {
    const input: Parameters<typeof buildDeterministicProjectionPayload>[0] = {
      timeline: {
        start_date: "2026-01-05",
        end_date: "2026-03-01",
      },
      blocks: [
        {
          name: "Base",
          phase: "build",
          start_date: "2026-01-05",
          end_date: "2026-03-01",
          target_weekly_tss_range: { min: 90, max: 120 },
        },
      ],
      goals: [
        {
          id: "goal-1",
          name: "A race",
          target_date: "2026-05-10",
          priority: 1,
        },
      ],
      creation_config: {
        optimization_profile: "balanced" as const,
      },
      no_history_context: {
        history_availability_state: "none" as const,
        goal_tier: "high" as const,
        weeks_to_event: 18,
        context_summary: {
          history_availability_state: "none",
          recent_consistency_marker: "moderate",
          effort_confidence_marker: "low",
          profile_metric_completeness_marker: "moderate",
          signal_quality: 0.55,
          recommended_baseline_tss_range: { min: 30, max: 90 },
          recommended_recent_influence_range: { min: -0.4, max: 0.4 },
          recommended_sessions_per_week_range: { min: 3, max: 5 },
          rationale_codes: ["history_none"],
        },
      },
    };
    const first = buildDeterministicProjectionPayload(input);
    const second = buildDeterministicProjectionPayload(input);
    const firstFeasibility = first.no_history.projection_feasibility;
    const secondFeasibility = second.no_history.projection_feasibility;

    expect(firstFeasibility?.readiness_score).toBeGreaterThanOrEqual(0);
    expect(firstFeasibility?.readiness_score).toBeLessThanOrEqual(100);
    expect(firstFeasibility?.readiness_score).toBe(
      secondFeasibility?.readiness_score,
    );
    expect(firstFeasibility?.readiness_components).toBeTruthy();
    expect(firstFeasibility?.projection_uncertainty).toBeTruthy();
    expect(first.readiness_confidence).toBeGreaterThanOrEqual(0);
    expect(first.readiness_confidence).toBeLessThanOrEqual(100);
    expect(first.capacity_envelope?.envelope_score).toBeGreaterThanOrEqual(0);
    expect(first.capacity_envelope?.envelope_score).toBeLessThanOrEqual(100);

    expect(first.readiness_rationale_codes?.length ?? 0).toBeGreaterThan(0);
  });

  it("reduces readiness as demand gap and clamp pressure increase", () => {
    const lenient = buildDeterministicProjectionPayload({
      timeline: { start_date: "2026-01-05", end_date: "2026-03-01" },
      blocks: [
        {
          name: "Build",
          phase: "build",
          start_date: "2026-01-05",
          end_date: "2026-03-01",
          target_weekly_tss_range: { min: 180, max: 220 },
        },
      ],
      goals: [
        { id: "g", name: "Goal", target_date: "2026-05-10", priority: 1 },
      ],
      starting_ctl: 22,
      creation_config: {
        optimization_profile: "outcome_first",
        max_weekly_tss_ramp_pct: 20,
        max_ctl_ramp_per_week: 8,
      },
      no_history_context: {
        history_availability_state: "rich",
        goal_tier: "high",
        weeks_to_event: 18,
        context_summary: {
          history_availability_state: "rich",
          recent_consistency_marker: "high",
          effort_confidence_marker: "high",
          profile_metric_completeness_marker: "high",
          signal_quality: 0.95,
          recommended_baseline_tss_range: { min: 160, max: 260 },
          recommended_recent_influence_range: { min: -0.1, max: 0.2 },
          recommended_sessions_per_week_range: { min: 5, max: 7 },
          rationale_codes: ["history_rich"],
        },
      },
    });

    const constrained = buildDeterministicProjectionPayload({
      timeline: { start_date: "2026-01-05", end_date: "2026-03-01" },
      blocks: [
        {
          name: "Build",
          phase: "build",
          start_date: "2026-01-05",
          end_date: "2026-03-01",
          target_weekly_tss_range: { min: 120, max: 140 },
        },
      ],
      goals: [
        { id: "g", name: "Goal", target_date: "2026-05-10", priority: 1 },
      ],
      starting_ctl: 8,
      creation_config: {
        optimization_profile: "sustainable",
        max_weekly_tss_ramp_pct: 3,
        max_ctl_ramp_per_week: 0.5,
      },
      no_history_context: {
        history_availability_state: "none",
        goal_tier: "high",
        weeks_to_event: 18,
        context_summary: {
          history_availability_state: "none",
          recent_consistency_marker: "low",
          effort_confidence_marker: "low",
          profile_metric_completeness_marker: "low",
          signal_quality: 0.1,
          recommended_baseline_tss_range: { min: 30, max: 90 },
          recommended_recent_influence_range: { min: -0.5, max: 0.5 },
          recommended_sessions_per_week_range: { min: 3, max: 4 },
          rationale_codes: ["history_none"],
        },
      },
    });

    const lenientFeasibility = lenient.no_history.projection_feasibility!;
    const constrainedFeasibility =
      constrained.no_history.projection_feasibility!;

    expect(constrainedFeasibility.readiness_score ?? 100).toBeLessThan(
      lenientFeasibility.readiness_score ?? 0,
    );
    expect(
      constrainedFeasibility.demand_gap.unmet_weekly_tss,
    ).toBeGreaterThanOrEqual(lenientFeasibility.demand_gap.unmet_weekly_tss);
  });

  it("widens uncertainty and lowers readiness with weaker evidence confidence", () => {
    const highConfidence = buildDeterministicProjectionPayload({
      timeline: { start_date: "2026-01-05", end_date: "2026-03-01" },
      blocks: [
        {
          name: "Build",
          phase: "build",
          start_date: "2026-01-05",
          end_date: "2026-03-01",
          target_weekly_tss_range: { min: 120, max: 150 },
        },
      ],
      goals: [
        { id: "g", name: "Goal", target_date: "2026-05-10", priority: 1 },
      ],
      no_history_context: {
        history_availability_state: "rich",
        goal_tier: "high",
        weeks_to_event: 18,
        context_summary: {
          history_availability_state: "rich",
          recent_consistency_marker: "high",
          effort_confidence_marker: "high",
          profile_metric_completeness_marker: "high",
          signal_quality: 0.95,
          recommended_baseline_tss_range: { min: 80, max: 160 },
          recommended_recent_influence_range: { min: -0.1, max: 0.2 },
          recommended_sessions_per_week_range: { min: 5, max: 7 },
          rationale_codes: ["history_rich"],
        },
      },
    });

    const lowConfidence = buildDeterministicProjectionPayload({
      timeline: { start_date: "2026-01-05", end_date: "2026-03-01" },
      blocks: [
        {
          name: "Build",
          phase: "build",
          start_date: "2026-01-05",
          end_date: "2026-03-01",
          target_weekly_tss_range: { min: 120, max: 150 },
        },
      ],
      goals: [
        { id: "g", name: "Goal", target_date: "2026-05-10", priority: 1 },
      ],
      no_history_context: {
        history_availability_state: "none",
        goal_tier: "high",
        weeks_to_event: 18,
        context_summary: {
          history_availability_state: "none",
          recent_consistency_marker: "low",
          effort_confidence_marker: "low",
          profile_metric_completeness_marker: "low",
          signal_quality: 0.05,
          recommended_baseline_tss_range: { min: 30, max: 90 },
          recommended_recent_influence_range: { min: -0.5, max: 0.5 },
          recommended_sessions_per_week_range: { min: 3, max: 4 },
          rationale_codes: ["history_none"],
        },
      },
    });

    const high = highConfidence.no_history.projection_feasibility!;
    const low = lowConfidence.no_history.projection_feasibility!;
    const highWidth =
      (high.projection_uncertainty?.tss_high ?? 0) -
      (high.projection_uncertainty?.tss_low ?? 0);
    const lowWidth =
      (low.projection_uncertainty?.tss_high ?? 0) -
      (low.projection_uncertainty?.tss_low ?? 0);

    expect(high.readiness_score ?? 0).toBeGreaterThan(
      low.readiness_score ?? 100,
    );
    expect(lowWidth).toBeGreaterThan(highWidth);
  });

  it("prefers CTL-derived seed and carries forward prior-state context", () => {
    const projection = buildDeterministicProjectionPayload({
      timeline: {
        start_date: "2026-01-05",
        end_date: "2026-02-01",
      },
      blocks: [
        {
          name: "Build",
          phase: "build",
          start_date: "2026-01-05",
          end_date: "2026-02-01",
          target_weekly_tss_range: { min: 120, max: 150 },
        },
      ],
      goals: [
        {
          id: "goal-1",
          name: "A race",
          target_date: "2026-05-10",
          priority: 1,
        },
      ],
      starting_ctl: 30,
      creation_config: {
        optimization_profile: "balanced",
      },
    });

    const week1 = projection.microcycles[0]!;
    const week2 = projection.microcycles[1]!;

    expect(week1.metadata.tss_ramp.seed_source).toBe("starting_ctl");
    expect(week1.metadata.tss_ramp.seed_weekly_tss).toBe(210);
    expect(
      week2.metadata.tss_ramp.rolling_base_components.previous_week_tss,
    ).toBe(week1.planned_weekly_tss);
    expect(
      week2.metadata.tss_ramp.rolling_base_components.previous_week_tss,
    ).not.toBe(80);
  });

  it("falls back to dynamic seed when CTL is unavailable", () => {
    const projection = buildDeterministicProjectionPayload({
      timeline: {
        start_date: "2026-01-05",
        end_date: "2026-01-12",
      },
      blocks: [
        {
          name: "Build",
          phase: "build",
          start_date: "2026-01-05",
          end_date: "2026-01-12",
          target_weekly_tss_range: { min: 120, max: 150 },
        },
      ],
      goals: [
        {
          id: "goal-1",
          name: "A race",
          target_date: "2026-05-10",
          priority: 1,
        },
      ],
      creation_config: {
        optimization_profile: "balanced",
      },
    });

    expect(projection.microcycles[0]!.metadata.tss_ramp.seed_source).toBe(
      "dynamic_seed",
    );
    expect(projection.microcycles[0]!.metadata.tss_ramp.seed_weekly_tss).toBe(
      135,
    );
  });
});

describe("phase 1 scoring integration", () => {
  it("emits plan-level and goal-level assessment metadata", () => {
    const projection = buildDeterministicProjectionPayload({
      timeline: {
        start_date: "2026-01-05",
        end_date: "2026-02-02",
      },
      blocks: [
        {
          name: "Build",
          phase: "build",
          start_date: "2026-01-05",
          end_date: "2026-02-02",
          target_weekly_tss_range: { min: 220, max: 260 },
        },
      ],
      goals: [
        {
          id: "goal-1",
          name: "10k",
          target_date: "2026-02-02",
          priority: 2,
          targets: [
            {
              target_type: "race_performance",
              distance_m: 10000,
              target_time_s: 2400,
              activity_category: "run",
            },
          ],
        },
      ],
      starting_ctl: 40,
      creation_config: {
        optimization_profile: "balanced",
      },
    });

    expect(projection.readiness_confidence).toBeGreaterThanOrEqual(0);
    expect(projection.capacity_envelope).toBeTruthy();
    expect(projection.feasibility_band).toBeTypeOf("string");
    expect(projection.goal_assessments).toHaveLength(1);
    expect(projection.goal_assessments?.[0]?.target_scores.length).toBe(1);
    expect(projection.risk_flags?.length).toBeGreaterThan(0);
    expect("mode_applied" in projection).toBe(false);
    expect("overrides_applied" in projection).toBe(false);
  });

  it("keeps single readiness outputs without legacy mode semantics", () => {
    const projection = buildDeterministicProjectionPayload({
      timeline: {
        start_date: "2026-01-05",
        end_date: "2026-03-01",
      },
      blocks: [
        {
          name: "Build",
          phase: "build",
          start_date: "2026-01-05",
          end_date: "2026-03-01",
          target_weekly_tss_range: { min: 260, max: 320 },
        },
      ],
      goals: [
        {
          id: "goal-1",
          name: "A goal",
          target_date: "2026-03-01",
          priority: 1,
        },
      ],
      starting_ctl: 35,
      creation_config: {
        optimization_profile: "outcome_first",
        max_weekly_tss_ramp_pct: 20,
        max_ctl_ramp_per_week: 8,
      },
    });

    expect(projection.readiness_confidence).toBeGreaterThanOrEqual(0);
    expect(projection.capacity_envelope?.envelope_state).toMatch(
      /inside|edge|outside/,
    );
    expect(projection.readiness_rationale_codes?.length ?? 0).toBeGreaterThan(
      0,
    );
    expect("mode_applied" in projection).toBe(false);
    expect("overrides_applied" in projection).toBe(false);
  });

  it("emits canonical chart display points coherent with headline readiness", () => {
    const projection = buildDeterministicProjectionPayload({
      timeline: {
        start_date: "2026-01-05",
        end_date: "2026-03-01",
      },
      blocks: [
        {
          name: "Build",
          phase: "build",
          start_date: "2026-01-05",
          end_date: "2026-03-01",
          target_weekly_tss_range: { min: 260, max: 320 },
        },
      ],
      goals: [
        {
          id: "goal-1",
          name: "Primary goal",
          target_date: "2026-02-15",
          priority: 1,
        },
        {
          id: "goal-2",
          name: "Secondary goal",
          target_date: "2026-03-01",
          priority: 3,
        },
      ],
      starting_ctl: 35,
      creation_config: {
        optimization_profile: "outcome_first",
        max_weekly_tss_ramp_pct: 20,
        max_ctl_ramp_per_week: 8,
      },
    });

    expect(projection.display_points).toEqual(projection.points);
    expect(projection.readiness_score).toBeGreaterThanOrEqual(0);
    expect(projection.readiness_score).toBeLessThanOrEqual(100);

    const goalReadinessValues = projection.goal_markers
      .map(
        (goal) =>
          projection.points.find((point) => point.date === goal.target_date)
            ?.readiness_score,
      )
      .filter((value): value is number => value !== undefined);

    const weightedGoalReadiness =
      goalReadinessValues.reduce((sum, value) => sum + value, 0) /
      Math.max(1, goalReadinessValues.length);

    expect(
      Math.abs(projection.readiness_score - weightedGoalReadiness),
    ).toBeLessThanOrEqual(12);

    for (const goal of projection.goal_markers) {
      const goalPoint = projection.points.find(
        (point) => point.date === goal.target_date,
      );
      if (goalPoint) {
        expect(
          Math.abs(projection.readiness_score - goalPoint.readiness_score),
        ).toBeLessThanOrEqual(12);
      }
    }
  });
});

describe("phase 2 mpc integration diagnostics", () => {
  const phase2Fixture: Parameters<
    typeof buildDeterministicProjectionPayload
  >[0] = {
    timeline: {
      start_date: "2026-01-05",
      end_date: "2026-02-16",
    },
    blocks: [
      {
        name: "Build",
        phase: "build",
        start_date: "2026-01-05",
        end_date: "2026-02-16",
        target_weekly_tss_range: { min: 260, max: 320 },
      },
    ],
    goals: [
      {
        id: "goal-main",
        name: "A goal",
        target_date: "2026-02-16",
        priority: 1,
      },
    ],
    starting_ctl: 34,
    creation_config: {
      optimization_profile: "balanced",
      max_weekly_tss_ramp_pct: 7,
      max_ctl_ramp_per_week: 3,
    },
  };

  it("keeps deterministic MPC-selected path across repeated runs", () => {
    const first = buildDeterministicProjectionPayload(phase2Fixture);
    const second = buildDeterministicProjectionPayload(phase2Fixture);

    expect(first.projection_diagnostics).toEqual(second.projection_diagnostics);
    expect(first.projection_diagnostics?.selected_path).toBeDefined();
    expect([
      "full_mpc",
      "degraded_bounded_mpc",
      "legacy_optimizer",
      "cap_only_baseline",
    ]).toContain(first.projection_diagnostics?.selected_path);
  });

  it("emits solver diagnostics metadata for candidate counts and tie-break chain", () => {
    const projection = buildDeterministicProjectionPayload(phase2Fixture);
    const diagnostics = projection.projection_diagnostics;

    expect(diagnostics?.candidate_counts.full_mpc ?? 0).toBeGreaterThanOrEqual(
      0,
    );
    expect(diagnostics?.active_constraints).toContain(
      "invariant_numeric_bounds_enforced",
    );
    expect(diagnostics?.tie_break_chain).toEqual(expect.any(Array));
    expect((diagnostics?.tie_break_chain ?? []).length).toBeGreaterThanOrEqual(
      0,
    );
    expect(diagnostics?.effective_optimizer_config).toMatchObject({
      weights: {
        preparedness_weight: expect.any(Number),
        risk_penalty_weight: expect.any(Number),
        volatility_penalty_weight: expect.any(Number),
        churn_penalty_weight: expect.any(Number),
      },
      caps: {
        max_weekly_tss_ramp_pct: expect.any(Number),
        max_ctl_ramp_per_week: expect.any(Number),
      },
      search: {
        lookahead_weeks: expect.any(Number),
        candidate_steps: expect.any(Number),
      },
      curvature: {
        target: expect.any(Number),
        strength: expect.any(Number),
        weight: expect.any(Number),
      },
    });
    expect(diagnostics?.clamp_counts).toMatchObject({
      tss: expect.any(Number),
      ctl: expect.any(Number),
    });
    expect(diagnostics?.objective_contributions).toMatchObject({
      sampled_weeks: expect.any(Number),
      objective_score: expect.any(Number),
      weighted_terms: {
        goal: expect.any(Number),
        readiness: expect.any(Number),
        risk: expect.any(Number),
        volatility: expect.any(Number),
        churn: expect.any(Number),
        monotony: expect.any(Number),
        strain: expect.any(Number),
        curve: expect.any(Number),
      },
    });
    expect(diagnostics?.optimization_tradeoff_summary).toMatchObject({
      goal_utility: expect.any(Number),
      risk_penalty: expect.any(Number),
      volatility_penalty: expect.any(Number),
      churn_penalty: expect.any(Number),
      net_utility: expect.any(Number),
    });
    expect(diagnostics?.convergence_guard).toMatchObject({
      max_solver_attempts: 3,
      solver_attempts: expect.any(Number),
      non_finite_objective_rejections: expect.any(Number),
      stability_assertions: expect.any(Array),
    });
    expect(projection.optimization_tradeoff_summary).toEqual(
      diagnostics?.optimization_tradeoff_summary,
    );
  });

  it("uses deterministic cap-only fallback when optimizer is disabled", () => {
    const first = buildDeterministicProjectionPayload({
      ...phase2Fixture,
      disable_weekly_tss_optimizer: true,
    });
    const second = buildDeterministicProjectionPayload({
      ...phase2Fixture,
      disable_weekly_tss_optimizer: true,
    });

    expect(first.projection_diagnostics).toEqual(second.projection_diagnostics);
    expect(first.projection_diagnostics?.selected_path).toBe(
      "cap_only_baseline",
    );
    expect(first.projection_diagnostics?.fallback_reason).toBe(
      "optimizer_disabled",
    );
  });

  it("applies configured ramp caps deterministically", () => {
    const strictProjection = buildDeterministicProjectionPayload({
      ...phase2Fixture,
      creation_config: {
        optimization_profile: "balanced",
        max_weekly_tss_ramp_pct: 4,
        max_ctl_ramp_per_week: 1,
      },
    });
    const lenientProjection = buildDeterministicProjectionPayload({
      ...phase2Fixture,
      creation_config: {
        optimization_profile: "balanced",
        max_weekly_tss_ramp_pct: 20,
        max_ctl_ramp_per_week: 8,
      },
    });

    expect(
      strictProjection.microcycles[0]?.metadata.tss_ramp
        .max_weekly_tss_ramp_pct,
    ).toBeLessThan(
      lenientProjection.microcycles[0]?.metadata.tss_ramp
        .max_weekly_tss_ramp_pct ?? Number.POSITIVE_INFINITY,
    );
    expect(
      strictProjection.microcycles[0]?.metadata.ctl_ramp.max_ctl_ramp_per_week,
    ).toBeLessThan(
      lenientProjection.microcycles[0]?.metadata.ctl_ramp
        .max_ctl_ramp_per_week ?? Number.POSITIVE_INFINITY,
    );
    expect(
      strictProjection.microcycles[0]?.metadata.tss_ramp
        .max_weekly_tss_ramp_pct,
    ).toBeGreaterThanOrEqual(0);
    expect(
      lenientProjection.microcycles[0]?.metadata.tss_ramp
        .max_weekly_tss_ramp_pct,
    ).toBeLessThanOrEqual(40);
    expect(
      strictProjection.projection_diagnostics?.active_constraints,
    ).toContain("invariant_numeric_bounds_enforced");
    expect(strictProjection.projection_diagnostics?.clamp_counts).toEqual({
      tss: strictProjection.constraint_summary.tss_ramp_clamp_weeks,
      ctl: strictProjection.constraint_summary.ctl_ramp_clamp_weeks,
    });
  });

  it("keeps projection_control_v2 ramp caps normalized/invariant across ambition and risk", () => {
    const conservativeControls = buildDeterministicProjectionPayload({
      ...phase2Fixture,
      creation_config: {
        ...phase2Fixture.creation_config,
        projection_control_v2: {
          ambition: 0,
          risk_tolerance: 0,
          curvature: 0,
          curvature_strength: 0,
        },
      },
    });
    const aggressiveControls = buildDeterministicProjectionPayload({
      ...phase2Fixture,
      creation_config: {
        ...phase2Fixture.creation_config,
        projection_control_v2: {
          ambition: 1,
          risk_tolerance: 1,
          curvature: 0,
          curvature_strength: 0,
        },
      },
    });

    expect(
      aggressiveControls.microcycles[0]?.metadata.tss_ramp
        .max_weekly_tss_ramp_pct,
    ).toBe(
      conservativeControls.microcycles[0]?.metadata.tss_ramp
        .max_weekly_tss_ramp_pct,
    );
    expect(
      aggressiveControls.microcycles[0]?.metadata.ctl_ramp
        .max_ctl_ramp_per_week,
    ).toBe(
      conservativeControls.microcycles[0]?.metadata.ctl_ramp
        .max_ctl_ramp_per_week,
    );
    expect(
      aggressiveControls.microcycles[0]?.metadata.tss_ramp
        .max_weekly_tss_ramp_pct,
    ).toBe(phase2Fixture.creation_config?.max_weekly_tss_ramp_pct ?? 0);
    expect(
      aggressiveControls.microcycles[0]?.metadata.ctl_ramp
        .max_ctl_ramp_per_week,
    ).toBe(phase2Fixture.creation_config?.max_ctl_ramp_per_week ?? 0);
  });

  it("exposes widened frontier caps and preserves monotonic upper band under higher overrides", () => {
    const practicalCeiling = buildDeterministicProjectionPayload({
      ...phase2Fixture,
      creation_config: {
        ...phase2Fixture.creation_config,
        max_weekly_tss_ramp_pct: 20,
        max_ctl_ramp_per_week: 8,
        projection_control_v2: {
          ambition: 1,
          risk_tolerance: 1,
          curvature: 0,
          curvature_strength: 0,
        },
      },
    });
    const theoreticalFrontier = buildDeterministicProjectionPayload({
      ...phase2Fixture,
      creation_config: {
        ...phase2Fixture.creation_config,
        max_weekly_tss_ramp_pct: 40,
        max_ctl_ramp_per_week: 12,
        projection_control_v2: {
          ambition: 1,
          risk_tolerance: 1,
          curvature: 0,
          curvature_strength: 0,
        },
      },
    });

    const practicalCaps =
      practicalCeiling.projection_diagnostics?.effective_optimizer_config.caps;
    const frontierCaps =
      theoreticalFrontier.projection_diagnostics?.effective_optimizer_config
        .caps;

    expect(frontierCaps?.max_weekly_tss_ramp_pct ?? 0).toBeGreaterThan(20);
    expect(frontierCaps?.max_ctl_ramp_per_week ?? 0).toBeGreaterThan(8);
    expect(frontierCaps?.max_weekly_tss_ramp_pct ?? 0).toBeGreaterThanOrEqual(
      practicalCaps?.max_weekly_tss_ramp_pct ?? 0,
    );
    expect(frontierCaps?.max_ctl_ramp_per_week ?? 0).toBeGreaterThanOrEqual(
      practicalCaps?.max_ctl_ramp_per_week ?? 0,
    );

    const practicalUpperBand = Math.max(
      ...practicalCeiling.microcycles.map((cycle) => cycle.planned_weekly_tss),
    );
    const frontierUpperBand = Math.max(
      ...theoreticalFrontier.microcycles.map(
        (cycle) => cycle.planned_weekly_tss,
      ),
    );

    expect(frontierUpperBand).toBeGreaterThanOrEqual(practicalUpperBand);
  });

  it("applies curvature controls to shape early vs late weekly load", () => {
    const frontLoaded = buildDeterministicProjectionPayload({
      ...phase2Fixture,
      creation_config: {
        ...phase2Fixture.creation_config,
        projection_control_v2: {
          ambition: 0.7,
          risk_tolerance: 0.6,
          curvature: -1,
          curvature_strength: 1,
        },
      },
    });
    const backLoaded = buildDeterministicProjectionPayload({
      ...phase2Fixture,
      creation_config: {
        ...phase2Fixture.creation_config,
        projection_control_v2: {
          ambition: 0.7,
          risk_tolerance: 0.6,
          curvature: 1,
          curvature_strength: 1,
        },
      },
    });

    const firstThreeFrontLoaded = frontLoaded.microcycles
      .slice(0, 3)
      .reduce((sum, week) => sum + week.planned_weekly_tss, 0);
    const firstThreeBackLoaded = backLoaded.microcycles
      .slice(0, 3)
      .reduce((sum, week) => sum + week.planned_weekly_tss, 0);
    const frontCurvatureTarget =
      frontLoaded.projection_diagnostics?.effective_optimizer_config.curvature
        .target ?? 0;
    const backCurvatureTarget =
      backLoaded.projection_diagnostics?.effective_optimizer_config.curvature
        .target ?? 0;

    expect(firstThreeFrontLoaded).toBeGreaterThan(firstThreeBackLoaded);
    expect(frontCurvatureTarget).toBeLessThan(backCurvatureTarget);
  });
});

describe("phase 5 benchmark and theoretical frontier validation", () => {
  const benchmarkBase = {
    timeline: {
      start_date: "2026-01-05",
      end_date: "2026-04-27",
    },
    goals: [
      {
        id: "goal-benchmark",
        name: "Benchmark target",
        target_date: "2026-04-27",
        priority: 1,
      },
    ],
  };
  const buildBlockBase = {
    name: "Build",
    phase: "build" as const,
    start_date: "2026-01-05",
    end_date: "2026-04-27",
  };

  it("keeps professional benchmark scenario in the 800-1200 weekly range", () => {
    const projection = buildDeterministicProjectionPayload({
      ...benchmarkBase,
      blocks: [
        {
          ...buildBlockBase,
          target_weekly_tss_range: { min: 820, max: 1040 },
        },
      ],
      starting_ctl: 95,
      creation_config: {
        optimization_profile: "balanced",
        max_weekly_tss_ramp_pct: 20,
        max_ctl_ramp_per_week: 8,
      },
    });

    const weeklyPeak = Math.max(
      ...projection.microcycles.map((cycle) => cycle.planned_weekly_tss),
    );

    expect(weeklyPeak).toBeGreaterThanOrEqual(800);
    expect(weeklyPeak).toBeLessThanOrEqual(1200);
  });

  it("reaches ultra benchmark range (1500-2200+) when explicitly configured", () => {
    const projection = buildDeterministicProjectionPayload({
      ...benchmarkBase,
      blocks: [
        {
          ...buildBlockBase,
          target_weekly_tss_range: { min: 1550, max: 2250 },
        },
      ],
      starting_ctl: 150,
      creation_config: {
        optimization_profile: "outcome_first",
        max_weekly_tss_ramp_pct: 40,
        max_ctl_ramp_per_week: 12,
      },
    });

    const weeklyPeak = Math.max(
      ...projection.microcycles.map((cycle) => cycle.planned_weekly_tss),
    );

    expect(weeklyPeak).toBeGreaterThanOrEqual(1500);
  });

  it("supports theoretical stress runs above benchmark ranges while staying deterministic and finite", () => {
    const theoreticalInput: Parameters<
      typeof buildDeterministicProjectionPayload
    >[0] = {
      ...benchmarkBase,
      blocks: [
        {
          ...buildBlockBase,
          target_weekly_tss_range: { min: 2300, max: 3200 },
        },
      ],
      starting_ctl: 190,
      creation_config: {
        optimization_profile: "outcome_first",
        max_weekly_tss_ramp_pct: 40,
        max_ctl_ramp_per_week: 12,
        projection_control_v2: {
          ambition: 1,
          risk_tolerance: 1,
          curvature: 0,
          curvature_strength: 0,
        },
      },
    };

    const first = buildDeterministicProjectionPayload(theoreticalInput);
    const second = buildDeterministicProjectionPayload(theoreticalInput);
    const weeklyPeak = Math.max(
      ...first.microcycles.map((cycle) => cycle.planned_weekly_tss),
    );

    expect(weeklyPeak).toBeGreaterThan(2200);
    expect(first.microcycles.map((cycle) => cycle.planned_weekly_tss)).toEqual(
      second.microcycles.map((cycle) => cycle.planned_weekly_tss),
    );
    expect(first.microcycles.map((cycle) => cycle.projected_ctl)).toEqual(
      second.microcycles.map((cycle) => cycle.projected_ctl),
    );

    for (const cycle of first.microcycles) {
      expect(Number.isFinite(cycle.planned_weekly_tss)).toBe(true);
      expect(Number.isFinite(cycle.projected_ctl)).toBe(true);
    }
  });

  it("allows elite long-horizon readiness >=99 for theoretical run distance targets", () => {
    const eliteTargets = [
      {
        id: "goal-5k-1235",
        name: "5k 12:35",
        distance_m: 5000,
        target_time_s: 12 * 60 + 35,
      },
      {
        id: "goal-10k-2611",
        name: "10k 26:11",
        distance_m: 10000,
        target_time_s: 26 * 60 + 11,
      },
      {
        id: "goal-half-5600",
        name: "Half 56:00",
        distance_m: 21097,
        target_time_s: 56 * 60,
      },
      {
        id: "goal-marathon-2h",
        name: "Marathon 2:00:00",
        distance_m: 42195,
        target_time_s: 2 * 60 * 60,
      },
    ] as const;

    for (const target of eliteTargets) {
      const projection = buildDeterministicProjectionPayload({
        timeline: {
          start_date: "2026-01-05",
          end_date: "2028-01-07",
        },
        blocks: [
          {
            name: "Elite build",
            phase: "build",
            start_date: "2026-01-05",
            end_date: "2027-12-10",
            target_weekly_tss_range: { min: 1800, max: 2600 },
          },
          {
            name: "Race taper",
            phase: "taper",
            start_date: "2027-12-11",
            end_date: "2028-01-07",
            target_weekly_tss_range: { min: 50, max: 120 },
          },
        ],
        goals: [
          {
            id: target.id,
            name: target.name,
            target_date: "2028-01-07",
            priority: 1,
            targets: [
              {
                target_type: "race_performance",
                activity_category: "run",
                distance_m: target.distance_m,
                target_time_s: target.target_time_s,
              },
            ],
          },
        ],
        starting_ctl: 240,
        starting_atl: 120,
        starting_tsb: 120,
        creation_config: {
          optimization_profile: "outcome_first",
          max_weekly_tss_ramp_pct: 40,
          max_ctl_ramp_per_week: 12,
          projection_control_v2: {
            ambition: 1,
            risk_tolerance: 1,
            curvature: 0,
            curvature_strength: 0,
          },
        },
      });

      const goalReadiness =
        projection.goal_assessments?.find((goal) => goal.goal_id === target.id)
          ?.goal_readiness_score ?? 0;
      const goalAssessment = projection.goal_assessments?.find(
        (goal) => goal.goal_id === target.id,
      );
      expect(
        goalReadiness,
        `${target.name} readiness expected >=99 but got ${goalReadiness} (state=${goalAssessment?.state_readiness_score ?? "n/a"}, target=${goalAssessment?.target_scores?.[0]?.score_0_100 ?? "n/a"})`,
      ).toBeGreaterThanOrEqual(99);
    }
  });

  it("reaches >=99 for half-marathon 1:00 with max starting fitness and aggressive controls", () => {
    const projection = buildDeterministicProjectionPayload({
      timeline: {
        start_date: "2026-01-05",
        end_date: "2028-01-07",
      },
      blocks: [
        {
          name: "Elite build",
          phase: "build",
          start_date: "2026-01-05",
          end_date: "2027-12-10",
          target_weekly_tss_range: { min: 1800, max: 2600 },
        },
        {
          name: "Race taper",
          phase: "taper",
          start_date: "2027-12-11",
          end_date: "2028-01-07",
          target_weekly_tss_range: { min: 50, max: 120 },
        },
      ],
      goals: [
        {
          id: "goal-half-1h-user-scenario",
          name: "Half marathon 1:00",
          target_date: "2028-01-07",
          priority: 1,
          targets: [
            {
              target_type: "race_performance",
              activity_category: "run",
              distance_m: 21097,
              target_time_s: 3600,
            },
          ],
        },
      ],
      starting_ctl: 250,
      creation_config: {
        optimization_profile: "outcome_first",
        max_weekly_tss_ramp_pct: 40,
        max_ctl_ramp_per_week: 12,
        projection_control_v2: {
          ambition: 1,
          risk_tolerance: 1,
          curvature: 0,
          curvature_strength: 0,
        },
      },
    });

    const goalAssessment = projection.goal_assessments?.find(
      (goal) => goal.goal_id === "goal-half-1h-user-scenario",
    );
    const goalReadiness = goalAssessment?.goal_readiness_score ?? 0;
    expect(
      goalReadiness,
      `half 1:00 scenario expected >=99 but got ${goalReadiness} (state=${goalAssessment?.state_readiness_score ?? "n/a"}, target=${goalAssessment?.target_scores?.[0]?.score_0_100 ?? "n/a"}, alignment=${goalAssessment?.goal_alignment_loss_0_100 ?? "n/a"})`,
    ).toBeGreaterThanOrEqual(99);
  });
});
