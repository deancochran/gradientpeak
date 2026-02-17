import { describe, expect, it, vi } from "vitest";
import { previewCreationConfigUseCase } from "../previewCreationConfigUseCase";

function createDeps(): any {
  return {
    enforceCreationConfigFeatureEnabled: vi.fn(),
    enforceNoAutonomousPostCreateMutation: vi.fn(),
    evaluateCreationConfig: vi.fn(async () => ({
      finalConfig: {
        post_goal_recovery_days: 5,
      },
      contextSummary: {},
      loadBootstrapState: {
        starting_ctl: 42,
        starting_atl: 38,
        starting_tsb: 4,
        confidence: {
          confidence: 0.71,
          history_state: "sparse",
          window_days: 90,
          active_days: 18,
          zero_fill_days: 72,
          days_since_last_activity: 2,
          rationale_codes: ["daily_zero_fill_bootstrap"],
        },
      },
      suggestionPayload: {},
      conflictResolution: { conflicts: [] },
      feasibilitySummary: {},
    })),
    buildCreationProjectionArtifacts: vi.fn(() => ({
      expandedPlan: {
        name: "Generated Plan",
        start_date: "2026-01-05",
        end_date: "2026-03-15",
        goals: [],
        blocks: [],
      },
      projectionChart: {
        start_date: "2026-01-05",
        end_date: "2026-03-15",
        points: [
          {
            date: "2026-03-15",
            predicted_load_tss: 430,
            predicted_fitness_ctl: 59,
            predicted_fatigue_atl: 64,
            predicted_form_tsb: -5,
            readiness_score: 69,
          },
        ],
        goal_markers: [],
        periodization_phases: [],
        microcycles: [],
        constraint_summary: {
          normalized_creation_config: {
            optimization_profile: "balanced",
            post_goal_recovery_days: 5,
            max_weekly_tss_ramp_pct: 7,
            max_ctl_ramp_per_week: 3,
          },
          tss_ramp_clamp_weeks: 1,
          ctl_ramp_clamp_weeks: 0,
          recovery_weeks: 0,
          starting_state: {
            starting_ctl: 42,
            starting_atl: 38,
            starting_tsb: 4,
            starting_state_is_prior: false,
          },
        },
      },
      projectionFeasibility: {
        state: "aggressive" as const,
        reasons: ["required_tss_ramp_near_configured_cap"],
      },
    })),
    buildCreationPreviewSnapshotToken: vi.fn(() => "preview-token"),
    deriveProjectionDrivenConflicts: vi.fn(() => []),
    previewSnapshotVersion: "creation_preview_v2",
  };
}

describe("previewCreationConfigUseCase phase 4 diagnostics", () => {
  it("returns structured readiness-delta diagnostics when baseline is provided", async () => {
    const deps = createDeps();

    const result = await previewCreationConfigUseCase({
      supabase: {} as any,
      profileId: "profile-1",
      params: {
        minimal_plan: {
          plan_start_date: "2026-01-05",
          goals: [],
        },
        creation_input: {},
        preview_baseline: {
          readiness_score: 72,
          predicted_load_tss: 410,
          predicted_fatigue_atl: 58,
          feasibility_state: "feasible",
          tss_ramp_clamp_weeks: 0,
          ctl_ramp_clamp_weeks: 0,
        },
      },
      deps,
    });

    expect(deps.buildCreationProjectionArtifacts).toHaveBeenCalledWith(
      expect.objectContaining({
        loadBootstrapState: expect.objectContaining({
          starting_ctl: 42,
          starting_atl: 38,
          starting_tsb: 4,
        }),
      }),
    );

    expect(result.readiness_delta_diagnostics).toBeDefined();
    expect(result.readiness_delta_diagnostics?.impacts.load.key).toBe("load");
    expect(result.readiness_delta_diagnostics?.impacts.fatigue.key).toBe(
      "fatigue",
    );
    expect(result.readiness_delta_diagnostics?.impacts.feasibility.key).toBe(
      "feasibility",
    );
    expect(result.preview_snapshot_baseline).toEqual({
      readiness_score: 69,
      predicted_load_tss: 430,
      predicted_fatigue_atl: 64,
      feasibility_state: "aggressive",
      tss_ramp_clamp_weeks: 1,
      ctl_ramp_clamp_weeks: 0,
    });
  });

  it("returns baseline snapshot without delta diagnostics for first preview", async () => {
    const deps = createDeps();

    const result = await previewCreationConfigUseCase({
      supabase: {} as any,
      profileId: "profile-1",
      params: {
        minimal_plan: {
          plan_start_date: "2026-01-05",
          goals: [],
        },
        creation_input: {},
      },
      deps,
    });

    expect(result.readiness_delta_diagnostics).toBeUndefined();
    expect(result.preview_snapshot_baseline).toBeTruthy();
  });
});
