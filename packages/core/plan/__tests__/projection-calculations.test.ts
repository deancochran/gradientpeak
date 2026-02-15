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
          priority: 1,
        },
        {
          id: "goal-secondary",
          name: "B race",
          target_date: "2026-03-13",
          priority: 8,
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
          priority: 8,
        },
        {
          id: "goal-secondary",
          name: "B race",
          target_date: "2026-03-13",
          priority: 1,
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

    expect(highPriorityUrgent.microcycles[0]?.planned_weekly_tss).toBeLessThan(
      lowPriorityUrgent.microcycles[0]?.planned_weekly_tss ?? 0,
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

    const score = firstFeasibility?.readiness_score ?? 0;
    const band = firstFeasibility?.readiness_band;
    if (score >= 75) expect(band).toBe("high");
    else if (score >= 55) expect(band).toBe("medium");
    else expect(band).toBe("low");
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
