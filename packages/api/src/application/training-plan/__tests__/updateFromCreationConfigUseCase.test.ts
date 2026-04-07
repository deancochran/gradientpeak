import { describe, expect, it, vi } from "vitest";
import { updateFromCreationConfigUseCase } from "../updateFromCreationConfigUseCase";

function createRepositoryMock(existingPlan: Record<string, unknown> | null) {
  return {
    createTrainingPlan: vi.fn(),
    getOwnedTrainingPlan: vi.fn(async () => existingPlan),
    updateTrainingPlan: vi.fn(async (input) => ({
      id: existingPlan?.id ?? input.id,
      profile_id: input.profileId,
      structure: input.structure,
      ...input,
    })),
    getPriorInferredStateSnapshot: vi.fn(async () => null),
    persistInferredStateSnapshot: vi.fn(async () => undefined),
  };
}

function createDeps() {
  return {
    enforceCreationConfigFeatureEnabled: vi.fn(),
    enforceNoAutonomousPostCreateMutation: vi.fn(),
    evaluateCreationConfig: vi.fn(async () => ({
      finalConfig: {
        optimization_profile: "balanced",
        post_goal_recovery_days: 5,
        max_weekly_tss_ramp_pct: 7,
        max_ctl_ramp_per_week: 3,
        calibration: { version: 1 },
      },
      contextSummary: { history_availability_state: "none" },
      loadBootstrapState: {
        starting_ctl: 40,
        starting_atl: 35,
        starting_tsb: 5,
      },
      conflictResolution: { conflicts: [], precedence: {} },
      feasibilitySummary: { overall_state: "safe" },
    })),
    buildCreationProjectionArtifacts: vi.fn(() => ({
      expandedPlan: {
        name: "Updated Plan",
        goals: [],
        blocks: [],
        metadata: {},
      },
      projectionChart: {
        constraint_summary: {
          tss_ramp_clamp_weeks: 0,
          ctl_ramp_clamp_weeks: 0,
          recovery_weeks: 0,
        },
      },
      projectionFeasibility: { state: "feasible" as const, reasons: [] },
    })),
    buildCreationPreviewSnapshotToken: vi.fn(() => "preview-token"),
    deriveProjectionDrivenConflicts: vi.fn(() => []),
    parseTrainingPlanStructure: vi.fn(),
  } as any;
}

describe("updateFromCreationConfigUseCase", () => {
  it("updates existing plan and preserves identity", async () => {
    const repository = createRepositoryMock({
      id: "11111111-1111-4111-8111-111111111111",
      profile_id: "profile-123",
      structure: { id: "11111111-1111-4111-8111-111111111111" },
      is_active: true,
    });
    const deps = createDeps();

    const result = await updateFromCreationConfigUseCase({
      creationContextReader: {} as any,
      repository: repository as any,
      profileId: "profile-123",
      params: {
        plan_id: "11111111-1111-4111-8111-111111111111",
        minimal_plan: { plan_start_date: "2026-01-05", goals: [] },
        creation_input: {},
        preview_snapshot_token: "preview-token",
        is_active: true,
      },
      deps,
    });

    expect(result.id).toBe("11111111-1111-4111-8111-111111111111");
    expect(result.creation_summary.conflicts.is_blocking).toBe(false);

    const updateCalls = repository.updateTrainingPlan.mock.calls;
    const persistedUpdatePayload = updateCalls[0]?.[0] as {
      structure?: { metadata?: Record<string, unknown> };
    };

    expect(persistedUpdatePayload).not.toHaveProperty("is_active");

    expect(persistedUpdatePayload?.structure?.metadata?.creation_config_snapshot).toMatchObject({
      optimization_profile: "balanced",
      post_goal_recovery_days: 5,
    });
    expect(persistedUpdatePayload?.structure?.metadata?.creation_form_snapshot).toEqual({
      plan_start_date: "2026-01-05",
      goals: [],
    });
  });

  it("rejects unresolved conflicts", async () => {
    const repository = createRepositoryMock({
      id: "11111111-1111-4111-8111-111111111111",
      profile_id: "profile-123",
      structure: { id: "11111111-1111-4111-8111-111111111111" },
      is_active: true,
    });
    const deps = createDeps();
    deps.deriveProjectionDrivenConflicts = vi.fn(() => [
      {
        code: "required_tss_ramp_exceeds_cap",
        severity: "blocking",
        message: "blocking",
        field_paths: [],
        suggestions: [],
      },
    ]);

    await expect(
      updateFromCreationConfigUseCase({
        creationContextReader: {} as any,
        repository: repository as any,
        profileId: "profile-123",
        params: {
          plan_id: "11111111-1111-4111-8111-111111111111",
          minimal_plan: { plan_start_date: "2026-01-05", goals: [] },
          creation_input: {},
          preview_snapshot_token: "preview-token",
          is_active: true,
        },
        deps,
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("Creation blocked by unresolved conflicts"),
      cause: {
        domain: "training_plan_commit",
        code: "TRAINING_PLAN_COMMIT_CONFLICT",
        operation: "updateFromCreationConfig",
        recoverable: true,
        details: {
          blocking_conflict_codes: ["required_tss_ramp_exceeds_cap"],
        },
      },
    });
  });

  it("rejects stale preview token with typed stale cause", async () => {
    const repository = createRepositoryMock({
      id: "11111111-1111-4111-8111-111111111111",
      profile_id: "profile-123",
      structure: { id: "11111111-1111-4111-8111-111111111111" },
      is_active: true,
    });
    const deps = createDeps();

    await expect(
      updateFromCreationConfigUseCase({
        creationContextReader: {} as any,
        repository: repository as any,
        profileId: "profile-123",
        params: {
          plan_id: "11111111-1111-4111-8111-111111111111",
          minimal_plan: { plan_start_date: "2026-01-05", goals: [] },
          creation_input: {},
          preview_snapshot_token: "stale-preview-token",
          is_active: true,
        },
        deps,
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("Refresh preview"),
      cause: {
        domain: "training_plan_commit",
        code: "TRAINING_PLAN_COMMIT_STALE_PREVIEW",
        operation: "updateFromCreationConfig",
        recoverable: true,
      },
    });
  });

  it("rejects invalid generated payload with typed invalid cause", async () => {
    const repository = createRepositoryMock({
      id: "11111111-1111-4111-8111-111111111111",
      profile_id: "profile-123",
      structure: { id: "11111111-1111-4111-8111-111111111111" },
      is_active: true,
    });
    const deps = createDeps();
    deps.parseTrainingPlanStructure = vi.fn(() => {
      throw new Error("invalid structure");
    });

    await expect(
      updateFromCreationConfigUseCase({
        creationContextReader: {} as any,
        repository: repository as any,
        profileId: "profile-123",
        params: {
          plan_id: "11111111-1111-4111-8111-111111111111",
          minimal_plan: { plan_start_date: "2026-01-05", goals: [] },
          creation_input: {},
          preview_snapshot_token: "preview-token",
          is_active: true,
        },
        deps,
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Generated training plan structure is invalid",
      cause: {
        domain: "training_plan_commit",
        code: "TRAINING_PLAN_COMMIT_INVALID_PAYLOAD",
        operation: "updateFromCreationConfig",
        recoverable: true,
      },
    });
  });

  it("rejects when plan is missing or not owned by caller", async () => {
    const repository = createRepositoryMock(null);
    const deps = createDeps();

    await expect(
      updateFromCreationConfigUseCase({
        creationContextReader: {} as any,
        repository: repository as any,
        profileId: "profile-123",
        params: {
          plan_id: "11111111-1111-4111-8111-111111111111",
          minimal_plan: { plan_start_date: "2026-01-05", goals: [] },
          creation_input: {},
          preview_snapshot_token: "preview-token",
          is_active: true,
        },
        deps,
      }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Training plan not found or you do not have access to edit it",
      cause: {
        domain: "training_plan_commit",
        code: "TRAINING_PLAN_COMMIT_NOT_FOUND",
        operation: "updateFromCreationConfig",
        recoverable: false,
      },
    });
  });
});
