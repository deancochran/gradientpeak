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
        inferred_current_state: {
          mean: {
            ctl: 44,
            atl: 39,
            tsb: 5,
            slb: 58,
            durability: 62,
            readiness: 68,
          },
          uncertainty: {
            state_variance: 0.24,
            confidence: 0.76,
          },
          evidence_quality: {
            score: 0.71,
            missingness_ratio: 0.22,
          },
          as_of: "2026-01-05T00:00:00.000Z",
          metadata: {
            updated_at: "2026-01-05T00:00:00.000Z",
            missingness_counter: 3,
            evidence_counter: 19,
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
    expect(result.override_audit.request.requested).toBe(false);
    expect(result.override_audit.effective.enabled).toBe(false);
  });

  it("uses prior inferred snapshot from repository and persists posterior inferred snapshot", async () => {
    const deps = createDeps();
    const repository = {
      getPriorInferredStateSnapshot: vi.fn(async () => ({
        mean: {
          ctl: 40,
          atl: 37,
          tsb: 3,
          slb: 55,
          durability: 59,
          readiness: 64,
        },
        uncertainty: {
          state_variance: 0.31,
          confidence: 0.69,
        },
        evidence_quality: {
          score: 0.63,
          missingness_ratio: 0.28,
        },
        as_of: "2026-01-04T00:00:00.000Z",
        metadata: {
          updated_at: "2026-01-04T00:00:00.000Z",
          missingness_counter: 5,
          evidence_counter: 17,
        },
      })),
      persistInferredStateSnapshot: vi.fn(async () => undefined),
    };

    await previewCreationConfigUseCase({
      supabase: {} as any,
      profileId: "profile-1",
      params: {
        minimal_plan: {
          plan_start_date: "2026-01-05",
          goals: [],
        },
        creation_input: {},
      },
      repository: repository as any,
      deps,
    });

    expect(repository.getPriorInferredStateSnapshot).toHaveBeenCalledWith(
      "profile-1",
    );
    expect(deps.buildCreationProjectionArtifacts).toHaveBeenCalledWith(
      expect.objectContaining({
        priorInferredSnapshot: expect.objectContaining({
          mean: expect.objectContaining({ ctl: 40 }),
        }),
      }),
    );
    expect(repository.persistInferredStateSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: "profile-1",
        inferredStateSnapshot: expect.objectContaining({
          mean: expect.objectContaining({ ctl: 44 }),
        }),
      }),
    );
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

  it("keeps blocking conflicts blocking when no override policy is provided", async () => {
    const deps = createDeps();
    deps.deriveProjectionDrivenConflicts = vi.fn(() => [
      {
        code: "required_tss_ramp_exceeds_cap",
        severity: "blocking",
        message: "Required ramp exceeds cap",
        field_paths: ["max_weekly_tss_ramp_pct"],
        suggestions: ["Increase max_weekly_tss_ramp_pct"],
      },
    ]);

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

    expect(result.conflicts.is_blocking).toBe(true);
    expect(result.conflicts.items[0]?.severity).toBe("blocking");
    expect(
      result.override_audit.effective.unresolved_blocking_conflict_codes,
    ).toContain("required_tss_ramp_exceeds_cap");
  });

  it("marks objective/risk-budget overrides effective in preview audit", async () => {
    const deps = createDeps();
    deps.deriveProjectionDrivenConflicts = vi.fn(() => [
      {
        code: "post_goal_recovery_compresses_next_goal_prep",
        severity: "blocking",
        message: "Recovery compresses prep",
        field_paths: ["post_goal_recovery_days"],
        suggestions: ["Reduce post_goal_recovery_days"],
      },
    ]);

    const result = await previewCreationConfigUseCase({
      supabase: {} as any,
      profileId: "profile-1",
      params: {
        minimal_plan: {
          plan_start_date: "2026-01-05",
          goals: [],
        },
        creation_input: {},
        override_policy: {
          allow_blocking_conflicts: true,
          scope: "objective_risk_budget",
          reason: "Coach-approved risk tradeoff",
        },
      },
      deps,
    });

    expect(result.conflicts.is_blocking).toBe(false);
    expect(result.override_audit.request.requested).toBe(true);
    expect(result.override_audit.effective.enabled).toBe(true);
    expect(result.override_audit.effective.overridden_conflict_codes).toContain(
      "post_goal_recovery_compresses_next_goal_prep",
    );
  });
});
