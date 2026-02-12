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
        goals: [minimalGoal],
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
        goals: [minimalGoal],
      },
      creation_input: {
        user_values: {
          max_weekly_tss_ramp_pct: 0,
          max_ctl_ramp_per_week: 0,
        },
      },
    });

    expect(result.conflicts.is_blocking).toBe(true);
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

    expect(result.conflicts.is_blocking).toBe(true);
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
    });

    expect(nearCap.projection_feasibility.state).toBe("aggressive");
    expect(nearCap.projection_feasibility.reasons.length).toBeGreaterThan(0);
    expect(
      nearCap.projection_feasibility.reasons.some((reason) =>
        reason.includes("near_configured_cap"),
      ),
    ).toBe(true);
  });

  it("keeps preview/create payloads in parity for normalized config and feasibility", async () => {
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
      creation_input: {
        user_values: {
          optimization_profile: "outcome_first" as const,
          max_weekly_tss_ramp_pct: 20,
          max_ctl_ramp_per_week: 8,
        },
      },
    };

    const preview = await caller.previewCreationConfig(input);
    const created = await caller.createFromCreationConfig(input);

    expect(
      created.creation_summary.normalized_creation_config.optimization_profile,
    ).toBe(preview.normalized_creation_config.optimization_profile);
    expect(
      created.creation_summary.normalized_creation_config
        .post_goal_recovery_days,
    ).toBe(preview.normalized_creation_config.post_goal_recovery_days);
    expect(
      created.creation_summary.normalized_creation_config
        .max_weekly_tss_ramp_pct,
    ).toBe(preview.normalized_creation_config.max_weekly_tss_ramp_pct);
    expect(
      created.creation_summary.normalized_creation_config.max_ctl_ramp_per_week,
    ).toBe(preview.normalized_creation_config.max_ctl_ramp_per_week);
    expect(created.creation_summary.projection_feasibility.state).toBe(
      preview.projection_feasibility.state,
    );
    expect(created.creation_summary.projection_feasibility.reasons).toEqual(
      preview.projection_feasibility.reasons,
    );
    expect(
      created.creation_summary.projection_chart.constraint_summary,
    ).toEqual(preview.projection_chart.constraint_summary);
    expect(created.creation_summary.projection_chart.no_history).toEqual(
      preview.projection_chart.no_history,
    );
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
        goals: [minimalGoal],
      },
      creation_input: {},
    });

    expect(result.preview_snapshot.version).toBe("creation_preview_v1");
    expect(typeof result.preview_snapshot.token).toBe("string");
    expect(result.preview_snapshot.token.length).toBeGreaterThan(0);
  });

  it("creates successfully when preview snapshot token matches", async () => {
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

    expect(created.id).toBe("plan-row-1");
    expect(created.creation_summary.projection_feasibility.state).toBe(
      preview.projection_feasibility.state,
    );
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
        goals: [minimalGoal],
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
});
