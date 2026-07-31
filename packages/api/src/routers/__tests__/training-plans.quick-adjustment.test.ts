import { describe, expect, it } from "vitest";
import { activityPlanStructureHash } from "../../application/activity-plans/structure-hash";
import { createQueryMapDbMock, type QueryMap } from "../../test/mock-query-db";
import { trainingPlansRouter } from "../planning/training-plans";

const PROFILE_ID = "11111111-1111-4111-8111-111111111111";
const TRAINING_PLAN_ID = "22222222-2222-4222-8222-222222222222";
const EXPECTED_STRUCTURE_HASH = `v1:sha256:${"a".repeat(64)}`;

function activitySegment(id: string, activity_category: "bike" | "run") {
  return {
    id: `${id}-0000-4000-8000-000000000001`,
    name: activity_category,
    role: "activity" as const,
    activity_category,
    intervals: [
      {
        id: `${id}-0000-4000-8000-000000000002`,
        name: "Main",
        repetitions: 1,
        steps: [
          {
            id: `${id}-0000-4000-8000-000000000003`,
            name: "Step",
            duration: { type: "time" as const, seconds: 60 },
            targets: [{ type: "RPE" as const, intensity: 5 }],
          },
        ],
      },
    ],
  };
}

function adjustedStructure(activityPlanId: string) {
  return {
    id: TRAINING_PLAN_ID,
    version: 1 as const,
    sessions: [
      { offset_days: 0, activity_plan_id: activityPlanId },
      { offset_days: 2, activity_plan_id: activityPlanId },
    ],
  };
}

function createCaller(queryMap: QueryMap) {
  const { db, callLog } = createQueryMapDbMock(queryMap);
  const caller = trainingPlansRouter.createCaller({
    db: db as never,
    session: { user: { id: PROFILE_ID } },
    headers: new Headers(),
    clientType: "test",
    trpcSource: "vitest",
  } as never);

  return { caller, callLog };
}

function ownedPlan() {
  return {
    id: TRAINING_PLAN_ID,
    profile_id: PROFILE_ID,
    structure_hash: EXPECTED_STRUCTURE_HASH,
    structure: adjustedStructure("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
  };
}

function hasStructureUpdate(
  callLog: Array<{ operation: string; payload?: unknown; table: string }>,
) {
  return callLog.some(
    (call) =>
      call.table === "training_plans" &&
      call.operation === "execute" &&
      typeof call.payload === "string" &&
      call.payload.includes("update training_plans"),
  );
}

describe("trainingPlansRouter.applyQuickAdjustment executable linked plans", () => {
  it("rejects a strict valid mixed-category linked ActivityPlan without persisting the adjusted structure", async () => {
    const activityPlanId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const mixedCategoryStructure = {
      version: 3 as const,
      segments: [activitySegment("00000001", "run"), activitySegment("00000002", "bike")],
    };
    const { caller, callLog } = createCaller({
      training_plans: { data: ownedPlan(), error: null },
      activity_plans: {
        data: [
          {
            id: activityPlanId,
            is_system_template: false,
            gps_recording_enabled: true,
            structure: mixedCategoryStructure,
            structure_hash: activityPlanStructureHash(mixedCategoryStructure),
          },
        ],
        error: null,
      },
    });

    await expect(
      caller.applyQuickAdjustment({
        id: TRAINING_PLAN_ID,
        expectedStructureHash: EXPECTED_STRUCTURE_HASH,
        adjustedStructure: adjustedStructure(activityPlanId),
      }),
    ).rejects.toThrow(activityPlanId);

    expect(hasStructureUpdate(callLog)).toBe(false);
  });

  it("fails closed for a strict-invalid linked ActivityPlan without persisting the adjusted structure", async () => {
    const activityPlanId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const invalidStructure = { version: 3, segments: [{ role: "activity" }] };
    const { caller, callLog } = createCaller({
      training_plans: { data: ownedPlan(), error: null },
      activity_plans: {
        data: [
          {
            id: activityPlanId,
            is_system_template: false,
            gps_recording_enabled: true,
            structure: invalidStructure,
            structure_hash: activityPlanStructureHash(invalidStructure),
          },
        ],
        error: null,
      },
    });

    await expect(
      caller.applyQuickAdjustment({
        id: TRAINING_PLAN_ID,
        expectedStructureHash: EXPECTED_STRUCTURE_HASH,
        adjustedStructure: adjustedStructure(activityPlanId),
      }),
    ).rejects.toThrow(`changed activity plans: ${activityPlanId}`);

    expect(hasStructureUpdate(callLog)).toBe(false);
  });

  it("accepts a repeated same-category linked ActivityPlan and persists the adjusted structure", async () => {
    const activityPlanId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const repeatedRunStructure = {
      version: 3 as const,
      segments: [activitySegment("00000003", "run"), activitySegment("00000004", "run")],
    };
    const updatedStructure = adjustedStructure(activityPlanId);
    const { caller, callLog } = createCaller({
      training_plans: [
        { data: ownedPlan(), error: null },
        { data: { ...ownedPlan(), structure: updatedStructure }, error: null },
      ],
      activity_plans: {
        data: [
          {
            id: activityPlanId,
            is_system_template: false,
            gps_recording_enabled: true,
            structure: repeatedRunStructure,
            structure_hash: activityPlanStructureHash(repeatedRunStructure),
          },
        ],
        error: null,
      },
    });

    await expect(
      caller.applyQuickAdjustment({
        id: TRAINING_PLAN_ID,
        expectedStructureHash: EXPECTED_STRUCTURE_HASH,
        adjustedStructure: updatedStructure,
      }),
    ).resolves.toMatchObject({ id: TRAINING_PLAN_ID, structure: updatedStructure });

    expect(hasStructureUpdate(callLog)).toBe(true);
  });
});
