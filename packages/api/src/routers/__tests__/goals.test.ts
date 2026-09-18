import type { TRPCError } from "@trpc/server";
import { describe, expect, it, vi } from "vitest";
import type { withAuthorizedAthleteReadAcrossOrganizations } from "../../application/organizations/authorize-athlete-read";
import { createGoalsRouter, goalsRouter } from "../goals";

type GoalRow = {
  id: string;
  profile_id: string;
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
  profileGoalsCount?: Array<{ total: number }>;
  profileGoalsInsertError?: Error & { code?: string };
  profileGoalsInsert?: GoalRow[];
  profileGoalsUpdate?: GoalRow[];
  profileAccess?: Array<{ has_access: boolean }>;
};

type CallLogEntry =
  | {
      operation: "insert";
      table: "profile_goals";
      payload: Record<string, unknown>;
    }
  | {
      operation: "update";
      table: "profile_goals";
      payload: Record<string, unknown>;
    }
  | {
      operation: "delete";
      table: "profile_goals";
    };

const OWNER_ID = "11111111-1111-4111-8111-111111111111";
const COACH_ID = "22222222-2222-4222-8222-222222222222";
const GOAL_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function getTableName(table: any): "profile_goals" | "training_plans" {
  const name = String(table?.[Symbol.for("drizzle:Name")] ?? table?._?.name ?? "");
  if (name.includes("training_plans")) return "training_plans";
  return "profile_goals";
}

function createGoalRow(overrides: Partial<GoalRow> = {}): GoalRow {
  return {
    id: GOAL_ID,
    profile_id: OWNER_ID,
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
  let _activeTable: "profile_goals" | "training_plans" = "profile_goals";

  const nextSelectResult = (isCountSelect = false): any[] => {
    if (isCountSelect) {
      return (
        queryMap.profileGoalsCount ?? [
          { total: Array.isArray(queryMap.profileGoalsSelect) ? 1 : 0 },
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

  const createSelectBuilder = (isCountSelect = false) => {
    let isProfileAccess = false;
    const builder: any = {
      from: (table: any) => {
        _activeTable = getTableName(table);
        isProfileAccess = String(
          table?.[Symbol.for("drizzle:Name")] ?? table?._?.name ?? "",
        ).includes("coaching_assignments");
        return builder;
      },
      innerJoin: () => builder,
      where: () => builder,
      orderBy: () => builder,
      limit: () => builder,
      offset: () => builder,
      for: () => builder,
      then: (onFulfilled: (value: any[]) => unknown, onRejected?: (reason: unknown) => unknown) =>
        Promise.resolve(
          isProfileAccess ? (queryMap.profileAccess ?? []) : nextSelectResult(isCountSelect),
        ).then(onFulfilled, onRejected),
    };

    return builder;
  };

  const db: any = {
    transaction: async (callback: (tx: any) => Promise<unknown>) => callback(db),
    execute: async () => ({
      rows: queryMap.profileAccess ?? [{ has_access: false }],
    }),
    select: (selection?: Record<string, unknown>) => createSelectBuilder(Boolean(selection?.total)),
    insert: (table: any) => ({
      values: (payload: Record<string, unknown>) => {
        const tableName = getTableName(table);
        if (tableName === "training_plans") {
          throw new Error("unexpected training plan insert");
        }

        callLog.push({ operation: "insert", table: tableName, payload });
        return {
          returning: async () => {
            if (queryMap.profileGoalsInsertError) throw queryMap.profileGoalsInsertError;
            return queryMap.profileGoalsInsert ?? [];
          },
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
            returning: async () => queryMap.profileGoalsUpdate ?? [],
          }),
        };
      },
    }),
    delete: (table: any) => ({
      where: () => {
        const tableName = getTableName(table);
        if (tableName === "training_plans") {
          throw new Error("unexpected training plan delete");
        }

        callLog.push({ operation: "delete", table: tableName });
        return { returning: async () => [{ id: GOAL_ID }] };
      },
    }),
  };

  return { db, callLog };
}

type ConsentState = "expired" | "missing" | "revoked" | "valid";

function consentAuthorizer(input: {
  state: ConsentState;
  scopes: readonly ("goals" | "metrics")[];
}) {
  return vi.fn(
    async (request: Parameters<typeof withAuthorizedAthleteReadAcrossOrganizations>[0]) => {
      if (input.state !== "valid" || !input.scopes.includes(request.scope as "goals" | "metrics")) {
        return { outcome: "deny" as const };
      }
      return {
        outcome: "allow" as const,
        organizationId: "33333333-3333-4333-8333-333333333333",
        value: await request.read(request.db as never),
      };
    },
  ) as unknown as typeof withAuthorizedAthleteReadAcrossOrganizations;
}

function createCaller(params?: {
  userId?: string;
  queryMap?: QueryMap;
  authorizeRead?: typeof withAuthorizedAthleteReadAcrossOrganizations;
}) {
  const { userId = OWNER_ID, queryMap, authorizeRead } = params ?? {};
  const { db, callLog } = createDbMock(queryMap);
  const router = authorizeRead ? createGoalsRouter(authorizeRead) : goalsRouter;
  const caller = router.createCaller({
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
        profileGoalsCount: [{ total: 1 }],
      },
    });

    const result = await caller.list({
      profile_id: OWNER_ID,
      limit: 20,
    });

    expect(result).toEqual({
      items: [goal],
      total: 1,
      hasMore: false,
      nextCursor: undefined,
    });
  });

  it("accepts infinite-query direction metadata", async () => {
    const goal = createGoalRow();
    const { caller } = createCaller({
      queryMap: {
        profileGoalsSelect: [goal],
        profileGoalsCount: [{ total: 1 }],
      },
    });

    await expect(
      caller.list({
        profile_id: OWNER_ID,
        limit: 20,
        direction: "forward",
      }),
    ).resolves.toMatchObject({ items: [goal] });
  });

  it("rejects list input with unexpected keys", async () => {
    const { caller } = createCaller();

    await expect(
      caller.list({
        profile_id: OWNER_ID,
        limit: 20,
        extra: true,
      } as any),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" } as Partial<TRPCError>);
  });

  it("rejects create input with removed training plan linkage", async () => {
    const { caller } = createCaller();

    await expect(
      caller.create({
        profile_id: OWNER_ID,
        target_date: "2026-06-10",
        title: "Canonical Goal",
        priority: 6,
        activity_category: "run",
        training_plan_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        target_payload: {
          type: "event_performance",
          activity_category: "run",
          distance_m: 5000,
          target_time_s: 1500,
        },
      } as any),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" } as Partial<TRPCError>);
  });

  it("rejects impossible Gregorian target dates before persistence", async () => {
    const { caller, callLog } = createCaller();

    await expect(
      caller.create({
        profile_id: OWNER_ID,
        target_date: "2026-02-31",
        title: "Impossible date",
        priority: 6,
        activity_category: "run",
        target_payload: {
          type: "consistency",
          target_sessions_per_week: 4,
          target_weeks: 8,
        },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" } as Partial<TRPCError>);
    expect(callLog).not.toContainEqual(expect.objectContaining({ operation: "insert" }));
  });

  it("allows an authorized coach to fetch a goal by id", async () => {
    const goal = createGoalRow();
    const { caller } = createCaller({
      userId: COACH_ID,
      authorizeRead: consentAuthorizer({ state: "valid", scopes: ["goals"] }),
      queryMap: {
        profileGoalsSelect: [[goal]],
      },
    });

    const result = await caller.getById({ id: GOAL_ID });

    expect(result).toEqual(goal);
  });

  it("does not disclose an existing goal to an unauthorized actor", async () => {
    const goal = createGoalRow();
    const { caller } = createCaller({
      userId: COACH_ID,
      authorizeRead: consentAuthorizer({ state: "missing", scopes: ["goals"] }),
      queryMap: {
        profileGoalsSelect: [[goal]],
      },
    });

    await expect(caller.getById({ id: GOAL_ID })).rejects.toMatchObject({ code: "NOT_FOUND" });
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
      cache_tags: ["goals.list", "goals.getById"],
    });
    expect(callLog).toContainEqual({
      operation: "insert",
      table: "profile_goals",
      payload: expect.objectContaining({
        id: expect.any(String),
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
        created_at: expect.any(Date),
        updated_at: expect.any(Date),
      }),
    });
  });

  it("does not expose raw database failures when goal creation fails", async () => {
    const databaseMessage = "sensitive row value rejected by profile_goals";
    const databaseError = Object.assign(new Error(databaseMessage), { code: "XX000" });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { caller } = createCaller({ queryMap: { profileGoalsInsertError: databaseError } });

    try {
      await expect(
        caller.create({
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
        }),
      ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create goal" });
      expect(JSON.stringify(consoleError.mock.calls)).not.toContain(databaseMessage);
    } finally {
      consoleError.mockRestore();
    }
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
      cache_tags: ["goals.list", "goals.getById"],
    });
    expect(callLog).toContainEqual({
      operation: "update",
      table: "profile_goals",
      payload: expect.objectContaining({
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
      },
    });

    const result = await caller.delete({ id: GOAL_ID });

    expect(result).toEqual({
      success: true,
      cache_tags: ["goals.list", "goals.getById"],
    });
    expect(callLog).toContainEqual({ operation: "delete", table: "profile_goals" });
  });

  it("does not disclose an existing goal through unauthorized writes", async () => {
    const goal = createGoalRow();
    const { caller, callLog } = createCaller({
      userId: COACH_ID,
      queryMap: {
        profileGoalsSelect: [[goal], [goal]],
        profileAccess: [],
      },
    });

    await expect(
      caller.update({ id: GOAL_ID, data: { title: "Unauthorized update" } }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(caller.delete({ id: GOAL_ID })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(callLog).not.toContainEqual(expect.objectContaining({ operation: "update" }));
    expect(callLog).not.toContainEqual(expect.objectContaining({ operation: "delete" }));
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
      authorizeRead: consentAuthorizer({ state: "missing", scopes: ["goals"] }),
    });

    await expect(
      caller.list({
        profile_id: OWNER_ID,
        limit: 20,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" } as Partial<TRPCError>);
  });

  it("allows a coach to list goals through valid goals consent", async () => {
    const goal = createGoalRow();
    const authorizeRead = consentAuthorizer({ state: "valid", scopes: ["goals"] });
    const { caller } = createCaller({
      userId: COACH_ID,
      authorizeRead,
      queryMap: { profileGoalsSelect: [goal], profileGoalsCount: [{ total: 1 }] },
    });

    await expect(caller.list({ profile_id: OWNER_ID, limit: 20 })).resolves.toMatchObject({
      items: [goal],
      total: 1,
    });
    expect(authorizeRead).toHaveBeenCalledWith(
      expect.objectContaining({
        actorProfileId: COACH_ID,
        athleteProfileId: OWNER_ID,
        scope: "goals",
      }),
    );
  });

  it.each([
    "missing",
    "revoked",
    "expired",
  ] as const)("denies list and hides getById when goals consent is %s", async (state) => {
    const authorizeRead = consentAuthorizer({ state, scopes: ["goals"] });
    const list = createCaller({ userId: COACH_ID, authorizeRead });
    const detail = createCaller({
      userId: COACH_ID,
      authorizeRead,
      queryMap: { profileGoalsSelect: [[createGoalRow()]] },
    });

    await expect(list.caller.list({ profile_id: OWNER_ID, limit: 20 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(detail.caller.getById({ id: GOAL_ID })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("does not treat valid metrics consent as goals consent", async () => {
    const authorizeRead = consentAuthorizer({ state: "valid", scopes: ["metrics"] });
    const list = createCaller({ userId: COACH_ID, authorizeRead });
    const detail = createCaller({
      userId: COACH_ID,
      authorizeRead,
      queryMap: { profileGoalsSelect: [[createGoalRow()]] },
    });

    await expect(list.caller.list({ profile_id: OWNER_ID, limit: 20 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(detail.caller.getById({ id: GOAL_ID })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
