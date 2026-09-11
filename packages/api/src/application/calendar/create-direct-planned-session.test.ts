import { activityPlanDocumentSchema, activityPlanStructureSchema } from "@repo/core/activity-plan";
import { describe, expect, it, vi } from "vitest";
import type { PlannedSessionRepositoryPort } from "../../repositories/planned-session-repository-port";
import { createDirectPlannedSession } from "./create-direct-planned-session";
import { PlannedSessionAccessError } from "./planned-session-errors";

const profileId = "11111111-1111-4111-8111-111111111111";
const activityPlanId = "22222222-2222-4222-8222-222222222222";
const buildVariantId = "88888888-8888-4888-8888-888888888888";
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
              duration: { type: "time", seconds: 1_800 },
              targets: [{ type: "RPE", intensity: 5 }],
            },
          ],
        },
      ],
    },
  ],
});
const buildDocument = () => {
  const buildStructure = structuredClone(structure);
  const segment = buildStructure.segments[0];
  if (!segment || segment.role !== "activity") throw new Error("Expected activity segment");
  const step = segment.intervals[0]?.steps[0];
  if (!step || step.duration.type !== "time") throw new Error("Expected timed step");
  step.duration.seconds = 2_400;
  return activityPlanDocumentSchema.parse({
    contractVersion: 1,
    defaultVariantId: activityPlanId,
    variants: [
      { id: activityPlanId, name: "Base", structure },
      { id: buildVariantId, name: "Build", structure: buildStructure },
    ],
  });
};

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
      structure: buildDocument(),
      structureHash: `v1:sha256:${"a".repeat(64)}`,
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
  it("captures revision, structure, quantification, and time from server-owned sources", async () => {
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
      activityPlanId,
      activityPlanRevision: 9,
      variantId: activityPlanId,
      variantName: "Base",
      structure,
      capturedAt: capturedAt.toISOString(),
    });
    expect(created?.prescription.prescriptionQuantification).toBeTruthy();
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

  it("resolves an explicit variant once and snapshots its identity, name, and concrete V3", async () => {
    const { createOwned, repository } = repositoryWithPlan();

    await createDirectPlannedSession({
      db: {} as never,
      repository,
      profileId,
      sessionId: "66666666-6666-4666-8666-666666666666",
      planningDate: "2026-08-20",
      source: { kind: "direct", operationId: "b".repeat(32) },
      activityPlanId,
      variantId: buildVariantId,
      groupEventId: null,
      capturedAt: new Date("2026-08-17T12:34:56.000Z"),
    });

    const prescription = createOwned.mock.calls[0]?.[0].session.prescription;
    expect(prescription).toMatchObject({
      variantId: buildVariantId,
      variantName: "Build",
      structure: { version: 3 },
    });
    expect(prescription?.structure).not.toHaveProperty("variants");
  });

  it("fails an unknown explicit variant without falling back to Base", async () => {
    const { createOwned, repository } = repositoryWithPlan();

    await expect(
      createDirectPlannedSession({
        db: {} as never,
        repository,
        profileId,
        sessionId: "66666666-6666-4666-8666-666666666666",
        planningDate: "2026-08-20",
        source: { kind: "direct", operationId: "c".repeat(32) },
        activityPlanId,
        variantId: "99999999-9999-4999-8999-999999999999",
        groupEventId: null,
        capturedAt: new Date("2026-08-17T12:34:56.000Z"),
      }),
    ).rejects.toMatchObject({ code: "ACTIVITY_PLAN_UNKNOWN_EXPLICIT_VARIANT" });
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
