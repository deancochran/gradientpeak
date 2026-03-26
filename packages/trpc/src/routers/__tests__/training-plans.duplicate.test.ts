import { describe, expect, it } from "vitest";
import { trainingPlansRouter } from "../planning/training-plans";

type QueryResult = {
  data: any;
  error: { message: string } | null;
};

type QueryMap = Record<string, QueryResult | QueryResult[]>;

type QueryCall = {
  table: string;
  operation: "select" | "insert" | "filter";
  payload?: unknown;
};

function createSupabaseMock(queryMap: QueryMap) {
  const callLog: QueryCall[] = [];
  const counters = new Map<string, number>();

  const nextResult = (table: string): QueryResult => {
    const entry = queryMap[table];
    if (!entry) return { data: [], error: null };
    if (!Array.isArray(entry)) return entry;

    const index = counters.get(table) ?? 0;
    counters.set(table, index + 1);
    return entry[index] ?? entry[entry.length - 1] ?? { data: [], error: null };
  };

  const client = {
    from: (table: string) => {
      const builder: any = {
        select: (payload?: unknown) => {
          callLog.push({ table, operation: "select", payload });
          return builder;
        },
        eq: (column: string, value: unknown) => {
          callLog.push({
            table,
            operation: "filter",
            payload: { type: "eq", column, value },
          });
          return builder;
        },
        or: (value: string) => {
          callLog.push({
            table,
            operation: "filter",
            payload: { type: "or", value },
          });
          return builder;
        },
        insert: (payload: unknown) => {
          callLog.push({ table, operation: "insert", payload });
          return builder;
        },
        single: () => Promise.resolve(nextResult(table)),
      };

      return builder;
    },
  };

  return { client, callLog };
}

describe("trainingPlansRouter.duplicate", () => {
  it("allows public plans and creates a private owned copy without scheduling", async () => {
    const sourcePlanId = "11111111-1111-4111-8111-111111111111";
    const { client, callLog } = createSupabaseMock({
      training_plans: [
        {
          data: {
            id: sourcePlanId,
            name: "Shared Build",
            description: "Shared plan",
            profile_id: "template-owner",
            template_visibility: "public",
            is_system_template: false,
            is_public: true,
            structure: {
              id: sourcePlanId,
              plan_type: "periodized",
              name: "Shared Build",
              start_date: "2026-01-01",
              end_date: "2026-03-01",
              fitness_progression: { starting_ctl: 45, target_ctl_at_peak: 60 },
              activity_distribution: { run: { target_percentage: 1 } },
              blocks: [
                {
                  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
                  name: "Base",
                  phase: "base",
                  start_date: "2026-01-01",
                  end_date: "2026-01-28",
                  goal_ids: [],
                  target_weekly_tss_range: { min: 280, max: 320 },
                  target_sessions_per_week_range: { min: 4, max: 5 },
                },
              ],
              goals: [],
            },
          },
          error: null,
        },
        {
          data: {
            id: "33333333-3333-4333-8333-333333333333",
            name: "Shared Build (Copy)",
            description: "Shared plan",
            profile_id: "profile-123",
            template_visibility: "private",
            is_system_template: false,
            is_public: false,
            structure: {
              id: "33333333-3333-4333-8333-333333333333",
              plan_type: "periodized",
              name: "Shared Build",
              start_date: "2026-01-01",
              end_date: "2026-03-01",
              fitness_progression: { starting_ctl: 45, target_ctl_at_peak: 60 },
              activity_distribution: { run: { target_percentage: 1 } },
              blocks: [
                {
                  id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
                  name: "Base",
                  phase: "base",
                  start_date: "2026-01-01",
                  end_date: "2026-01-28",
                  goal_ids: [],
                  target_weekly_tss_range: { min: 280, max: 320 },
                  target_sessions_per_week_range: { min: 4, max: 5 },
                },
              ],
              goals: [],
            },
          },
          error: null,
        },
      ],
    });

    const caller = trainingPlansRouter.createCaller({
      supabase: client as any,
      session: { user: { id: "profile-123" } },
      headers: new Headers(),
      clientType: "test",
      trpcSource: "vitest",
    } as any);

    const result = await caller.duplicate({ id: sourcePlanId });

    const sourceFilter = callLog.find(
      (call) =>
        call.table === "training_plans" &&
        call.operation === "filter" &&
        (call.payload as any)?.type === "or",
    );
    const insertCall = callLog.find(
      (call) => call.table === "training_plans" && call.operation === "insert",
    );
    const insertedPayload = (insertCall?.payload ?? {}) as Record<string, any>;

    expect((sourceFilter?.payload as any)?.value).toContain("template_visibility.eq.public");
    expect(insertedPayload).toMatchObject({
      name: "Shared Build (Copy)",
      profile_id: "profile-123",
      template_visibility: "private",
      is_public: false,
    });
    expect(insertedPayload.structure.id).not.toBe(sourcePlanId);
    expect(result.id).toBe("33333333-3333-4333-8333-333333333333");
    expect(result.visibility).toBe("private");
  });
});
