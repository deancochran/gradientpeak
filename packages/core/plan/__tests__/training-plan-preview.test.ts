import { describe, expect, it } from "vitest";
import {
  buildPreviewReadinessSnapshot,
  buildReadinessDeltaDiagnostics,
  buildPreviewMinimalPlanFromForm,
  reducePreviewState,
} from "../trainingPlanPreview";
import { buildDeterministicProjectionPayload } from "../projectionCalculations";

describe("trainingPlanPreview helpers", () => {
  it("keeps goals with valid dates by falling back to a valid target", () => {
    const payload = buildPreviewMinimalPlanFromForm({
      planStartDate: "2026-01-15",
      goals: [
        {
          name: "A Race",
          targetDate: "2026-06-01",
          priority: 1,
          targets: [
            {
              targetType: "race_performance",
              activityCategory: "run",
              distanceKm: "10",
              completionTimeHms: "00:45:00",
            },
            {
              targetType: "power_threshold",
              activityCategory: "bike",
              testDurationHms: "00:20:00",
            },
          ],
        },
        {
          name: "Optional Goal",
          targetDate: "2026-07-01",
          priority: 2,
          targets: [
            {
              targetType: "race_performance",
              activityCategory: "run",
              distanceKm: "",
              completionTimeHms: "",
            },
          ],
        },
      ],
    });

    expect(payload).not.toBeNull();
    expect(payload?.plan_start_date).toBe("2026-01-15");
    expect(payload?.goals).toHaveLength(2);
    expect(payload?.goals[0]?.targets).toHaveLength(1);
    expect(payload?.goals[1]?.targets).toHaveLength(1);
    expect(payload?.goals[0]?.targets[0]).toMatchObject({
      target_type: "race_performance",
      distance_m: 10000,
      target_time_s: 2700,
      activity_category: "run",
    });
    expect(payload?.goals[1]?.targets[0]).toMatchObject({
      target_type: "race_performance",
      distance_m: 10000,
      target_time_s: 2700,
      activity_category: "run",
    });
  });

  it("omits invalid plan start date input", () => {
    const payload = buildPreviewMinimalPlanFromForm({
      planStartDate: "01/15/2026",
      goals: [
        {
          name: "A Race",
          targetDate: "2026-06-01",
          priority: 1,
          targets: [
            {
              targetType: "race_performance",
              activityCategory: "run",
              distanceKm: "10",
              completionTimeHms: "00:45:00",
            },
          ],
        },
      ],
    });

    expect(payload).not.toBeNull();
    expect(payload?.plan_start_date).toBeUndefined();
  });

  it("includes multiple valid goals in preview even when names are blank", () => {
    const payload = buildPreviewMinimalPlanFromForm({
      goals: [
        {
          name: "",
          targetDate: "2026-06-01",
          priority: 1,
          targets: [
            {
              targetType: "race_performance",
              activityCategory: "run",
              distanceKm: "10",
              completionTimeHms: "00:45:00",
            },
          ],
        },
        {
          name: "",
          targetDate: "2026-07-15",
          priority: 2,
          targets: [
            {
              targetType: "race_performance",
              activityCategory: "run",
              distanceKm: "21.1",
              completionTimeHms: "01:35:00",
            },
          ],
        },
      ],
    });

    expect(payload).not.toBeNull();
    expect(payload?.goals).toHaveLength(2);
    expect(payload?.goals[0]?.name).toBe("Goal 1");
    expect(payload?.goals[1]?.name).toBe("Goal 2");
  });

  it("retains last successful chart after a later preview failure", () => {
    const successState = reducePreviewState(
      {},
      {
        status: "success",
        projectionChart: {
          points: [
            {
              date: "2026-01-01",
              predicted_load_tss: 200,
              predicted_fitness_ctl: 30,
              predicted_fatigue_atl: 35,
              predicted_form_tsb: -5,
            },
          ],
        },
      },
    );

    const failureState = reducePreviewState(successState, {
      status: "failure",
      errorMessage: "Preview failed",
    });

    expect(failureState.projectionChart).toEqual(successState.projectionChart);
    expect(failureState.previewError).toBe("Preview failed");
  });

  it("builds readiness-delta diagnostics with load/fatigue/feasibility impacts", () => {
    const diagnostics = buildReadinessDeltaDiagnostics({
      previous: {
        readiness_score: 72,
        predicted_load_tss: 410,
        predicted_fatigue_atl: 58,
        feasibility_state: "feasible",
        tss_ramp_clamp_weeks: 0,
        ctl_ramp_clamp_weeks: 0,
      },
      current: {
        readiness_score: 68,
        predicted_load_tss: 430,
        predicted_fatigue_atl: 64,
        feasibility_state: "aggressive",
        tss_ramp_clamp_weeks: 1,
        ctl_ramp_clamp_weeks: 0,
      },
    });

    expect(diagnostics.readiness.delta).toBe(-4);
    expect(diagnostics.impacts.load.key).toBe("load");
    expect(diagnostics.impacts.fatigue.key).toBe("fatigue");
    expect(diagnostics.impacts.feasibility.key).toBe("feasibility");
    expect(diagnostics.summary_codes).toContain(
      "readiness_delta_diagnostics_v1",
    );
  });

  it("builds preview snapshot from latest projection point", () => {
    const snapshot = buildPreviewReadinessSnapshot({
      projectionChart: {
        points: [
          {
            readiness_score: 67,
            predicted_load_tss: 405,
            predicted_fatigue_atl: 60,
          },
          {
            readiness_score: 69,
            predicted_load_tss: 430,
            predicted_fatigue_atl: 64,
          },
        ],
        readiness_score: 69,
        constraint_summary: {
          tss_ramp_clamp_weeks: 1,
          ctl_ramp_clamp_weeks: 0,
        },
      },
      projectionFeasibilityState: "aggressive",
    });

    expect(snapshot).toEqual({
      readiness_score: 69,
      predicted_load_tss: 430,
      predicted_fatigue_atl: 64,
      feasibility_state: "aggressive",
      tss_ramp_clamp_weeks: 1,
      ctl_ramp_clamp_weeks: 0,
    });
  });
});

describe("deterministic projection safety behavior", () => {
  it("applies explicit no-history prior initialization when floor metadata is active", () => {
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
          target_weekly_tss_range: { min: 250, max: 290 },
        },
      ],
      goals: [
        {
          id: "goal-a",
          name: "A race",
          target_date: "2026-02-01",
          priority: 1,
        },
      ],
      no_history_context: {
        history_availability_state: "none",
        goal_tier: "high",
        weeks_to_event: 16,
        context_summary: {
          history_availability_state: "none",
          recent_consistency_marker: "moderate",
          effort_confidence_marker: "moderate",
          profile_metric_completeness_marker: "low",
          signal_quality: 0.4,
          recommended_baseline_tss_range: { min: 40, max: 90 },
          recommended_recent_influence_range: { min: -0.3, max: 0.2 },
          recommended_sessions_per_week_range: { min: 3, max: 4 },
          rationale_codes: ["history_none"],
        },
      },
      creation_config: {
        optimization_profile: "balanced",
      },
    });

    expect(projection.no_history.projection_floor_applied).toBe(true);
    expect(
      projection.constraint_summary.starting_state.starting_state_is_prior,
    ).toBe(true);
    expect(projection.constraint_summary.starting_state.starting_ctl).toBe(
      projection.constraint_summary.starting_state.starting_atl,
    );
    expect(projection.constraint_summary.starting_state.starting_tsb).toBe(0);
  });

  it("uses confidence-weighted demand metadata when history state is sparse", () => {
    const projection = buildDeterministicProjectionPayload({
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
          target_weekly_tss_range: { min: 140, max: 170 },
        },
      ],
      goals: [
        {
          id: "goal-a",
          name: "A race",
          target_date: "2026-01-24",
          priority: 1,
        },
      ],
      starting_ctl: 20,
      no_history_context: {
        history_availability_state: "sparse",
        goal_tier: "high",
        weeks_to_event: 10,
      },
    });

    expect(projection.no_history.projection_floor_applied).toBe(true);
    expect(projection.no_history.evidence_confidence?.state).toBe("sparse");
    expect(
      projection.constraint_summary.starting_state.starting_state_is_prior,
    ).toBe(true);
    expect(projection.no_history.projection_feasibility).toBeTruthy();
  });

  it("uses provided starting ATL instead of forcing ATL to CTL", () => {
    const projection = buildDeterministicProjectionPayload({
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
          target_weekly_tss_range: { min: 180, max: 210 },
        },
      ],
      goals: [
        {
          id: "goal-a",
          name: "A race",
          target_date: "2026-01-24",
          priority: 1,
        },
      ],
      starting_ctl: 50,
      starting_atl: 42,
    });

    expect(projection.constraint_summary.starting_state.starting_ctl).toBe(50);
    expect(projection.constraint_summary.starting_state.starting_atl).toBe(42);
    expect(projection.constraint_summary.starting_state.starting_tsb).toBe(8);
  });

  it("keeps hard-invariant bounds while surfacing low-cap pressure", () => {
    const projection = buildDeterministicProjectionPayload({
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
          target_weekly_tss_range: { min: 450, max: 550 },
        },
      ],
      goals: [
        {
          id: "goal-a",
          name: "A race",
          target_date: "2026-01-24",
          priority: 1,
        },
      ],
      starting_ctl: 8,
      creation_config: {
        optimization_profile: "balanced",
        post_goal_recovery_days: 0,
        max_weekly_tss_ramp_pct: 5,
        max_ctl_ramp_per_week: 0.2,
      },
    });

    const hasInvariantTssRampClamp = projection.microcycles.some(
      (week) => week.metadata.tss_ramp.clamped,
    );
    const hasInvariantCtlRampClamp = projection.microcycles.some(
      (week) => week.metadata.ctl_ramp.clamped,
    );
    const hasSoftTssCapPressure = projection.microcycles.some((week) => {
      const previous = week.metadata.tss_ramp.previous_week_tss;
      if (previous <= 0) {
        return false;
      }
      const requestedRampPct =
        ((week.metadata.tss_ramp.requested_weekly_tss - previous) / previous) *
        100;
      return (
        requestedRampPct >
        week.metadata.tss_ramp.max_weekly_tss_ramp_pct + 0.001
      );
    });
    const hasSoftCtlCapPressure = projection.microcycles.some(
      (week) =>
        week.metadata.ctl_ramp.requested_ctl_ramp >
        week.metadata.ctl_ramp.max_ctl_ramp_per_week + 0.001,
    );

    expect(hasSoftTssCapPressure || hasSoftCtlCapPressure).toBe(true);
    expect(hasInvariantTssRampClamp || hasInvariantCtlRampClamp).toBe(true);
  });

  it("inserts deterministic post-goal recovery windows for multi-goal timelines", () => {
    const projection = buildDeterministicProjectionPayload({
      timeline: {
        start_date: "2026-01-05",
        end_date: "2026-03-15",
      },
      blocks: [
        {
          name: "Base",
          phase: "base",
          start_date: "2026-01-05",
          end_date: "2026-02-01",
          target_weekly_tss_range: { min: 160, max: 190 },
        },
        {
          name: "Build",
          phase: "build",
          start_date: "2026-02-02",
          end_date: "2026-03-15",
          target_weekly_tss_range: { min: 180, max: 220 },
        },
      ],
      goals: [
        {
          id: "goal-1",
          name: "Tune-up",
          target_date: "2026-01-24",
          priority: 2,
        },
        {
          id: "goal-2",
          name: "A race",
          target_date: "2026-02-28",
          priority: 1,
        },
      ],
      starting_ctl: 20,
      creation_config: {
        optimization_profile: "balanced",
        post_goal_recovery_days: 7,
        max_weekly_tss_ramp_pct: 20,
        max_ctl_ramp_per_week: 8,
      },
    });

    expect(projection.recovery_segments).toEqual([
      {
        goal_id: "goal-1",
        goal_name: "Tune-up",
        start_date: "2026-01-25",
        end_date: "2026-01-31",
      },
      {
        goal_id: "goal-2",
        goal_name: "A race",
        start_date: "2026-03-01",
        end_date: "2026-03-07",
      },
    ]);

    const recoveryWeeks = projection.microcycles.filter(
      (week) => week.metadata.recovery.active,
    );
    expect(recoveryWeeks.length).toBeGreaterThanOrEqual(2);
    expect(recoveryWeeks.every((week) => week.pattern === "recovery")).toBe(
      true,
    );
    expect(
      recoveryWeeks.every(
        (week) => week.metadata.recovery.reduction_factor < 1,
      ),
    ).toBe(true);
  });

  it("keeps week coverage contiguous and preserves multi-goal markers", () => {
    const projection = buildDeterministicProjectionPayload({
      timeline: {
        start_date: "2026-01-05",
        end_date: "2026-03-15",
      },
      blocks: [
        {
          name: "Build",
          phase: "build",
          start_date: "2026-01-05",
          end_date: "2026-03-15",
          target_weekly_tss_range: { min: 180, max: 210 },
        },
      ],
      goals: [
        {
          id: "goal-1",
          name: "Goal One",
          target_date: "2026-01-31",
          priority: 2,
        },
        {
          id: "goal-2",
          name: "Goal Two",
          target_date: "2026-03-10",
          priority: 1,
        },
      ],
      starting_ctl: 22,
      creation_config: {
        optimization_profile: "sustainable",
      },
    });

    for (let i = 1; i < projection.microcycles.length; i += 1) {
      const previous = projection.microcycles[i - 1]!;
      const current = projection.microcycles[i]!;
      const nextStart = new Date(`${previous.week_end_date}T00:00:00.000Z`);
      nextStart.setUTCDate(nextStart.getUTCDate() + 1);
      expect(current.week_start_date).toBe(
        nextStart.toISOString().slice(0, 10),
      );
    }

    expect(projection.goal_markers.map((goal) => goal.target_date)).toEqual([
      "2026-01-31",
      "2026-03-10",
    ]);

    const pointDates = new Set(projection.points.map((point) => point.date));
    expect(pointDates.has("2026-01-31")).toBe(true);
    expect(pointDates.has("2026-03-10")).toBe(true);
  });
});
