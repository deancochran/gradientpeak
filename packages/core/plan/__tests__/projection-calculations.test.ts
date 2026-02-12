import { describe, expect, it } from "vitest";
import {
  buildDeterministicProjectionPayload,
  clampNoHistoryFloorByAvailability,
  collectNoHistoryEvidence,
  deriveNoHistoryProjectionFloor,
  determineNoHistoryFitnessLevel,
  mapFeasibilityToConfidence,
  resolveNoHistoryAnchor,
  classifyBuildTimeFeasibility,
  getProjectionWeekPattern,
  weeklyLoadFromBlockAndBaseline,
} from "../projectionCalculations";

describe("projection calculations", () => {
  it("blends block target range and baseline weekly TSS", () => {
    const weeklyTss = weeklyLoadFromBlockAndBaseline(
      {
        target_weekly_tss_range: { min: 280, max: 320 },
      },
      200,
    );

    expect(weeklyTss).toBe(265);
  });

  it("uses baseline weekly TSS when block has no target range", () => {
    expect(weeklyLoadFromBlockAndBaseline(undefined, 187.34)).toBe(187.3);
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
      baseline_weekly_tss: 200,
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
      baseline_weekly_tss: 200,
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
      baseline_weekly_tss: 80,
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
});
