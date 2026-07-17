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
        version: 1,
        sessions: [
          {
            offset_days: 0,
            activity_plan_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          },
        ],
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
    resolveCanonicalTrainingPlan: vi.fn(async ({ planId }: { planId: string }) => ({
      fingerprint: "resolution-fingerprint",
      policy_version: 1,
      resolution_manifest: [{ selected_activity_plan_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }],
      structure: {
        id: planId,
        version: 1,
        sessions: [{ offset_days: 0, activity_plan_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }],
      },
    })),
    persistCanonicalTrainingPlanUpdate: vi.fn(async ({ values }: any) => values),
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

    const updateCalls = deps.persistCanonicalTrainingPlanUpdate.mock.calls;
    const persistedUpdatePayload = updateCalls[0]?.[0]?.values as {
      structure?: Record<string, unknown>;
    };

    expect(persistedUpdatePayload).not.toHaveProperty("is_active");

    expect(persistedUpdatePayload.structure).not.toHaveProperty("metadata");
    expect(persistedUpdatePayload.structure).toMatchObject({
      id: "11111111-1111-4111-8111-111111111111",
      version: 1,
      sessions: [{ activity_plan_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }],
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

  it("does not update when canonical template coverage is unresolved", async () => {
    const repository = createRepositoryMock({
      id: "11111111-1111-4111-8111-111111111111",
      profile_id: "profile-123",
      structure: { id: "11111111-1111-4111-8111-111111111111" },
      is_active: true,
    });
    const deps = createDeps();
    deps.resolveCanonicalTrainingPlan = vi.fn(async () => {
      throw new Error("Missing exact sport/focus template coverage");
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
    ).rejects.toThrow("Missing exact sport/focus template coverage");
    expect(repository.updateTrainingPlan).not.toHaveBeenCalled();
  });

  it("does not update when a selected template changes while acquiring the write lock", async () => {
    const repository = createRepositoryMock({
      id: "11111111-1111-4111-8111-111111111111",
      profile_id: "profile-123",
      is_active: true,
    });
    const deps = createDeps();
    deps.persistCanonicalTrainingPlanUpdate = vi.fn(async () => {
      throw new Error("Activity templates changed before persistence");
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
    ).rejects.toThrow("changed before persistence");
    expect(repository.updateTrainingPlan).not.toHaveBeenCalled();
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
