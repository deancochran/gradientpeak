import { activityPlanSemanticHash, activityPlanStructureSchema } from "@repo/core/activity-plan";
import { describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import type { PlannedSessionRepositoryPort } from "../../repositories/planned-session-repository-port";
import { ActivityPlanIntegrityError } from "../activity-plans/resolver-candidate";
import { activityPlanStructureHash } from "../activity-plans/structure-hash";
import { createDirectPlannedSession } from "./create-direct-planned-session";
import { PlannedSessionAccessError } from "./planned-session-errors";

vi.mock("../athlete-intelligence/load-planning-baseline", () => ({
  loadPlanningBaseline: vi.fn(async () => ({
    status: "no_context",
    as_of: "2026-08-17T12:34:56.000Z",
  })),
}));

const profileId = "11111111-1111-4111-8111-111111111111";
const activityPlanId = "22222222-2222-4222-8222-222222222222";
const groupEventId = "77777777-7777-4777-8777-777777777777";
const structure = activityPlanStructureSchema.parse({
  version: 3,
  activity_category: "run",
  segments: [
    {
      id: "33333333-3333-4333-8333-333333333333",
      role: "activity",
      name: "Run",
      intervals: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          name: "Main",
          repetitions: 1,
          steps: [
            {
              id: "55555555-5555-4555-8555-555555555555",
              name: "Steady",
              purpose: "work",
              duration: { type: "time", seconds: 1_800 },
              targets: [{ type: "RPE", intensity: 5 }],
            },
          ],
        },
      ],
    },
  ],
});

function repositoryWithPlan() {
  const createOwned = vi.fn<PlannedSessionRepositoryPort["createOwned"]>(
    async ({ session }: Parameters<PlannedSessionRepositoryPort["createOwned"]>[0]) => ({
      status: "created" as const,
      session,
    }),
  );
  const repository = {
    getActivityPlanPrescriptionSource: vi.fn(async () => ({
      id: activityPlanId,
      profileId,
      name: "Steady run",
      description: null,
      revision: 9,
      structure,
      adaptation: null,
      trainingIntent: "general_maintenance",
      structureHash: activityPlanStructureHash(structure),
      semanticHash: activityPlanSemanticHash({
        structure,
        adaptation: null,
        trainingIntent: "general_maintenance",
      }),
      gpsRecordingEnabled: true,
      updatedAt: "2026-08-01T08:00:00.000Z",
    })),
    activityPlanExistsForProfile: vi.fn(async () => true),
    groupEventExistsForProfile: vi.fn(async () => true),
    createOwned,
  } as unknown as PlannedSessionRepositoryPort;
  return { createOwned, repository };
}

describe("createDirectPlannedSession", () => {
  it("rejects policy-invalid historical plans before creating a new frozen prescription", async () => {
    const { createOwned, repository } = repositoryWithPlan();
    const plan = await repository.getActivityPlanPrescriptionSource({ profileId, activityPlanId });
    if (!plan) throw new Error("Missing fixture plan");
    const historical = structuredClone(structure);
    const segment = historical.segments[0];
    if (segment?.role !== "activity" || !segment.intervals[0]?.steps[0])
      throw new Error("Missing step");
    delete segment.intervals[0].steps[0].purpose;
    vi.mocked(repository.getActivityPlanPrescriptionSource).mockResolvedValueOnce({
      ...plan,
      structure: historical,
      structureHash: activityPlanStructureHash(historical),
      semanticHash: activityPlanSemanticHash({
        structure: historical,
        adaptation: null,
        trainingIntent: "general_maintenance",
      }),
    });
    await expect(
      createDirectPlannedSession({
        db: {} as never,
        repository,
        profileId,
        sessionId: "66666666-6666-4666-8666-666666666666",
        planningDate: "2026-08-20",
        source: { kind: "direct", operationId: "a".repeat(32) },
        activityPlanId,
        groupEventId: null,
        capturedAt: new Date("2026-08-17T12:34:56.000Z"),
      }),
    ).rejects.toBeInstanceOf(ZodError);
    expect(createOwned).not.toHaveBeenCalled();
  });
  it("captures a resolution manifest and time from server-owned sources", async () => {
    const { createOwned, repository } = repositoryWithPlan();
    const capturedAt = new Date("2026-08-17T12:34:56.000Z");

    await createDirectPlannedSession({
      db: {} as never,
      repository,
      profileId,
      sessionId: "66666666-6666-4666-8666-666666666666",
      planningDate: "2026-08-20",
      source: { kind: "direct", operationId: "a".repeat(32) },
      activityPlanId,
      groupEventId: null,
      capturedAt,
    });

    const created = createOwned.mock.calls[0]?.[0].session;
    expect(created?.prescription).toMatchObject({
      resolutionManifest: {
        activity_plan_id: activityPlanId,
        activity_plan_revision: 9,
        fallback_level: "system_default_no_context",
        resolved_structure: structure,
      },
      capturedAt: capturedAt.toISOString(),
    });
    expect(created?.prescription.resolutionManifest.adaptation_values).toEqual({});
  });

  it("does not reveal or create a session from an unavailable plan", async () => {
    const { createOwned, repository } = repositoryWithPlan();
    vi.mocked(repository.getActivityPlanPrescriptionSource).mockResolvedValueOnce(null);

    await expect(
      createDirectPlannedSession({
        db: {} as never,
        repository,
        profileId,
        sessionId: "66666666-6666-4666-8666-666666666666",
        planningDate: "2026-08-20",
        source: { kind: "direct", operationId: "a".repeat(32) },
        activityPlanId,
        groupEventId: null,
        capturedAt: new Date("2026-08-17T12:34:56.000Z"),
      }),
    ).rejects.toBeInstanceOf(PlannedSessionAccessError);
    expect(createOwned).not.toHaveBeenCalled();
  });

  it("raises a typed integrity failure before writing an inconsistent catalog plan", async () => {
    const { createOwned, repository } = repositoryWithPlan();
    const plan = await repository.getActivityPlanPrescriptionSource({ profileId, activityPlanId });
    if (!plan) throw new Error("Test fixture plan is unavailable");
    vi.mocked(repository.getActivityPlanPrescriptionSource).mockResolvedValueOnce({
      ...plan,
      structureHash: `v1:sha256:${"0".repeat(64)}`,
    });

    await expect(
      createDirectPlannedSession({
        db: {} as never,
        repository,
        profileId,
        sessionId: "66666666-6666-4666-8666-666666666666",
        planningDate: "2026-08-20",
        source: { kind: "direct", operationId: "a".repeat(32) },
        activityPlanId,
        groupEventId: null,
        capturedAt: new Date("2026-08-17T12:34:56.000Z"),
      }),
    ).rejects.toBeInstanceOf(ActivityPlanIntegrityError);
    expect(createOwned).not.toHaveBeenCalled();
  });

  it("denies a group event rejected by the shared active-membership access check", async () => {
    const { createOwned, repository } = repositoryWithPlan();
    vi.mocked(repository.groupEventExistsForProfile).mockResolvedValueOnce(false);

    await expect(
      createDirectPlannedSession({
        db: {} as never,
        repository,
        profileId,
        sessionId: "66666666-6666-4666-8666-666666666666",
        planningDate: "2026-08-20",
        source: { kind: "direct", operationId: "a".repeat(32) },
        activityPlanId,
        groupEventId,
        capturedAt: new Date("2026-08-17T12:34:56.000Z"),
      }),
    ).rejects.toBeInstanceOf(PlannedSessionAccessError);
    expect(repository.groupEventExistsForProfile).toHaveBeenCalledWith({
      profileId,
      groupEventId,
    });
    expect(createOwned).not.toHaveBeenCalled();
  });

  it("denies access lost after the initial group-event check but before the atomic write", async () => {
    const { createOwned, repository } = repositoryWithPlan();
    createOwned.mockResolvedValueOnce({
      status: "access_denied",
      reason: "group_event_unavailable",
    });

    await expect(
      createDirectPlannedSession({
        db: {} as never,
        repository,
        profileId,
        sessionId: "66666666-6666-4666-8666-666666666666",
        planningDate: "2026-08-20",
        source: { kind: "direct", operationId: "a".repeat(32) },
        activityPlanId,
        groupEventId,
        capturedAt: new Date("2026-08-17T12:34:56.000Z"),
      }),
    ).rejects.toBeInstanceOf(PlannedSessionAccessError);
    expect(repository.groupEventExistsForProfile).toHaveBeenCalledWith({
      profileId,
      groupEventId,
    });
    expect(createOwned).toHaveBeenCalledOnce();
  });

  it("allows an accessible active-member group event and persists its association", async () => {
    const { createOwned, repository } = repositoryWithPlan();

    await expect(
      createDirectPlannedSession({
        db: {} as never,
        repository,
        profileId,
        sessionId: "66666666-6666-4666-8666-666666666666",
        planningDate: "2026-08-20",
        source: { kind: "direct", operationId: "a".repeat(32) },
        activityPlanId,
        groupEventId,
        capturedAt: new Date("2026-08-17T12:34:56.000Z"),
      }),
    ).resolves.toMatchObject({ status: "created", session: { groupEventId } });
    expect(createOwned).toHaveBeenCalledWith({
      profileId,
      session: expect.objectContaining({ groupEventId }),
    });
  });
});
