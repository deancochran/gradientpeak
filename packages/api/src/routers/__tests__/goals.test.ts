import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";
import { goalsRouter } from "../goals";

type GoalRow = {
  id: string;
  profile_id: string;
  milestone_event_id: string;
  title: string;
  priority: number;
  activity_category: "run" | "bike" | "swim" | "strength";
  target_payload:
    | {
        type: "event_performance";
        activity_category: "run" | "bike" | "swim" | "strength";
        distance_m: number;
        target_time_s: number;
      }
    | {
        type: "threshold";
        metric: "pace" | "power" | "heart_rate";
        activity_category: "run" | "bike" | "swim" | "strength";
        value: number;
        test_duration_s: number;
      };
};

type QueryMap = {
  profileGoalsSelect?: GoalRow[] | GoalRow[][];
  profileGoalsInsert?: GoalRow[];
  profileGoalsUpdate?: GoalRow[];
  profileAccess?: Array<{ has_access: boolean }>;
};

type CallLogEntry =
  | {
      operation: "insert";
      payload: Record<string, unknown>;
    }
  | {
      operation: "update";
      payload: Record<string, unknown>;
    }
  | {
      operation: "delete";
    };

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const COACH_ID = "22222222-2222-4222-8222-222222222222";
const GOAL_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EVENT_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

function createGoalRow(overrides: Partial<GoalRow> = {}): GoalRow {
  return {
    id: GOAL_ID,
    profile_id: OWNER_ID,
    milestone_event_id: EVENT_ID,
    title: "10K Goal",
    priority: 7,
    activity_category: "run",
    target_payload: {
      type: "event_performance",
      activity_category: "run",
      distance_m: 10000,
      target_time_s: 3000,
    },
    ...overrides,
  };
}

function createDbMock(queryMap: QueryMap = {}) {
  const selectCounters = new Map<string, number>();
  const callLog: CallLogEntry[] = [];

  const nextSelectResult = (): GoalRow[] => {
    const entry = queryMap.profileGoalsSelect;

    if (!entry) {
      return [];
    }

    if (!Array.isArray(entry[0])) {
      return entry as GoalRow[];
    }

    const index = selectCounters.get("profileGoalsSelect") ?? 0;
    selectCounters.set("profileGoalsSelect", index + 1);
    return (entry as GoalRow[][])[index] ?? (entry as GoalRow[][]).at(-1) ?? [];
  };

  const createSelectBuilder = () => {
    const builder: any = {
      from: () => builder,
      where: () => builder,
      orderBy: () => builder,
      limit: () => builder,
      offset: () => builder,
      then: (
        onFulfilled: (value: GoalRow[]) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) => Promise.resolve(nextSelectResult()).then(onFulfilled, onRejected),
    };

    return builder;
  };

  return {
    db: {
      execute: async () => ({
        rows: queryMap.profileAccess ?? [{ has_access: false }],
      }),
      select: () => createSelectBuilder(),
      insert: () => ({
        values: (payload: Record<string, unknown>) => {
          callLog.push({ operation: "insert", payload });
          return {
            returning: async () => queryMap.profileGoalsInsert ?? [],
          };
        },
      }),
      update: () => ({
        set: (payload: Record<string, unknown>) => {
          callLog.push({ operation: "update", payload });
          return {
            where: () => ({
              returning: async () => queryMap.profileGoalsUpdate ?? [],
            }),
          };
        },
      }),
      delete: () => ({
        where: async () => {
          callLog.push({ operation: "delete" });
          return [];
        },
      }),
    },
    callLog,
  };
}

function createCaller(params?: { userId?: string; queryMap?: QueryMap }) {
  const { userId = OWNER_ID, queryMap } = params ?? {};
  const { db, callLog } = createDbMock(queryMap);

  const caller = goalsRouter.createCaller({
    db: db as any,
    session: { user: { id: userId } },
    headers: new Headers(),
    clientType: "test",
    trpcSource: "vitest",
  } as any);

  return { caller, callLog };
}

describe("goalsRouter", () => {
  it("lists goals for the profile owner", async () => {
    const goal = createGoalRow();
    const { caller } = createCaller({
      queryMap: {
        profileGoalsSelect: [goal],
      },
    });

    const result = await caller.list({
      profile_id: OWNER_ID,
      limit: 20,
      offset: 0,
    });

    expect(result).toEqual([goal]);
  });

  it("allows an authorized coach to fetch a goal by id", async () => {
    const goal = createGoalRow();
    const { caller } = createCaller({
      userId: COACH_ID,
      queryMap: {
        profileGoalsSelect: [[goal]],
        profileAccess: [{ has_access: true }],
      },
    });

    const result = await caller.getById({ id: GOAL_ID });

    expect(result).toEqual(goal);
  });

  it("creates a goal and returns cache tags", async () => {
    const createdGoal = createGoalRow({ title: "Canonical Goal", priority: 6 });
    const { caller, callLog } = createCaller({
      queryMap: {
        profileGoalsInsert: [createdGoal],
      },
    });

    const result = await caller.create({
      profile_id: OWNER_ID,
      milestone_event_id: EVENT_ID,
      title: "Canonical Goal",
      priority: 6,
      activity_category: "run",
      target_payload: {
        type: "event_performance",
        activity_category: "run",
        distance_m: 5000,
        target_time_s: 1500,
      },
    });

    expect(result).toMatchObject({
      ...createdGoal,
      cache_tags: ["goals.list", "goals.getById", "profileSettings.getForProfile"],
    });
    expect(callLog).toContainEqual({
      operation: "insert",
      payload: expect.objectContaining({
        id: expect.any(String),
        profile_id: OWNER_ID,
        milestone_event_id: EVENT_ID,
        title: "Canonical Goal",
        priority: 6,
        activity_category: "run",
        target_payload: {
          type: "event_performance",
          activity_category: "run",
          distance_m: 5000,
          target_time_s: 1500,
        },
        created_at: expect.any(Date),
        updated_at: expect.any(Date),
      }),
    });
  });

  it("updates a goal by merging partial input with the stored record", async () => {
    const existingGoal = createGoalRow({ title: "Original Goal", priority: 5 });
    const updatedGoal = createGoalRow({
      title: "Updated Goal",
      priority: 5,
      target_payload: {
        type: "event_performance",
        activity_category: "run",
        distance_m: 10000,
        target_time_s: 3150,
      },
    });
    const { caller, callLog } = createCaller({
      queryMap: {
        profileGoalsSelect: [[existingGoal]],
        profileGoalsUpdate: [updatedGoal],
      },
    });

    const result = await caller.update({
      id: GOAL_ID,
      data: {
        title: "Updated Goal",
        target_payload: {
          type: "event_performance",
          activity_category: "run",
          distance_m: 10000,
          target_time_s: 3150,
        },
      },
    });

    expect(result).toMatchObject({
      ...updatedGoal,
      cache_tags: ["goals.list", "goals.getById", "profileSettings.getForProfile"],
    });
    expect(callLog).toContainEqual({
      operation: "update",
      payload: expect.objectContaining({
        milestone_event_id: EVENT_ID,
        title: "Updated Goal",
        priority: 5,
        activity_category: "run",
        target_payload: {
          type: "event_performance",
          activity_category: "run",
          distance_m: 10000,
          target_time_s: 3150,
        },
        updated_at: expect.any(Date),
      }),
    });
  });

  it("deletes an existing goal and returns a success payload", async () => {
    const { caller, callLog } = createCaller({
      queryMap: {
        profileGoalsSelect: [[createGoalRow()]],
      },
    });

    const result = await caller.delete({ id: GOAL_ID });

    expect(result).toEqual({
      success: true,
      cache_tags: ["goals.list", "goals.getById", "profileSettings.getForProfile"],
    });
    expect(callLog).toContainEqual({ operation: "delete" });
  });

  it("rejects unauthorized profile goal reads", async () => {
    const { caller } = createCaller({
      userId: COACH_ID,
      queryMap: {
        profileAccess: [{ has_access: false }],
      },
    });

    await expect(
      caller.list({
        profile_id: OWNER_ID,
        limit: 20,
        offset: 0,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" } as Partial<TRPCError>);
  });
});
