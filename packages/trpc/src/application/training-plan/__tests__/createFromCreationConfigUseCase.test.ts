import { describe, expect, it, vi } from "vitest";
import { createFromCreationConfigUseCase } from "../createFromCreationConfigUseCase";

const finalConfigFixture: any = {
  optimization_profile: "balanced",
  post_goal_recovery_days: 5,
  max_weekly_tss_ramp_pct: 7,
  max_ctl_ramp_per_week: 3,
  calibration: {
    version: 1,
    readiness_composite: {
      target_attainment_weight: 0.45,
      envelope_weight: 0.3,
      durability_weight: 0.15,
      evidence_weight: 0.1,
    },
    readiness_timeline: {
      target_tsb: 8,
      form_tolerance: 20,
      fatigue_overflow_scale: 0.4,
      feasibility_blend_weight: 0.15,
      smoothing_iterations: 24,
      smoothing_lambda: 0.28,
      max_step_delta: 9,
    },
    envelope_penalties: {
      over_high_weight: 0.55,
      under_low_weight: 0.2,
      over_ramp_weight: 0.25,
    },
    durability_penalties: {
      monotony_threshold: 2,
      monotony_scale: 2,
      strain_threshold: 900,
      strain_scale: 900,
      deload_debt_scale: 6,
    },
    no_history: {
      reliability_horizon_days: 42,
      confidence_floor_high: 0.75,
      confidence_floor_mid: 0.6,
      confidence_floor_low: 0.45,
      demand_tier_time_pressure_scale: 1,
    },
    optimizer: {
      preparedness_weight: 14,
      risk_penalty_weight: 0.35,
      volatility_penalty_weight: 0.22,
      churn_penalty_weight: 0.2,
      lookahead_weeks: 5,
      candidate_steps: 7,
    },
  },
  feasibility_safety_summary: {
    computed_at: "2026-01-01T00:00:00.000Z",
  },
};

function createDeps(): any {
  return {
    enforceCreationConfigFeatureEnabled: vi.fn(),
    enforceNoAutonomousPostCreateMutation: vi.fn(),
    evaluateCreationConfig: vi.fn(async () => ({
      finalConfig: finalConfigFixture,
      contextSummary: { history_availability_state: "none" },
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
      conflictResolution: { conflicts: [], precedence: {} },
      feasibilitySummary: { overall_state: "safe" },
    })),
    buildCreationProjectionArtifacts: vi.fn(() => ({
      expandedPlan: {
        name: "Generated Plan",
        goals: [],
        blocks: [],
        metadata: {},
      },
      projectionChart: {
        start_date: "2026-01-05",
        end_date: "2026-03-15",
        points: [],
        goal_markers: [],
        microcycles: [],
        recovery_segments: [],
        constraint_summary: {
          normalized_creation_config: {
            optimization_profile: "balanced",
            post_goal_recovery_days: 5,
            max_weekly_tss_ramp_pct: 7,
            max_ctl_ramp_per_week: 3,
          },
          tss_ramp_clamp_weeks: 0,
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
        state: "feasible" as const,
        reasons: [],
      },
    })),
    buildCreationPreviewSnapshotToken: vi.fn(() => "preview-token"),
    deriveProjectionDrivenConflicts: vi.fn(() => []),
    throwPathValidationError: vi.fn((message: string) => {
      throw new Error(message);
    }),
    parseTrainingPlanStructure: vi.fn(),
    randomUUID: vi.fn(() => "plan-uuid-1"),
  };
}

describe("createFromCreationConfigUseCase phase 6 coverage", () => {
  it("returns creation summary in parity with evaluated normalized config", async () => {
    const deps = createDeps();
    const repository = {
      deactivateActivePlans: vi.fn(async () => undefined),
      createTrainingPlan: vi.fn(async () => ({
        id: "plan-row-1",
        name: "Generated Plan",
        is_active: true,
      })),
      getPriorInferredStateSnapshot: vi.fn(async () => null),
      persistInferredStateSnapshot: vi.fn(async () => undefined),
    };

    const result = await createFromCreationConfigUseCase({
      supabase: {} as any,
      profileId: "profile-123",
      params: {
        minimal_plan: {
          plan_start_date: "2026-01-05",
          goals: [],
        },
        creation_input: {},
        preview_snapshot_token: "preview-token",
        is_active: true,
      },
      repository,
      deps: deps as any,
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

    expect(result.creation_summary.normalized_creation_config).toEqual(
      finalConfigFixture,
    );
    expect(result.creation_summary.calibration.version).toBe(1);
    expect(result.creation_summary.projection_feasibility).toEqual({
      state: "feasible",
      reasons: [],
    });
    expect(deps.buildCreationPreviewSnapshotToken).toHaveBeenCalled();
  });

  it("deactivates active plans before creating a new active plan", async () => {
    const deps = createDeps();
    const repository = {
      deactivateActivePlans: vi.fn(async () => undefined),
      createTrainingPlan: vi.fn(async () => ({
        id: "plan-row-2",
        name: "Generated Plan",
        is_active: true,
      })),
      getPriorInferredStateSnapshot: vi.fn(async () => null),
      persistInferredStateSnapshot: vi.fn(async () => undefined),
    };

    await createFromCreationConfigUseCase({
      supabase: {} as any,
      profileId: "profile-123",
      params: {
        minimal_plan: {
          plan_start_date: "2026-01-05",
          goals: [],
        },
        creation_input: {},
        preview_snapshot_token: "preview-token",
        is_active: true,
      },
      repository,
      deps: deps as any,
    });

    expect(repository.deactivateActivePlans).toHaveBeenCalledWith(
      "profile-123",
    );
    expect(repository.createTrainingPlan).toHaveBeenCalledTimes(1);

    const deactivateCallOrder =
      repository.deactivateActivePlans.mock.invocationCallOrder[0] ?? 0;
    const createCallOrder =
      repository.createTrainingPlan.mock.invocationCallOrder[0] ?? 0;

    expect(deactivateCallOrder).toBeLessThan(createCallOrder);
  });

  it("does not persist override metadata in structure or create summary", async () => {
    const deps = createDeps();
    (deps as any).buildCreationProjectionArtifacts = vi.fn(() => ({
      expandedPlan: {
        name: "Generated Plan",
        goals: [],
        blocks: [],
        metadata: {},
      },
      projectionChart: {
        start_date: "2026-01-05",
        end_date: "2026-03-15",
        points: [],
        goal_markers: [],
        microcycles: [],
        recovery_segments: [],
        constraint_summary: {
          normalized_creation_config: {
            optimization_profile: "balanced",
            post_goal_recovery_days: 5,
            max_weekly_tss_ramp_pct: 7,
            max_ctl_ramp_per_week: 3,
          },
          tss_ramp_clamp_weeks: 0,
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
        state: "feasible" as const,
        reasons: [],
      },
    }));

    const repository = {
      deactivateActivePlans: vi.fn(async () => undefined),
      createTrainingPlan: vi.fn(async () => ({
        id: "plan-row-3",
        name: "Generated Plan",
        is_active: true,
      })),
      getPriorInferredStateSnapshot: vi.fn(async () => null),
      persistInferredStateSnapshot: vi.fn(async () => undefined),
    };

    const result = await createFromCreationConfigUseCase({
      supabase: {} as any,
      profileId: "profile-123",
      params: {
        minimal_plan: {
          plan_start_date: "2026-01-05",
          goals: [],
        },
        creation_input: {},
        preview_snapshot_token: "preview-token",
        is_active: true,
      },
      repository,
      deps: deps as any,
    });

    expect(result.creation_summary).not.toHaveProperty("migration_warnings");
    expect(result.creation_summary).not.toHaveProperty("active_overrides");

    const persistedStructure = (repository.createTrainingPlan as any).mock
      .calls[0]?.[0]?.structure;
    expect(persistedStructure).toBeDefined();
    expect(persistedStructure).not.toHaveProperty("mode");
    expect(persistedStructure).not.toHaveProperty("risk_acceptance");
    expect(persistedStructure).not.toHaveProperty("constraint_policy");
    expect(persistedStructure?.metadata).not.toHaveProperty(
      "creation_config_mvp",
    );
    expect(persistedStructure?.metadata?.creation_calibration).toMatchObject({
      version: 1,
    });

    expect(result.creation_summary.normalized_creation_config).toEqual(
      finalConfigFixture,
    );
  });

  it("keeps write boundary on canonical parsed shapes without inferred aliases", async () => {
    const deps = createDeps();
    const repository = {
      deactivateActivePlans: vi.fn(async () => undefined),
      createTrainingPlan: vi.fn(async () => ({
        id: "plan-row-6",
        name: "Generated Plan",
        is_active: true,
      })),
      getPriorInferredStateSnapshot: vi.fn(async () => null),
      persistInferredStateSnapshot: vi.fn(async () => undefined),
    };

    await createFromCreationConfigUseCase({
      supabase: {} as any,
      profileId: "profile-123",
      params: {
        minimal_plan: {
          plan_start_date: "2026-01-05",
          goals: [],
        },
        creation_input: {},
        preview_snapshot_token: "preview-token",
        is_active: true,
      },
      repository,
      deps: deps as any,
    });

    const createArg = (repository.createTrainingPlan as any).mock
      .calls[0]?.[0] as { structure?: Record<string, unknown> } | undefined;
    expect(createArg?.structure).toBeDefined();
    expect(createArg?.structure).not.toHaveProperty("recent_influence_score");
    expect(createArg?.structure).not.toHaveProperty("mode");
    expect(createArg?.structure).not.toHaveProperty("risk_acceptance");
    expect(createArg?.structure).not.toHaveProperty("constraint_policy");
  });

  it("rejects create when preview snapshot token does not match recomputed token", async () => {
    const deps = createDeps();
    const repository = {
      deactivateActivePlans: vi.fn(async () => undefined),
      createTrainingPlan: vi.fn(async () => ({
        id: "plan-row-4",
        name: "Generated Plan",
        is_active: true,
      })),
      getPriorInferredStateSnapshot: vi.fn(async () => null),
      persistInferredStateSnapshot: vi.fn(async () => undefined),
    };

    await expect(
      createFromCreationConfigUseCase({
        supabase: {} as any,
        profileId: "profile-123",
        params: {
          minimal_plan: {
            plan_start_date: "2026-01-05",
            goals: [],
          },
          creation_input: {},
          preview_snapshot_token: "stale-preview-token",
          is_active: true,
        },
        repository,
        deps: deps as any,
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("Refresh previewCreationConfig"),
    });
  });

  it("does not require risk acknowledgement for aggressive single-mode values", async () => {
    const deps = createDeps();
    deps.evaluateCreationConfig = vi.fn(async () => ({
      finalConfig: {
        ...finalConfigFixture,
        optimization_profile: "outcome_first",
        max_weekly_tss_ramp_pct: 20,
        max_ctl_ramp_per_week: 8,
      },
      contextSummary: { history_availability_state: "none" },
      conflictResolution: { conflicts: [], precedence: {} },
      feasibilitySummary: { overall_state: "safe" },
    }));

    const repository = {
      deactivateActivePlans: vi.fn(async () => undefined),
      createTrainingPlan: vi.fn(async () => ({
        id: "plan-row-5",
        name: "Generated Plan",
        is_active: true,
      })),
      getPriorInferredStateSnapshot: vi.fn(async () => null),
      persistInferredStateSnapshot: vi.fn(async () => undefined),
    };

    const result = await createFromCreationConfigUseCase({
      supabase: {} as any,
      profileId: "profile-123",
      params: {
        minimal_plan: {
          plan_start_date: "2026-01-05",
          goals: [],
        },
        creation_input: {},
        preview_snapshot_token: "preview-token",
        is_active: true,
      },
      repository,
      deps: deps as any,
    });

    expect(result.creation_summary.normalized_creation_config).toMatchObject({
      optimization_profile: "outcome_first",
      max_weekly_tss_ramp_pct: 20,
      max_ctl_ramp_per_week: 8,
    });
  });

  it("fails create when blocking conflicts exist and override policy is not explicit", async () => {
    const deps = createDeps();
    deps.deriveProjectionDrivenConflicts = vi.fn(() => [
      {
        code: "post_goal_recovery_overlaps_next_goal",
        severity: "blocking",
        message: "Recovery overlaps next goal",
        field_paths: ["post_goal_recovery_days"],
        suggestions: ["Reduce post-goal recovery"],
      },
    ]);

    const repository = {
      deactivateActivePlans: vi.fn(async () => undefined),
      createTrainingPlan: vi.fn(async () => ({
        id: "plan-row-blocked",
        name: "Generated Plan",
        is_active: true,
      })),
      getPriorInferredStateSnapshot: vi.fn(async () => null),
      persistInferredStateSnapshot: vi.fn(async () => undefined),
    };

    await expect(
      createFromCreationConfigUseCase({
        supabase: {} as any,
        profileId: "profile-123",
        params: {
          minimal_plan: {
            plan_start_date: "2026-01-05",
            goals: [],
          },
          creation_input: {},
          preview_snapshot_token: "preview-token",
          is_active: true,
        },
        repository,
        deps: deps as any,
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining(
        "Creation blocked by unresolved conflicts",
      ),
    });

    expect(repository.createTrainingPlan).not.toHaveBeenCalled();
  });

  it("allows create when only objective/risk-budget blockers are explicitly overridden", async () => {
    const deps = createDeps();
    deps.deriveProjectionDrivenConflicts = vi.fn(() => [
      {
        code: "post_goal_recovery_compresses_next_goal_prep",
        severity: "blocking",
        message: "Recovery compresses prep",
        field_paths: ["post_goal_recovery_days"],
        suggestions: ["Reduce post-goal recovery"],
      },
    ]);

    const repository = {
      deactivateActivePlans: vi.fn(async () => undefined),
      createTrainingPlan: vi.fn(async () => ({
        id: "plan-row-overridden",
        name: "Generated Plan",
        is_active: true,
      })),
      getPriorInferredStateSnapshot: vi.fn(async () => null),
      persistInferredStateSnapshot: vi.fn(async () => undefined),
    };

    const result = await createFromCreationConfigUseCase({
      supabase: {} as any,
      profileId: "profile-123",
      params: {
        minimal_plan: {
          plan_start_date: "2026-01-05",
          goals: [],
        },
        creation_input: {},
        preview_snapshot_token: "preview-token",
        is_active: true,
        override_policy: {
          allow_blocking_conflicts: true,
          scope: "objective_risk_budget",
          reason: "Coach-approved tradeoff",
        },
      },
      repository,
      deps: deps as any,
    });

    expect(result.creation_summary.conflicts.is_blocking).toBe(false);
    expect(result.creation_summary.override_audit.effective.enabled).toBe(true);
    expect(
      result.creation_summary.override_audit.effective
        .overridden_conflict_codes,
    ).toContain("post_goal_recovery_compresses_next_goal_prep");
  });

  it("keeps invariant blockers non-overridable even when override is requested", async () => {
    const deps = createDeps();
    deps.deriveProjectionDrivenConflicts = vi.fn(() => [
      {
        code: "required_tss_ramp_exceeds_cap",
        severity: "blocking",
        message: "Ramp exceeds invariant cap",
        field_paths: ["max_weekly_tss_ramp_pct"],
        suggestions: ["Increase cap"],
      },
    ]);

    const repository = {
      deactivateActivePlans: vi.fn(async () => undefined),
      createTrainingPlan: vi.fn(async () => ({
        id: "plan-row-invariant",
        name: "Generated Plan",
        is_active: true,
      })),
      getPriorInferredStateSnapshot: vi.fn(async () => null),
      persistInferredStateSnapshot: vi.fn(async () => undefined),
    };

    await expect(
      createFromCreationConfigUseCase({
        supabase: {} as any,
        profileId: "profile-123",
        params: {
          minimal_plan: {
            plan_start_date: "2026-01-05",
            goals: [],
          },
          creation_input: {},
          preview_snapshot_token: "preview-token",
          is_active: true,
          override_policy: {
            allow_blocking_conflicts: true,
            scope: "objective_risk_budget",
            reason: "Accept objective tradeoffs",
          },
        },
        repository,
        deps: deps as any,
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining(
        "Creation blocked by unresolved conflicts",
      ),
    });

    expect(repository.createTrainingPlan).not.toHaveBeenCalled();
  });

  it("uses prior inferred snapshot from repository and persists posterior inferred snapshot", async () => {
    const deps = createDeps();
    const repository = {
      deactivateActivePlans: vi.fn(async () => undefined),
      createTrainingPlan: vi.fn(async () => ({
        id: "plan-row-7",
        name: "Generated Plan",
        is_active: true,
      })),
      getPriorInferredStateSnapshot: vi.fn(async () => ({
        mean: {
          ctl: 41,
          atl: 37,
          tsb: 4,
          slb: 56,
          durability: 60,
          readiness: 65,
        },
        uncertainty: {
          state_variance: 0.3,
          confidence: 0.7,
        },
        evidence_quality: {
          score: 0.64,
          missingness_ratio: 0.27,
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

    await createFromCreationConfigUseCase({
      supabase: {} as any,
      profileId: "profile-123",
      params: {
        minimal_plan: {
          plan_start_date: "2026-01-05",
          goals: [],
        },
        creation_input: {},
        preview_snapshot_token: "preview-token",
        is_active: true,
      },
      repository: repository as any,
      deps: deps as any,
    });

    expect(repository.getPriorInferredStateSnapshot).toHaveBeenCalledWith(
      "profile-123",
    );
    expect(deps.buildCreationProjectionArtifacts).toHaveBeenCalledWith(
      expect.objectContaining({
        priorInferredSnapshot: expect.objectContaining({
          mean: expect.objectContaining({ ctl: 41 }),
        }),
      }),
    );
    expect(repository.persistInferredStateSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: "profile-123",
        trainingPlanId: "plan-row-7",
        inferredStateSnapshot: expect.objectContaining({
          mean: expect.objectContaining({ ctl: 44 }),
        }),
      }),
    );
  });
});
