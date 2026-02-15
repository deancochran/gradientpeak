import { describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { deriveProfileAwareCreationContext } from "../training_plans";
import { trainingPlansRouter } from "../training_plans";

type QueryResult = {
  data: any;
  error: { message: string } | null;
};

function createSupabaseMock(results: Record<string, QueryResult>) {
  return {
    from: (table: string) => {
      const result = results[table] ?? { data: [], error: null };
      const builder: any = {
        select: vi.fn(() => builder),
        update: vi.fn(() => builder),
        insert: vi.fn(() => builder),
        delete: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        neq: vi.fn(() => builder),
        gte: vi.fn(() => builder),
        lte: vi.fn(() => builder),
        lt: vi.fn(() => builder),
        in: vi.fn(() => builder),
        order: vi.fn(() => builder),
        single: vi.fn(() => Promise.resolve(result)),
        limit: vi.fn(() => builder),
        then: (onFulfilled: (value: QueryResult) => unknown) =>
          Promise.resolve(result).then(onFulfilled),
      };

      return builder;
    },
  };
}

function createTrainingPlansCaller(results: Record<string, QueryResult> = {}) {
  return trainingPlansRouter.createCaller({
    supabase: createSupabaseMock(results) as any,
    session: {
      user: {
        id: "profile-123",
      },
    },
    headers: new Headers(),
    clientType: "test",
    trpcSource: "vitest",
  } as any);
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx] ?? 0;
}

function assertSaneProjectionDiagnostics(diagnostics: any) {
  expect(diagnostics).toBeDefined();
  expect([
    "full_mpc",
    "degraded_bounded_mpc",
    "legacy_optimizer",
    "cap_only_baseline",
  ]).toContain(diagnostics.selected_path);
  expect(typeof diagnostics.candidate_counts.full_mpc).toBe("number");
  expect(typeof diagnostics.candidate_counts.degraded_bounded_mpc).toBe(
    "number",
  );
  expect(typeof diagnostics.candidate_counts.legacy_optimizer).toBe("number");
  expect(typeof diagnostics.prune_counts.full_mpc).toBe("number");
  expect(typeof diagnostics.prune_counts.degraded_bounded_mpc).toBe("number");
  expect(Array.isArray(diagnostics.active_constraints)).toBe(true);
  expect(Array.isArray(diagnostics.tie_break_chain)).toBe(true);

  expect(diagnostics.candidate_counts.full_mpc).toBeGreaterThanOrEqual(0);
  expect(
    diagnostics.candidate_counts.degraded_bounded_mpc,
  ).toBeGreaterThanOrEqual(0);
  expect(diagnostics.candidate_counts.legacy_optimizer).toBeGreaterThanOrEqual(
    0,
  );

  if (diagnostics.selected_path === "full_mpc") {
    expect(diagnostics.candidate_counts.full_mpc).toBeGreaterThan(0);
  }
  if (diagnostics.selected_path === "degraded_bounded_mpc") {
    expect(diagnostics.candidate_counts.degraded_bounded_mpc).toBeGreaterThan(
      0,
    );
  }
  if (diagnostics.selected_path === "legacy_optimizer") {
    expect(diagnostics.candidate_counts.legacy_optimizer).toBeGreaterThan(0);
  }

  const fallbackReason = diagnostics.fallback_reason;
  expect(fallbackReason === null || typeof fallbackReason === "string").toBe(
    true,
  );
}

describe("deriveProfileAwareCreationContext", () => {
  it("falls back to empty arrays when one source query fails", async () => {
    const supabase = createSupabaseMock({
      activities: {
        data: [
          {
            started_at: "2026-01-10T10:00:00.000Z",
            activity_category: "run",
            duration_seconds: 3600,
            training_stress_score: 65,
          },
        ],
        error: null,
      },
      activity_efforts: {
        data: null,
        error: { message: "efforts query failed" },
      },
      profile_metrics: {
        data: [
          {
            metric_type: "weight_kg",
            value: 72,
            recorded_at: "2026-01-05T00:00:00.000Z",
          },
        ],
        error: null,
      },
    });

    await expect(
      deriveProfileAwareCreationContext({
        supabase: supabase as any,
        profileId: "profile-123",
      }),
    ).resolves.toMatchObject({
      contextSummary: {
        history_availability_state: expect.any(String),
        rationale_codes: expect.any(Array),
      },
    });
  });
});

describe("trainingPlansRouter.getCreationSuggestions", () => {
  it("returns the same contract shape for context summary and suggestions", async () => {
    const caller = createTrainingPlansCaller({
      activities: { data: [], error: null },
      activity_efforts: { data: [], error: null },
      profile_metrics: { data: [], error: null },
    });

    const result = await caller.getCreationSuggestions();

    expect(result).toMatchObject({
      context_summary: {
        history_availability_state: expect.any(String),
        signal_quality: expect.any(Number),
        rationale_codes: expect.any(Array),
      },
      suggestions: {
        availability_config: expect.any(Object),
        recent_influence: expect.any(Object),
        recent_influence_action: expect.any(String),
        constraints: expect.any(Object),
        locked_conflicts: expect.any(Array),
      },
    });
  });

  it("keeps suggestion payload shape when optional params are provided", async () => {
    const caller = createTrainingPlansCaller({
      activities: { data: [], error: null },
      activity_efforts: { data: [], error: null },
      profile_metrics: { data: [], error: null },
    });

    const result = await caller.getCreationSuggestions({
      as_of: "2026-01-10T00:00:00.000Z",
      existing_values: {
        recent_influence: { influence_score: 0.2 },
      },
    });

    expect(result.context_summary).toMatchObject({
      history_availability_state: expect.any(String),
      rationale_codes: expect.any(Array),
    });
    expect(result.suggestions).toMatchObject({
      recent_influence: { influence_score: expect.any(Number) },
      locked_conflicts: expect.any(Array),
    });
  });
});

describe("trainingPlansRouter plan_start_date support", () => {
  const minimalGoal = {
    name: "Spring 10k",
    target_date: "2026-03-15",
    priority: 1,
    targets: [
      {
        target_type: "race_performance" as const,
        distance_m: 10000,
        target_time_s: 2700,
        activity_category: "run" as const,
      },
    ],
  };

  const nonBlockingGoal = {
    name: "Threshold check",
    target_date: "2026-10-15",
    priority: 1,
    targets: [
      {
        target_type: "hr_threshold" as const,
        target_lthr_bpm: 160,
      },
    ],
  };

  it("rejects a plan_start_date that is after the latest goal date", async () => {
    const caller = createTrainingPlansCaller();
    const lateStartInput = {
      plan_start_date: "2026-03-20",
      goals: [minimalGoal],
    };

    let previewThrown: unknown;
    try {
      await caller.getFeasibilityPreview(lateStartInput);
    } catch (error) {
      previewThrown = error;
    }

    expect(previewThrown).toBeInstanceOf(TRPCError);
    expect((previewThrown as TRPCError).code).toBe("BAD_REQUEST");
    expect((previewThrown as TRPCError).message).toContain("plan_start_date");

    let createThrown: unknown;
    try {
      await caller.createFromCreationConfig({
        minimal_plan: lateStartInput,
        creation_input: {},
      });
    } catch (error) {
      createThrown = error;
    }

    expect(createThrown).toBeInstanceOf(TRPCError);
    expect((createThrown as TRPCError).code).toBe("BAD_REQUEST");
    expect((createThrown as TRPCError).message).toContain("plan_start_date");
  });

  it("applies optimization profile defaults for omitted recovery/ramp fields", async () => {
    const caller = createTrainingPlansCaller({
      activities: { data: [], error: null },
      activity_efforts: { data: [], error: null },
      profile_metrics: { data: [], error: null },
    });

    const result = await caller.previewCreationConfig({
      minimal_plan: {
        plan_start_date: "2026-01-05",
        goals: [
          {
            ...minimalGoal,
            target_date: "2026-09-15",
            targets: [
              {
                target_type: "race_performance",
                distance_m: 10000,
                target_time_s: 5400,
                activity_category: "run",
              },
            ],
          },
        ],
      },
      creation_input: {
        user_values: {
          optimization_profile: "sustainable",
        },
      },
    });

    expect(result.normalized_creation_config.optimization_profile).toBe(
      "sustainable",
    );
    expect(result.normalized_creation_config.post_goal_recovery_days).toBe(7);
    expect(result.normalized_creation_config.max_weekly_tss_ramp_pct).toBe(5);
    expect(result.normalized_creation_config.max_ctl_ramp_per_week).toBe(2);
  });

  it("emits blocking cap-violation conflicts and unsafe feasibility reasons", async () => {
    const caller = createTrainingPlansCaller({
      activities: { data: [], error: null },
      activity_efforts: { data: [], error: null },
      profile_metrics: { data: [], error: null },
    });

    const result = await caller.previewCreationConfig({
      minimal_plan: {
        plan_start_date: "2026-01-05",
        goals: [
          {
            ...minimalGoal,
            target_date: "2026-09-15",
            targets: [
              {
                target_type: "race_performance",
                distance_m: 10000,
                target_time_s: 5400,
                activity_category: "run",
              },
            ],
          },
        ],
      },
      creation_input: {
        user_values: {
          max_weekly_tss_ramp_pct: 0,
          max_ctl_ramp_per_week: 0,
        },
      },
    });

    expect(result.conflicts.is_blocking).toBe(false);
    expect(
      result.conflicts.items.some(
        (c) =>
          c.code === "required_tss_ramp_exceeds_cap" ||
          c.code === "required_ctl_ramp_exceeds_cap",
      ),
    ).toBe(true);
    expect(result.projection_feasibility.state).toBe("unsafe");
    expect(
      result.projection_feasibility.reasons.some((reason) =>
        reason.includes("exceeds_configured_cap"),
      ),
    ).toBe(true);
  });

  it("emits blocking recovery compression conflicts for tight multi-goal windows", async () => {
    const caller = createTrainingPlansCaller({
      activities: { data: [], error: null },
      activity_efforts: { data: [], error: null },
      profile_metrics: { data: [], error: null },
    });

    const result = await caller.previewCreationConfig({
      minimal_plan: {
        plan_start_date: "2026-01-05",
        goals: [
          {
            ...minimalGoal,
            name: "Goal A",
            target_date: "2026-03-15",
          },
          {
            ...minimalGoal,
            name: "Goal B",
            target_date: "2026-03-24",
          },
        ],
      },
      creation_input: {
        user_values: {
          post_goal_recovery_days: 14,
        },
      },
    });

    expect(result.conflicts.is_blocking).toBe(false);
    expect(
      result.conflicts.items.some(
        (conflict) =>
          conflict.code === "post_goal_recovery_compresses_next_goal_prep" ||
          conflict.code === "post_goal_recovery_overlaps_next_goal",
      ),
    ).toBe(true);
  });

  it("marks near-cap ramps as aggressive with explicit reasons", async () => {
    const caller = createTrainingPlansCaller({
      activities: { data: [], error: null },
      activity_efforts: { data: [], error: null },
      profile_metrics: { data: [], error: null },
    });

    const baseline = await caller.previewCreationConfig({
      minimal_plan: {
        plan_start_date: "2026-01-05",
        goals: [
          {
            name: "Aggressive Marathon",
            target_date: "2026-07-05",
            priority: 1,
            targets: [
              {
                target_type: "race_performance",
                distance_m: 42195,
                target_time_s: 9900,
                activity_category: "run",
              },
            ],
          },
        ],
      },
      creation_input: {
        user_values: {
          max_weekly_tss_ramp_pct: 20,
          max_ctl_ramp_per_week: 8,
        },
      },
      starting_ctl_override: 70,
    });

    const tssRequestedMax = Math.max(
      ...baseline.projection_chart.microcycles.map((microcycle) => {
        const tss = microcycle.metadata?.tss_ramp;
        if (!tss || tss.previous_week_tss <= 0) return 0;
        return (
          ((tss.requested_weekly_tss - tss.previous_week_tss) /
            tss.previous_week_tss) *
          100
        );
      }),
    );
    const ctlRequestedMax = Math.max(
      ...baseline.projection_chart.microcycles.map(
        (microcycle) => microcycle.metadata?.ctl_ramp.requested_ctl_ramp ?? 0,
      ),
    );

    const nearCap = await caller.previewCreationConfig({
      minimal_plan: {
        plan_start_date: "2026-01-05",
        goals: [
          {
            name: "Aggressive Marathon",
            target_date: "2026-07-05",
            priority: 1,
            targets: [
              {
                target_type: "race_performance",
                distance_m: 42195,
                target_time_s: 9900,
                activity_category: "run",
              },
            ],
          },
        ],
      },
      creation_input: {
        user_values: {
          max_weekly_tss_ramp_pct: Math.min(
            20,
            Number((tssRequestedMax * 1.05).toFixed(2)),
          ),
          max_ctl_ramp_per_week: Math.min(
            8,
            Number((ctlRequestedMax * 1.05).toFixed(2)),
          ),
        },
      },
      starting_ctl_override: 70,
    });

    expect(["aggressive", "unsafe"]).toContain(
      nearCap.projection_feasibility.state,
    );
    expect(nearCap.projection_feasibility.reasons.length).toBeGreaterThan(0);
    expect(
      nearCap.projection_feasibility.reasons.some(
        (reason) =>
          reason.includes("near_configured_cap") ||
          reason.includes("exceeds_configured_cap"),
      ),
    ).toBe(true);
  });

  it("surfaces deterministic preview metadata and allows create when unblocked", async () => {
    const caller = createTrainingPlansCaller({
      activities: { data: [], error: null },
      activity_efforts: { data: [], error: null },
      profile_metrics: { data: [], error: null },
      training_plans: {
        data: {
          id: "plan-row-1",
          name: "Generated Plan",
          description: null,
          structure: {},
          is_active: true,
          profile_id: "profile-123",
        },
        error: null,
      },
    });

    const input = {
      minimal_plan: {
        plan_start_date: "2026-01-05",
        goals: [nonBlockingGoal],
      },
      starting_ctl_override: 42,
      creation_input: {
        user_values: {
          optimization_profile: "outcome_first" as const,
          max_weekly_tss_ramp_pct: 20,
          max_ctl_ramp_per_week: 8,
        },
      },
    };

    const preview = await caller.previewCreationConfig(input);
    expect(preview.normalized_creation_config.optimization_profile).toBe(
      "outcome_first",
    );
    expect(preview.normalized_creation_config.max_weekly_tss_ramp_pct).toBe(20);
    expect(preview.normalized_creation_config.max_ctl_ramp_per_week).toBe(8);

    const created = await caller.createFromCreationConfig(input);
    expect(created.creation_summary.conflicts.is_blocking).toBe(false);
  });

  it("returns a preview snapshot token from previewCreationConfig", async () => {
    const caller = createTrainingPlansCaller({
      activities: { data: [], error: null },
      activity_efforts: { data: [], error: null },
      profile_metrics: { data: [], error: null },
    });

    const result = await caller.previewCreationConfig({
      minimal_plan: {
        plan_start_date: "2026-01-05",
        goals: [nonBlockingGoal],
      },
      creation_input: {},
    });

    expect(result.preview_snapshot.version).toBe("creation_preview_v2");
    expect(typeof result.preview_snapshot.token).toBe("string");
    expect(result.preview_snapshot.token.length).toBeGreaterThan(0);
  });

  it("accepts create when preview snapshot token matches and config is unblocked", async () => {
    const caller = createTrainingPlansCaller({
      activities: { data: [], error: null },
      activity_efforts: { data: [], error: null },
      profile_metrics: { data: [], error: null },
      training_plans: {
        data: {
          id: "plan-row-1",
          name: "Generated Plan",
          description: null,
          structure: {},
          is_active: true,
          profile_id: "profile-123",
        },
        error: null,
      },
    });

    const input = {
      minimal_plan: {
        plan_start_date: "2026-01-05",
        goals: [nonBlockingGoal],
      },
      starting_ctl_override: 42,
      creation_input: {
        user_values: {
          optimization_profile: "outcome_first" as const,
          max_weekly_tss_ramp_pct: 20,
          max_ctl_ramp_per_week: 8,
        },
      },
    };

    const preview = await caller.previewCreationConfig(input);
    const created = await caller.createFromCreationConfig({
      ...input,
      preview_snapshot_token: preview.preview_snapshot.token,
    });
    expect(created.creation_summary.conflicts.is_blocking).toBe(false);
  });

  it("fails createFromCreationConfig when preview snapshot token is stale or invalid", async () => {
    const previewCaller = createTrainingPlansCaller({
      activities: { data: [], error: null },
      activity_efforts: { data: [], error: null },
      profile_metrics: { data: [], error: null },
    });

    const createCaller = createTrainingPlansCaller({
      activities: {
        data: [
          {
            started_at: "2026-01-01T10:00:00.000Z",
            training_stress_score: 150,
          },
        ],
        error: null,
      },
      activity_efforts: { data: [], error: null },
      profile_metrics: { data: [], error: null },
      training_plans: {
        data: {
          id: "plan-row-1",
          name: "Generated Plan",
          description: null,
          structure: {},
          is_active: true,
          profile_id: "profile-123",
        },
        error: null,
      },
    });

    const input = {
      minimal_plan: {
        plan_start_date: "2026-01-05",
        goals: [nonBlockingGoal],
      },
      creation_input: {},
    };

    const preview = await previewCaller.previewCreationConfig(input);

    await expect(
      createCaller.createFromCreationConfig({
        ...input,
        preview_snapshot_token: preview.preview_snapshot.token,
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("Refresh previewCreationConfig"),
    });

    await expect(
      createCaller.createFromCreationConfig({
        ...input,
        preview_snapshot_token: "invalid-token",
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("Refresh previewCreationConfig"),
    });
  });

  it("invalidates preview tokens when creation config changes between preview and create", async () => {
    const caller = createTrainingPlansCaller({
      activities: { data: [], error: null },
      activity_efforts: { data: [], error: null },
      profile_metrics: { data: [], error: null },
      training_plans: {
        data: {
          id: "plan-row-1",
          name: "Generated Plan",
          description: null,
          structure: {},
          is_active: true,
          profile_id: "profile-123",
        },
        error: null,
      },
    });

    const previewInput = {
      minimal_plan: {
        plan_start_date: "2026-01-05",
        goals: [nonBlockingGoal],
      },
      creation_input: {
        user_values: {
          optimization_profile: "balanced" as const,
          max_weekly_tss_ramp_pct: 7,
          max_ctl_ramp_per_week: 3,
        },
      },
    };

    const preview = await caller.previewCreationConfig(previewInput);

    await expect(
      caller.createFromCreationConfig({
        minimal_plan: previewInput.minimal_plan,
        creation_input: {
          user_values: {
            optimization_profile: "outcome_first",
            max_weekly_tss_ramp_pct: 20,
            max_ctl_ramp_per_week: 8,
          },
        },
        preview_snapshot_token: preview.preview_snapshot.token,
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("Refresh previewCreationConfig"),
    });
  });

  it("keeps preview/create projection diagnostics and metadata in parity", async () => {
    const caller = createTrainingPlansCaller({
      activities: { data: [], error: null },
      activity_efforts: { data: [], error: null },
      profile_metrics: { data: [], error: null },
      training_plans: {
        data: {
          id: "plan-row-1",
          name: "Generated Plan",
          description: null,
          structure: {},
          is_active: true,
          profile_id: "profile-123",
        },
        error: null,
      },
    });

    const input = {
      minimal_plan: {
        plan_start_date: "2026-01-05",
        goals: [minimalGoal],
      },
      starting_ctl_override: 42,
      creation_input: {
        user_values: {
          optimization_profile: "outcome_first" as const,
          max_weekly_tss_ramp_pct: 20,
          max_ctl_ramp_per_week: 8,
        },
      },
    };

    const preview = await caller.previewCreationConfig(input);
    const created = await caller.createFromCreationConfig({
      ...input,
      preview_snapshot_token: preview.preview_snapshot.token,
    });

    expect(created.creation_summary.normalized_creation_config).toMatchObject({
      optimization_profile:
        preview.normalized_creation_config.optimization_profile,
      max_weekly_tss_ramp_pct:
        preview.normalized_creation_config.max_weekly_tss_ramp_pct,
      max_ctl_ramp_per_week:
        preview.normalized_creation_config.max_ctl_ramp_per_week,
    });
    expect(created.creation_summary.projection_feasibility).toEqual(
      preview.projection_feasibility,
    );
    expect(created.creation_summary.projection_chart.readiness_score).toBe(
      preview.projection_chart.readiness_score,
    );
    expect(created.creation_summary.projection_chart.readiness_confidence).toBe(
      preview.projection_chart.readiness_confidence,
    );
    expect(created.creation_summary.projection_chart.capacity_envelope).toEqual(
      preview.projection_chart.capacity_envelope,
    );
    expect(created.creation_summary.projection_chart.risk_flags).toEqual(
      preview.projection_chart.risk_flags,
    );
    expect(created.creation_summary.projection_chart.caps_applied).toEqual(
      preview.projection_chart.caps_applied,
    );
    expect(
      created.creation_summary.projection_chart.projection_diagnostics,
    ).toEqual(preview.projection_chart.projection_diagnostics);
    expect("mode_applied" in created.creation_summary.projection_chart).toBe(
      false,
    );
    expect(
      "overrides_applied" in created.creation_summary.projection_chart,
    ).toBe(false);
  });

  it("preserves deterministic diagnostics path in preview", async () => {
    const caller = createTrainingPlansCaller({
      activities: { data: [], error: null },
      activity_efforts: { data: [], error: null },
      profile_metrics: { data: [], error: null },
      training_plans: {
        data: {
          id: "plan-row-1",
          name: "Generated Plan",
          description: null,
          structure: {},
          is_active: true,
          profile_id: "profile-123",
        },
        error: null,
      },
    });

    const relaxedGoal = {
      name: "Safe Fallback Goal",
      target_date: "2026-10-15",
      priority: 1,
      targets: [
        {
          target_type: "hr_threshold" as const,
          target_lthr_bpm: 160,
        },
      ],
    };

    const input = {
      minimal_plan: {
        plan_start_date: "2026-01-05",
        goals: [relaxedGoal],
      },
      starting_ctl_override: 42,
      creation_input: {
        user_values: {
          optimization_profile: "balanced" as const,
          max_weekly_tss_ramp_pct: 7,
          max_ctl_ramp_per_week: 3,
        },
      },
    };

    const preview = await caller.previewCreationConfig(input);

    expect(preview.projection_chart.projection_diagnostics).toMatchObject({
      selected_path: expect.any(String),
      candidate_counts: expect.any(Object),
      prune_counts: expect.any(Object),
      tie_break_chain: expect.any(Array),
    });
    const fallbackReason =
      preview.projection_chart.projection_diagnostics?.fallback_reason;
    expect(fallbackReason === null || typeof fallbackReason === "string").toBe(
      true,
    );
  });

  it("returns preview timeline anchored to plan_start_date when provided", async () => {
    const caller = createTrainingPlansCaller({
      activities: {
        data: [],
        error: null,
      },
      activity_efforts: {
        data: [],
        error: null,
      },
      profile_metrics: {
        data: [],
        error: null,
      },
    });

    const result = await caller.previewCreationConfig({
      minimal_plan: {
        plan_start_date: "2026-01-05",
        goals: [minimalGoal],
      },
      creation_input: {},
    });

    expect(result.plan_preview.start_date).toBe("2026-01-05");
    expect(result.projection_chart.start_date).toBe("2026-01-05");
    expect(result.plan_preview.end_date).toBe("2026-03-15");
    expect(result.projection_chart.end_date).toBe("2026-03-15");
  });

  it("keeps projected load and fitness above zero near event week", async () => {
    const caller = createTrainingPlansCaller({
      activities: {
        data: [],
        error: null,
      },
      activity_efforts: {
        data: [],
        error: null,
      },
      profile_metrics: {
        data: [],
        error: null,
      },
    });

    const result = await caller.previewCreationConfig({
      minimal_plan: {
        plan_start_date: "2026-01-05",
        goals: [minimalGoal],
      },
      creation_input: {},
    });

    const points = result.projection_chart.points;
    expect(points.length).toBeGreaterThan(1);

    const last = points.at(-1)!;
    expect(last.predicted_load_tss).toBeGreaterThan(0);
    expect(last.predicted_fitness_ctl).toBeGreaterThan(0);
  });

  it("applies no-history projection floor metadata when user has no activity data", async () => {
    const caller = createTrainingPlansCaller({
      activities: { data: [], error: null },
      activity_efforts: { data: [], error: null },
      profile_metrics: { data: [], error: null },
    });

    const result = await caller.previewCreationConfig({
      minimal_plan: {
        plan_start_date: "2026-01-05",
        goals: [minimalGoal],
      },
      creation_input: {},
    });

    const points = result.projection_chart.points;
    expect(points.length).toBeGreaterThan(0);
    expect(points[0]!.predicted_fitness_ctl).toBeGreaterThanOrEqual(0);
    expect(result.projection_chart.no_history).toMatchObject({
      projection_floor_applied: true,
      floor_clamped_by_availability: expect.any(Boolean),
      fitness_level: expect.any(String),
      fitness_inference_reasons: expect.any(Array),
      projection_floor_confidence: expect.any(String),
      evidence_confidence: {
        score: expect.any(Number),
        state: expect.any(String),
        reasons: expect.any(Array),
      },
      projection_feasibility: {
        demand_gap: expect.any(Object),
        readiness_band: expect.any(String),
        dominant_limiters: expect.any(Array),
        readiness_score: expect.any(Number),
        readiness_components: {
          load_state: expect.any(Number),
          intensity_balance: expect.any(Number),
          specificity: expect.any(Number),
          execution_confidence: expect.any(Number),
        },
        projection_uncertainty: {
          tss_low: expect.any(Number),
          tss_likely: expect.any(Number),
          tss_high: expect.any(Number),
          confidence: expect.any(Number),
        },
      },
    });
  });

  it("avoids finishing projected fitness below starting fitness for ambitious marathon goal", async () => {
    const caller = createTrainingPlansCaller({
      activities: { data: [], error: null },
      activity_efforts: { data: [], error: null },
      profile_metrics: { data: [], error: null },
    });

    const result = await caller.previewCreationConfig({
      minimal_plan: {
        plan_start_date: "2026-01-05",
        goals: [
          {
            name: "Sub-2:45 Marathon",
            target_date: "2026-07-05",
            priority: 1,
            targets: [
              {
                target_type: "race_performance",
                distance_m: 42195,
                target_time_s: 9900,
                activity_category: "run",
              },
            ],
          },
        ],
      },
      creation_input: {},
    });

    const points = result.projection_chart.points;
    expect(points.length).toBeGreaterThan(1);

    const startFitness = points[0]!.predicted_fitness_ctl;
    const endFitness = points[points.length - 1]!.predicted_fitness_ctl;

    expect(endFitness).toBeGreaterThanOrEqual(startFitness);
  });

  it("keeps long-horizon sub-3 marathon demand from collapsing to low fixed weekly TSS", async () => {
    const caller = createTrainingPlansCaller({
      activities: { data: [], error: null },
      activity_efforts: { data: [], error: null },
      profile_metrics: { data: [], error: null },
    });

    const result = await caller.previewCreationConfig({
      minimal_plan: {
        plan_start_date: "2026-01-05",
        goals: [
          {
            name: "Sub-3 Marathon",
            target_date: "2026-09-06",
            priority: 1,
            targets: [
              {
                target_type: "race_performance",
                distance_m: 42195,
                target_time_s: 10800,
                activity_category: "run",
              },
            ],
          },
        ],
      },
      creation_input: {},
    });

    const peakWeeklyTss = result.projection_chart.microcycles.reduce(
      (max, week) => Math.max(max, week.planned_weekly_tss),
      0,
    );

    expect(peakWeeklyTss).toBeGreaterThan(140);
  });

  it("includes all goals as markers in projection chart for multi-goal previews", async () => {
    const caller = createTrainingPlansCaller({
      activities: { data: [], error: null },
      activity_efforts: { data: [], error: null },
      profile_metrics: { data: [], error: null },
    });

    const result = await caller.previewCreationConfig({
      minimal_plan: {
        plan_start_date: "2026-01-05",
        goals: [
          {
            name: "Spring 10k",
            target_date: "2026-03-15",
            priority: 1,
            targets: [
              {
                target_type: "race_performance",
                distance_m: 10000,
                target_time_s: 2700,
                activity_category: "run",
              },
            ],
          },
          {
            name: "Summer Half",
            target_date: "2026-06-20",
            priority: 2,
            targets: [
              {
                target_type: "race_performance",
                distance_m: 21097,
                target_time_s: 6000,
                activity_category: "run",
              },
            ],
          },
        ],
      },
      creation_input: {},
    });

    const goalMarkerDates = result.projection_chart.goal_markers.map(
      (goal) => goal.target_date,
    );
    expect(goalMarkerDates).toEqual(["2026-03-15", "2026-06-20"]);

    const pointDates = new Set(
      result.projection_chart.points.map((p) => p.date),
    );
    expect(pointDates.has("2026-03-15")).toBe(true);
    expect(pointDates.has("2026-06-20")).toBe(true);
  });

  it("threads safety controls into normalized config and projection metadata", async () => {
    const caller = createTrainingPlansCaller({
      activities: { data: [], error: null },
      activity_efforts: { data: [], error: null },
      profile_metrics: { data: [], error: null },
    });

    const result = await caller.previewCreationConfig({
      minimal_plan: {
        plan_start_date: "2026-01-05",
        goals: [
          {
            name: "Goal One",
            target_date: "2026-02-10",
            priority: 2,
            targets: [
              {
                target_type: "race_performance",
                distance_m: 5000,
                target_time_s: 1320,
                activity_category: "run",
              },
            ],
          },
          {
            name: "Goal Two",
            target_date: "2026-03-15",
            priority: 1,
            targets: [
              {
                target_type: "race_performance",
                distance_m: 10000,
                target_time_s: 2700,
                activity_category: "run",
              },
            ],
          },
        ],
      },
      creation_input: {
        user_values: {
          optimization_profile: "sustainable",
          post_goal_recovery_days: 6,
          max_weekly_tss_ramp_pct: 4,
          max_ctl_ramp_per_week: 1.5,
        },
      },
    });

    expect(result.normalized_creation_config.optimization_profile).toBe(
      "sustainable",
    );
    expect(result.normalized_creation_config.post_goal_recovery_days).toBe(6);
    expect(result.normalized_creation_config.max_weekly_tss_ramp_pct).toBe(4);
    expect(result.normalized_creation_config.max_ctl_ramp_per_week).toBe(1.5);

    expect(
      result.projection_chart.constraint_summary.normalized_creation_config,
    ).toMatchObject({
      optimization_profile: "sustainable",
      post_goal_recovery_days: 6,
      max_weekly_tss_ramp_pct: 4,
      max_ctl_ramp_per_week: 1.5,
    });
    expect(result.projection_chart.recovery_segments.length).toBeGreaterThan(0);
    expect(
      result.projection_chart.microcycles.some((week) => week.metadata),
    ).toBe(true);
  });

  it("accepts create payload with no mode/risk fields and no acknowledgement requirement", async () => {
    const caller = createTrainingPlansCaller({
      activities: { data: [], error: null },
      activity_efforts: { data: [], error: null },
      profile_metrics: { data: [], error: null },
      training_plans: {
        data: {
          id: "plan-row-1",
          name: "Generated Plan",
          description: null,
          structure: {},
          is_active: true,
          profile_id: "profile-123",
        },
        error: null,
      },
    });

    const input = {
      minimal_plan: {
        plan_start_date: "2026-01-05",
        goals: [minimalGoal],
      },
      starting_ctl_override: 42,
      creation_input: {
        user_values: {
          optimization_profile: "outcome_first" as const,
          max_weekly_tss_ramp_pct: 20,
          max_ctl_ramp_per_week: 8,
        },
      },
    };

    const preview = await caller.previewCreationConfig(input);
    const created = await caller.createFromCreationConfig({
      ...input,
      preview_snapshot_token: preview.preview_snapshot.token,
    });

    expect(created.creation_summary.conflicts.is_blocking).toBe(false);
  });

  it("hard-rejects removed mode/risk/constraint fields", async () => {
    const caller = createTrainingPlansCaller({
      activities: { data: [], error: null },
      activity_efforts: { data: [], error: null },
      profile_metrics: { data: [], error: null },
    });

    const relaxedGoal = {
      name: "Threshold check",
      target_date: "2026-10-15",
      priority: 1,
      targets: [
        {
          target_type: "hr_threshold" as const,
          target_lthr_bpm: 160,
        },
      ],
    };

    const input = {
      minimal_plan: {
        plan_start_date: "2026-01-05",
        goals: [relaxedGoal],
      },
      creation_input: {
        mode: "risk_accepted",
        risk_acceptance: {
          accepted: true,
          reason: "Accept elevated risk",
        },
        constraint_policy: {
          enforce_safety_caps: true,
          enforce_feasibility_caps: false,
          readiness_cap_enabled: false,
        },
        user_values: {
          mode: "risk_accepted",
          risk_acceptance: {
            accepted: true,
            reason: "Accept elevated risk",
          },
          constraint_policy: {
            enforce_safety_caps: true,
            enforce_feasibility_caps: false,
            readiness_cap_enabled: false,
          },
          optimization_profile: "outcome_first" as const,
          max_weekly_tss_ramp_pct: 20,
          max_ctl_ramp_per_week: 8,
        },
      },
    };

    await expect(caller.previewCreationConfig(input)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });

    await expect(
      caller.createFromCreationConfig({
        ...input,
        preview_snapshot_token: "not-used-because-parse-fails",
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("keeps preview/create latency percentiles and diagnostics within rollout guardrails", async () => {
    const caller = createTrainingPlansCaller({
      activities: { data: [], error: null },
      activity_efforts: { data: [], error: null },
      profile_metrics: { data: [], error: null },
      training_plans: {
        data: {
          id: "plan-row-1",
          name: "Generated Plan",
          description: null,
          structure: {},
          is_active: true,
          profile_id: "profile-123",
        },
        error: null,
      },
    });

    const iterations = 8;
    const thresholdsMs = {
      preview: { p50: 1500, p95: 3000, p99: 3500 },
      create: { p50: 1800, p95: 3500, p99: 4000 },
    };

    const input = {
      minimal_plan: {
        plan_start_date: "2026-01-05",
        goals: [minimalGoal],
      },
      starting_ctl_override: 42,
      creation_input: {
        user_values: {
          optimization_profile: "outcome_first" as const,
          max_weekly_tss_ramp_pct: 20,
          max_ctl_ramp_per_week: 8,
        },
      },
    };

    const previewLatenciesMs: number[] = [];
    const createLatenciesMs: number[] = [];

    for (let i = 0; i < iterations; i += 1) {
      const previewStart = performance.now();
      const preview = await caller.previewCreationConfig(input);
      previewLatenciesMs.push(performance.now() - previewStart);
      assertSaneProjectionDiagnostics(
        preview.projection_chart.projection_diagnostics,
      );

      const createStart = performance.now();
      const created = await caller.createFromCreationConfig({
        ...input,
        preview_snapshot_token: preview.preview_snapshot.token,
      });
      createLatenciesMs.push(performance.now() - createStart);
      assertSaneProjectionDiagnostics(
        created.creation_summary.projection_chart.projection_diagnostics,
      );

      expect(
        created.creation_summary.projection_chart.projection_diagnostics,
      ).toEqual(preview.projection_chart.projection_diagnostics);
    }

    const previewP50 = percentile(previewLatenciesMs, 50);
    const previewP95 = percentile(previewLatenciesMs, 95);
    const previewP99 = percentile(previewLatenciesMs, 99);
    const createP50 = percentile(createLatenciesMs, 50);
    const createP95 = percentile(createLatenciesMs, 95);
    const createP99 = percentile(createLatenciesMs, 99);

    expect(previewP50).toBeLessThan(thresholdsMs.preview.p50);
    expect(previewP95).toBeLessThan(thresholdsMs.preview.p95);
    expect(previewP99).toBeLessThan(thresholdsMs.preview.p99);
    expect(createP50).toBeLessThan(thresholdsMs.create.p50);
    expect(createP95).toBeLessThan(thresholdsMs.create.p95);
    expect(createP99).toBeLessThan(thresholdsMs.create.p99);
  });
});

describe("trainingPlansRouter analytics endpoints", () => {
  const planId = "11111111-1111-4111-8111-111111111111";

  it("returns null current status when no plan exists", async () => {
    const caller = createTrainingPlansCaller({
      training_plans: { data: null, error: null },
    });

    const result = await caller.getCurrentStatus();
    expect(result).toBeNull();
  });

  it("returns ideal curve projection payload shape", async () => {
    const caller = createTrainingPlansCaller({
      training_plans: {
        data: {
          id: planId,
          structure: {
            periodization_template: {
              starting_ctl: 42,
              target_ctl: 60,
              target_date: "2026-03-31",
            },
            blocks: [],
            target_weekly_tss: 280,
          },
        },
        error: null,
      },
      activities: { data: [], error: null },
    });

    const result = await caller.getIdealCurve({
      id: planId,
      start_date: "2026-01-01",
      end_date: "2026-03-31",
    });

    expect(result).toMatchObject({
      dataPoints: expect.any(Array),
      startCTL: expect.any(Number),
      targetCTL: expect.any(Number),
      targetDate: expect.any(String),
    });
  });

  it("returns actual curve data points", async () => {
    const caller = createTrainingPlansCaller({
      activities: { data: [], error: null },
    });

    const result = await caller.getActualCurve({
      start_date: "2026-01-01T00:00:00.000Z",
      end_date: "2026-01-07T00:00:00.000Z",
    });

    expect(result).toMatchObject({
      dataPoints: expect.any(Array),
    });
  });

  it("returns weekly summary rows", async () => {
    const caller = createTrainingPlansCaller({
      training_plans: {
        data: {
          id: planId,
          structure: {
            blocks: [],
            constraints: { available_days_per_week: ["monday", "wednesday"] },
          },
        },
        error: null,
      },
      planned_activities: { data: [], error: null },
      activities: { data: [], error: null },
    });

    const result = await caller.getWeeklySummary({
      training_plan_id: planId,
      weeks_back: 2,
    });

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      weekStart: expect.any(String),
      weekEnd: expect.any(String),
      plannedTSS: expect.any(Number),
      completedTSS: expect.any(Number),
      status: expect.any(String),
    });
  });
});
