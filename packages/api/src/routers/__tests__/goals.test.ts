import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";
import { goalsRouter } from "../goals";

type GoalRow = {
  id: string;
  profile_id: string;
  milestone_event_id: string;
  target_date: string;
  title: string;
  priority: number;
  activity_category: "run" | "bike" | "swim" | "other";
  target_payload:
    | {
        type: "event_performance";
        activity_category: "run" | "bike" | "swim" | "other";
        distance_m: number;
        target_time_s: number;
      }
    | {
        type: "threshold";
        metric: "pace" | "power" | "hr";
        activity_category: "run" | "bike" | "swim" | "other";
        value: number;
        test_duration_s: number;
      };
};

type QueryMap = {
  profileGoalsSelect?: GoalRow[] | GoalRow[][];
  profileGoalsInsert?: GoalRow[];
  profileGoalsUpdate?: GoalRow[];
  milestoneEventsInsert?: Array<{ id: string }>;
  milestoneEventsSelect?: Array<{
    id: string;
    profile_id: string;
    training_plan_id: string | null;
  }>;
  profileAccess?: Array<{ has_access: boolean }>;
  trainingPlansSelect?: Array<{ id: string }>;
};

type CallLogEntry =
  | {
      operation: "insert";
      table: "profile_goals" | "events";
      payload: Record<string, unknown>;
    }
  | {
      operation: "update";
      table: "profile_goals" | "events";
      payload: Record<string, unknown>;
    }
  | {
      operation: "delete";
      table: "profile_goals" | "events";
    };

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const COACH_ID = "22222222-2222-4222-8222-222222222222";
const GOAL_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EVENT_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

function getTableName(table: any): "profile_goals" | "events" | "training_plans" {
  const name = String(table?.[Symbol.for("drizzle:Name")] ?? table?._?.name ?? "");
  if (name.includes("events")) return "events";
  if (name.includes("training_plans")) return "training_plans";
  return "profile_goals";
}

function createGoalRow(overrides: Partial<GoalRow> = {}): GoalRow {
  return {
    id: GOAL_ID,
    profile_id: OWNER_ID,
    milestone_event_id: EVENT_ID,
    target_date: "2026-06-01",
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
  let activeTable: "profile_goals" | "events" | "training_plans" = "profile_goals";

  const nextSelectResult = (): any[] => {
    if (activeTable === "training_plans") {
      return queryMap.trainingPlansSelect ?? [];
    }

    if (activeTable === "events") {
      return (
        queryMap.milestoneEventsSelect ?? [
          { id: EVENT_ID, profile_id: OWNER_ID, training_plan_id: null },
        ]
      );
    }

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
      from: (table: any) => {
        activeTable = getTableName(table);
        return builder;
      },
      where: () => builder,
      orderBy: () => builder,
      limit: () => builder,
      offset: () => builder,
      then: (onFulfilled: (value: any[]) => unknown, onRejected?: (reason: unknown) => unknown) =>
        Promise.resolve(nextSelectResult()).then(onFulfilled, onRejected),
    };

    return builder;
  };

  const db: any = {
    transaction: async (callback: (tx: any) => Promise<unknown>) => callback(db),
    execute: async () => ({
      rows: queryMap.profileAccess ?? [{ has_access: false }],
    }),
    select: () => createSelectBuilder(),
    insert: (table: any) => ({
      values: (payload: Record<string, unknown>) => {
        const tableName = getTableName(table);
        if (tableName === "training_plans") {
          throw new Error("unexpected training plan insert");
        }

        callLog.push({ operation: "insert", table: tableName, payload });
        return {
          returning: async () =>
            tableName === "events"
              ? (queryMap.milestoneEventsInsert ?? [{ id: EVENT_ID }])
              : (queryMap.profileGoalsInsert ?? []),
        };
      },
    }),
    update: (table: any) => ({
      set: (payload: Record<string, unknown>) => {
        const tableName = getTableName(table);
        if (tableName === "training_plans") {
          throw new Error("unexpected training plan update");
        }

        callLog.push({ operation: "update", table: tableName, payload });
        return {
          where: () => ({
            returning: async () =>
              tableName === "events" ? [] : (queryMap.profileGoalsUpdate ?? []),
          }),
        };
      },
    }),
    delete: (table: any) => ({
      where: async () => {
        const tableName = getTableName(table);
        if (tableName === "training_plans") {
          throw new Error("unexpected training plan delete");
        }

        callLog.push({ operation: "delete", table: tableName });
        return [];
      },
    }),
  };

  return { db, callLog };
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

  it("rejects list input with unexpected keys", async () => {
    const { caller } = createCaller();

    await expect(
      caller.list({
        profile_id: OWNER_ID,
        limit: 20,
        offset: 0,
        extra: true,
      } as any),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" } as Partial<TRPCError>);
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
    const createdGoal = createGoalRow({
      title: "Canonical Goal",
      priority: 6,
      target_date: "2026-06-10",
    });
    const { caller, callLog } = createCaller({
      queryMap: {
        profileGoalsInsert: [createdGoal],
      },
    });

    const result = await caller.create({
      profile_id: OWNER_ID,
      target_date: "2026-06-10",
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
      table: "events",
      payload: expect.objectContaining({
        profile_id: OWNER_ID,
        event_type: "race",
        title: "Canonical Goal",
        all_day: true,
      }),
    });
    expect(callLog).toContainEqual({
      operation: "insert",
      table: "profile_goals",
      payload: expect.objectContaining({
        id: expect.any(String),
        profile_id: OWNER_ID,
        milestone_event_id: EVENT_ID,
        target_date: "2026-06-10",
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
      target_date: "2026-07-01",
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
        milestoneEventsSelect: [{ id: EVENT_ID, profile_id: OWNER_ID, training_plan_id: null }],
      },
    });

    const result = await caller.update({
      id: GOAL_ID,
      data: {
        target_date: "2026-07-01",
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
      table: "events",
      payload: expect.objectContaining({
        event_type: "race",
        title: "Updated Goal",
        all_day: true,
      }),
    });
    expect(callLog).toContainEqual({
      operation: "update",
      table: "profile_goals",
      payload: expect.objectContaining({
        milestone_event_id: EVENT_ID,
        target_date: "2026-07-01",
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

  it("rejects update input with unexpected keys", async () => {
    const { caller } = createCaller();

    await expect(
      caller.update({
        id: GOAL_ID,
        data: {
          title: "Updated Goal",
          extra: true,
        },
      } as any),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" } as Partial<TRPCError>);
  });

  it("deletes an existing goal and returns a success payload", async () => {
    const { caller, callLog } = createCaller({
      queryMap: {
        profileGoalsSelect: [[createGoalRow()]],
        milestoneEventsSelect: [{ id: EVENT_ID, profile_id: OWNER_ID, training_plan_id: null }],
      },
    });

    const result = await caller.delete({ id: GOAL_ID });

    expect(result).toEqual({
      success: true,
      cache_tags: ["goals.list", "goals.getById", "profileSettings.getForProfile"],
    });
    expect(callLog).toContainEqual({ operation: "delete", table: "profile_goals" });
    expect(callLog).toContainEqual({ operation: "delete", table: "events" });
  });

  it("rejects delete input with unexpected keys", async () => {
    const { caller } = createCaller();

    await expect(
      caller.delete({
        id: GOAL_ID,
        extra: true,
      } as any),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" } as Partial<TRPCError>);
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
