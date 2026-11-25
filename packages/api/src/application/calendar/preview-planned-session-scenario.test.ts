import { ATHLETE_STATE_PROJECTION_ALGORITHM_VERSION } from "@repo/core";
import { activityPlanSemanticHash, activityPlanStructureSchema } from "@repo/core/activity-plan";
import {
  type PlannedSession,
  plannedSessionIdempotencyKey,
  plannedSessionSchema,
} from "@repo/core/calendar";
import { createAthletePlanningContextFromSnapshot } from "@repo/core/plan";
import { buildPerformanceTargetFactsFixture } from "@repo/core/testing/performance-model";
import type { DrizzleDbClient } from "@repo/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { createDrizzlePlannedSessionRepository } from "../../infrastructure/repositories";
import type {
  ActivityPlanPrescriptionSource,
  PlannedSessionRepositoryPort,
} from "../../repositories/planned-session-repository-port";
import { createResolutionManifestFixture } from "../../test/builders/planned-session";
import { activityPlanStructureHash } from "../activity-plans/structure-hash";
import { previewPlannedSessionScenario } from "./preview-planned-session-scenario";

const mocks = vi.hoisted(() => ({
  fencedSnapshot: vi.fn(),
  readModel: vi.fn(),
  planningBaseline: vi.fn(),
}));

vi.mock("../../db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../db")>()),
  withProfileFencedRepeatableReadSnapshot: mocks.fencedSnapshot,
}));
vi.mock("../athlete-intelligence/athlete-read-model", () => ({
  readAthleteReadModel: mocks.readModel,
}));
vi.mock("../athlete-intelligence/load-planning-baseline", () => ({
  loadPlanningBaseline: mocks.planningBaseline,
}));

const PROFILE_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_PROFILE_ID = "22222222-2222-4222-8222-222222222222";
const SELECTED_SESSION_ID = "33333333-3333-4333-8333-333333333333";
const BEFORE_SESSION_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const MIDDLE_SESSION_ID = "44444444-4444-4444-8444-444444444444";
const FUTURE_SESSION_ID = "55555555-5555-4555-8555-555555555555";
const RUN_PLAN_ID = "66666666-6666-4666-8666-666666666666";
const BIKE_PLAN_ID = "77777777-7777-4777-8777-777777777777";
const SECOND_RUN_PLAN_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const runStructure = activityPlanStructureSchema.parse({
  version: 5,
  activity_category: "run",
  items: [
    {
      type: "step",
      id: "88888888-8888-4888-8888-888888888888",
      name: "Easy",
      duration: { type: "time", seconds: 600 },
      targets: [{ type: "%MaxHR", intensity: 70 }],
    },
    {
      type: "step",
      id: "99999999-9999-4999-8999-999999999999",
      name: "Steady",
      duration: { type: "time", seconds: 1200 },
      targets: [{ type: "%MaxHR", intensity: 85 }],
    },
  ],
});
const bikeStructure = activityPlanStructureSchema.parse({
  version: 5,
  activity_category: "bike",
  items: [
    {
      type: "step",
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "Endurance",
      duration: { type: "time", seconds: 2400 },
      targets: [{ type: "%MaxHR", intensity: 75 }],
    },
  ],
});

function plan(
  id: string,
  structure: typeof runStructure,
  revision = 7,
): ActivityPlanPrescriptionSource {
  return {
    id,
    profileId: id === BIKE_PLAN_ID ? null : PROFILE_ID,
    name: id === BIKE_PLAN_ID ? "Bike endurance" : "Run steady",
    description: null,
    revision,
    structure,
    trainingIntent: "general_maintenance",
    structureHash: activityPlanStructureHash(structure),
    semanticHash: activityPlanSemanticHash({
      structure,
      trainingIntent: "general_maintenance",
    }),
    gpsRecordingEnabled: true,
    updatedAt: "2026-08-01T00:00:00.000Z",
  };
}

const runPlan = plan(RUN_PLAN_ID, runStructure);
const bikePlan = plan(BIKE_PLAN_ID, bikeStructure);
const secondRunPlan = plan(SECOND_RUN_PLAN_ID, runStructure);
const nonTimedRunPlan = plan(
  RUN_PLAN_ID,
  activityPlanStructureSchema.parse({
    ...runStructure,
    items: [
      {
        ...runStructure.items[0],
        duration: { type: "distance", meters: 1000 },
      },
    ],
  }),
);

function session(input: {
  id: string;
  planningDate: string;
  activityPlanId: string;
  sessionRevision?: number;
}): PlannedSession {
  const source = { kind: "direct" as const, operationId: "a".repeat(32) };
  return plannedSessionSchema.parse({
    contractVersion: "planned-session-v1",
    id: input.id,
    profileId: PROFILE_ID,
    sessionRevision: input.sessionRevision ?? 3,
    planningDate: input.planningDate,
    originalTargetDate: input.planningDate,
    source,
    idempotencyKey: plannedSessionIdempotencyKey(source),
    groupEventId: null,
    activityPlanId: input.activityPlanId,
    // Deliberately different legacy provenance: preview must use the current plan reference.
    prescription: {
      resolutionManifest: createResolutionManifestFixture({
        activityPlanId: BIKE_PLAN_ID,
        activityPlanRevision: 1,
        structure: bikeStructure,
        demand: {
          activity_category: "bike",
          training_intent: "general_maintenance",
          target_duration_minutes: null,
          target_common_load: null,
          importance: "normal",
        },
      }),
      capturedAt: "2026-01-01T00:00:00.000Z",
    },
    lifecycle: { status: "scheduled" },
  });
}

function scenarioSessions() {
  return [
    session({
      id: SELECTED_SESSION_ID,
      planningDate: "2026-08-10",
      activityPlanId: RUN_PLAN_ID,
    }),
    session({ id: BEFORE_SESSION_ID, planningDate: "2026-08-05", activityPlanId: RUN_PLAN_ID }),
    session({
      id: MIDDLE_SESSION_ID,
      planningDate: "2026-08-12",
      activityPlanId: SECOND_RUN_PLAN_ID,
    }),
    session({ id: FUTURE_SESSION_ID, planningDate: "2026-08-15", activityPlanId: RUN_PLAN_ID }),
  ];
}

function repository(
  sessions = scenarioSessions(),
  plans: ActivityPlanPrescriptionSource[] = [runPlan, bikePlan, secondRunPlan],
) {
  const sources = new Map(plans.map((source) => [source.id, source]));
  return {
    getOwned: vi.fn(async ({ profileId, sessionId }) =>
      profileId === PROFILE_ID ? (sessions.find((item) => item.id === sessionId) ?? null) : null,
    ),
    listOwnedRange: vi.fn(async () => ({ items: sessions, truncated: false })),
    mutateOwned: vi.fn(),
    getActivityPlanPrescriptionSource: vi.fn(async ({ profileId, activityPlanId }) =>
      profileId === PROFILE_ID ? (sources.get(activityPlanId) ?? null) : null,
    ),
  } as unknown as PlannedSessionRepositoryPort;
}

function candidateRow(source: ActivityPlanPrescriptionSource) {
  return {
    id: source.id,
    revision: source.revision,
    structure: source.structure,
    structure_hash: source.structureHash,
    semantic_hash: source.semanticHash,
    training_intent: source.trainingIntent,
  };
}

function dbWithCandidates(rows = [candidateRow(runPlan), candidateRow(secondRunPlan)]) {
  const limit = vi.fn(async () => rows);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  return { select, from, where, limit } as unknown as DrizzleDbClient & { select: typeof select };
}

const now = new Date("2026-08-01T12:00:00.000Z");
const baselineState = {
  contractVersion: ATHLETE_STATE_PROJECTION_ALGORITHM_VERSION,
  athleteId: PROFILE_ID,
  stateRevision: 9,
  asOf: now.toISOString(),
  longTermLoad: 40,
  recentLoad: 30,
  loadBalance: 10,
  evidenceConfidence: 0.8,
  capabilities: [],
  athleteAgeYears: null,
};
const performanceTargets = buildPerformanceTargetFactsFixture({
  asOf: now.toISOString(),
  athleteId: PROFILE_ID,
  lthrBpm: { run: 175, bike: 165 },
  maxHrBpm: { run: 195, bike: 185 },
});
for (const category of ["run", "bike"] as const) {
  performanceTargets.heartRate[category].lthr.freshness = "fresh";
  performanceTargets.heartRate[category].maxHr.freshness = "fresh";
}
const planningContext = createAthletePlanningContextFromSnapshot({
  asOf: now.toISOString(),
  profileMetrics: [],
  activityEfforts: [],
  performanceTargets,
});

function request(
  scenario:
    | { kind: "as_planned" }
    | { kind: "less"; targetDurationSeconds: number }
    | { kind: "more"; targetDurationSeconds: number }
    | { kind: "skip" }
    | { kind: "substitute"; activityPlanId: string },
) {
  return {
    sessionId: SELECTED_SESSION_ID,
    expectedSessionRevision: 3,
    expectedPlanRevision: 7,
    expectedStateRevision: 9,
    scenario,
  };
}

async function preview(input: {
  values: ReturnType<typeof request>;
  repository?: PlannedSessionRepositoryPort;
  db?: ReturnType<typeof dbWithCandidates>;
  profileId?: string;
  createRepository?: typeof createDrizzlePlannedSessionRepository;
}) {
  const currentRepository = input.repository ?? repository();
  const db = input.db ?? dbWithCandidates();
  return previewPlannedSessionScenario({
    db,
    profileId: input.profileId ?? PROFILE_ID,
    values: input.values,
    now,
    createRepository: input.createRepository ?? (() => currentRepository),
  });
}

beforeEach(() => {
  mocks.fencedSnapshot.mockReset();
  mocks.fencedSnapshot.mockImplementation(async (db, _profileId, read) => read({ ...db }));
  mocks.readModel.mockReset();
  mocks.readModel.mockResolvedValue({
    publishedRevision: 9,
    status: { freshness: "fresh" },
    currentBaseline: { baseline: baselineState, planningTimezone: "UTC" },
  });
  mocks.planningBaseline.mockReset();
  mocks.planningBaseline.mockResolvedValue({
    status: "available",
    revision: 9,
    context: planningContext,
  });
});

describe("previewPlannedSessionScenario application boundary", () => {
  it("uses canonical resolution and simulation for every scenario without mutating the schedule", async () => {
    const currentRepository = repository();
    const db = dbWithCandidates();
    const createRepository = vi.fn(() => currentRepository);
    const asPlanned = await preview({
      values: request({ kind: "as_planned" }),
      repository: currentRepository,
      db,
      createRepository,
    });
    const less = await preview({
      values: request({ kind: "less", targetDurationSeconds: 900 }),
      repository: currentRepository,
      db,
      createRepository,
    });
    const more = await preview({
      values: request({ kind: "more", targetDurationSeconds: 3600 }),
      repository: currentRepository,
      db,
      createRepository,
    });
    const skipped = await preview({
      values: request({ kind: "skip" }),
      repository: currentRepository,
      db,
      createRepository,
    });
    const substituted = await preview({
      values: request({ kind: "substitute", activityPlanId: BIKE_PLAN_ID }),
      repository: currentRepository,
      db: dbWithCandidates([
        candidateRow(runPlan),
        candidateRow(secondRunPlan),
        candidateRow(bikePlan),
      ]),
      createRepository,
    });

    for (const [name, result] of [
      ["as planned", asPlanned],
      ["less", less],
      ["more", more],
      ["skip", skipped],
      ["substitute", substituted],
    ] as const) {
      expect(result, name).toMatchObject({ status: "available" });
      if (result.status !== "available") continue;
      expect(result.baseline.transitions.some((transition) => transition.sourceId !== null)).toBe(
        true,
      );
      expect(result.provenance.historicalSnapshots).toBe("provenance_only");
    }
    if (
      asPlanned.status !== "available" ||
      less.status !== "available" ||
      more.status !== "available" ||
      skipped.status !== "available" ||
      substituted.status !== "available"
    )
      throw new Error("fixture must resolve every scenario");

    expect(asPlanned.baseline).toEqual(asPlanned.alternative);
    expect(asPlanned.provenance.selectedAlternative).toMatchObject({
      activityPlanId: RUN_PLAN_ID,
      structure: runStructure,
    });
    expect(
      less.provenance.selectedAlternative?.structure.items.flatMap((item) =>
        item.type === "step" ? [item.duration] : item.steps.map((step) => step.duration),
      ),
    ).toEqual([
      { type: "time", seconds: 300 },
      { type: "time", seconds: 600 },
    ]);
    expect(
      more.provenance.selectedAlternative?.structure.items.flatMap((item) =>
        item.type === "step" ? [item.duration] : item.steps.map((step) => step.duration),
      ),
    ).toEqual([
      { type: "time", seconds: 1200 },
      { type: "time", seconds: 2400 },
    ]);
    expect(less.alternative).not.toEqual(less.baseline);
    expect(more.alternative).not.toEqual(more.baseline);
    expect(skipped.horizon.sessionCount).toBe(4);
    expect(skipped.horizon).toEqual(asPlanned.horizon);
    expect(
      skipped.alternative.transitions
        .map((transition) => transition.sourceId)
        .filter((sourceId) => sourceId !== null),
    ).toEqual(
      asPlanned.baseline.transitions
        .map((transition) => transition.sourceId)
        .filter((sourceId) => sourceId !== "plan-day:2026-08-10" && sourceId !== null),
    );
    expect(skipped.alternative.transitions.map((transition) => transition.sourceId)).toContain(
      "plan-day:2026-08-05",
    );
    expect(substituted.provenance.selectedAlternative).toMatchObject({
      activityPlanId: BIKE_PLAN_ID,
      activityPlanRevision: 7,
      structure: { activity_category: "bike" },
      manifest: { activity_plan_id: BIKE_PLAN_ID },
    });
    expect(currentRepository.listOwnedRange).toHaveBeenCalledTimes(5);
    expect(currentRepository.mutateOwned).not.toHaveBeenCalled();
    expect(mocks.fencedSnapshot).toHaveBeenCalledWith(db, PROFILE_ID, expect.any(Function));
    const transactionDb = mocks.readModel.mock.calls[0]?.[0].db;
    expect(transactionDb).not.toBe(db);
    expect(mocks.planningBaseline).toHaveBeenCalledWith(
      expect.objectContaining({ db: transactionDb, profileId: PROFILE_ID }),
    );
    expect(createRepository).toHaveBeenCalledWith(transactionDb);
  });

  it("returns distinct stale states before candidate reads", async () => {
    const staleSessionRepository = repository(
      scenarioSessions().map((item) =>
        item.id === SELECTED_SESSION_ID ? { ...item, sessionRevision: 4 } : item,
      ),
    );
    await expect(
      preview({ values: request({ kind: "skip" }), repository: staleSessionRepository }),
    ).resolves.toMatchObject({
      status: "stale",
      reason: "session_revision",
      currentSessionRevision: 4,
    });

    const stalePlanRepository = repository();
    vi.mocked(stalePlanRepository.getActivityPlanPrescriptionSource).mockResolvedValueOnce({
      ...runPlan,
      revision: 8,
    });
    await expect(
      preview({ values: request({ kind: "skip" }), repository: stalePlanRepository }),
    ).resolves.toMatchObject({ status: "stale", reason: "plan_revision", currentPlanRevision: 8 });

    mocks.readModel.mockResolvedValueOnce({
      publishedRevision: 10,
      status: { freshness: "fresh" },
      currentBaseline: { baseline: baselineState, planningTimezone: "UTC" },
    });
    await expect(preview({ values: request({ kind: "skip" }) })).resolves.toMatchObject({
      status: "stale",
      reason: "state_revision",
      currentStateRevision: 10,
    });
  });

  it("returns a null current revision when publication is no longer available", async () => {
    mocks.readModel.mockResolvedValueOnce({
      publishedRevision: null,
      status: { freshness: "unavailable" },
      currentBaseline: null,
    });
    await expect(preview({ values: request({ kind: "skip" }) })).resolves.toEqual({
      status: "stale",
      reason: "state_revision",
      currentSessionRevision: null,
      currentPlanRevision: null,
      currentStateRevision: null,
    });
    expect(mocks.planningBaseline).not.toHaveBeenCalled();
  });

  it("rejects a selected session just beyond the bounded scenario horizon", async () => {
    const beyondHorizonRepository = repository(
      scenarioSessions().map((item) =>
        item.id === SELECTED_SESSION_ID ? { ...item, planningDate: "2027-08-02" } : item,
      ),
    );
    await expect(
      preview({ values: request({ kind: "as_planned" }), repository: beyondHorizonRepository }),
    ).resolves.toEqual({ status: "unavailable", reason: "horizon_exceeds_limit" });
    expect(beyondHorizonRepository.listOwnedRange).not.toHaveBeenCalled();
  });

  it("fails closed when current plans cannot produce a complete timed Common Load", async () => {
    await expect(
      preview({
        values: request({ kind: "less", targetDurationSeconds: 900 }),
        repository: repository(scenarioSessions(), [nonTimedRunPlan, bikePlan, secondRunPlan]),
        db: dbWithCandidates([candidateRow(nonTimedRunPlan), candidateRow(secondRunPlan)]),
      }),
    ).resolves.toEqual({ status: "unavailable", reason: "prescription_unavailable" });

    mocks.planningBaseline.mockResolvedValueOnce({
      status: "no_context",
      as_of: now.toISOString(),
    });
    await expect(preview({ values: request({ kind: "as_planned" }) })).resolves.toEqual({
      status: "unavailable",
      reason: "prescription_unavailable",
    });
  });

  it("owner-scopes the selected lookup and never reads candidates for another athlete", async () => {
    const currentRepository = repository();
    const db = dbWithCandidates();
    await expect(
      preview({
        values: request({ kind: "skip" }),
        repository: currentRepository,
        db,
        profileId: OTHER_PROFILE_ID,
      }),
    ).resolves.toEqual({ status: "unavailable", reason: "session_not_found" });
    expect(currentRepository.getOwned).toHaveBeenCalledWith({
      profileId: OTHER_PROFILE_ID,
      sessionId: SELECTED_SESSION_ID,
    });
    expect(db.select).not.toHaveBeenCalled();
    expect(mocks.readModel).not.toHaveBeenCalled();
  });
});
