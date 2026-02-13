import { describe, expect, it, vi } from "vitest";
import { createFromCreationConfigUseCase } from "../createFromCreationConfigUseCase";

const finalConfigFixture: any = {
  optimization_profile: "balanced",
  post_goal_recovery_days: 5,
  max_weekly_tss_ramp_pct: 7,
  max_ctl_ramp_per_week: 3,
  feasibility_safety_summary: {
    computed_at: "2026-01-01T00:00:00.000Z",
  },
};

function createDeps() {
  return {
    enforceCreationConfigFeatureEnabled: vi.fn(),
    enforceNoAutonomousPostCreateMutation: vi.fn(),
    evaluateCreationConfig: vi.fn(async () => ({
      finalConfig: finalConfigFixture,
      contextSummary: { history_availability_state: "none" },
      conflictResolution: { conflicts: [], precedence: {} },
      feasibilitySummary: { overall_state: "safe" },
    })),
    estimateCurrentCtl: vi.fn(async () => 42),
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
            starting_atl: 42,
            starting_tsb: 0,
            starting_state_is_prior: false,
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

    expect(result.creation_summary.normalized_creation_config).toEqual(
      finalConfigFixture,
    );
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
});
