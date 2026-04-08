import { activities, activityEfforts, profileMetrics, profiles } from "@repo/db";
import { describe, expect, it } from "vitest";
import { onboardingRouter } from "../onboarding";

type InsertCall = {
  table: unknown;
  values: unknown[];
};

function createCaller(params?: {
  userId?: string;
  updatedProfileId?: string | null;
  latestActivityId?: string | null;
}) {
  const userId = params?.userId ?? "11111111-1111-4111-8111-111111111111";
  const updatedProfileId = params?.updatedProfileId ?? userId;
  const latestActivityId = params?.latestActivityId ?? null;
  const insertCalls: InsertCall[] = [];

  const db = {
    update: (table: unknown) => {
      expect(table).toBe(profiles);

      return {
        set: (values: unknown) => {
          expect(values).toMatchObject({ onboarded: true, gender: expect.anything() });

          return {
            where: () => ({
              returning: async () => (updatedProfileId ? [{ id: updatedProfileId }] : []),
            }),
          };
        },
      };
    },
    insert: (table: unknown) => ({
      values: async (values: unknown[]) => {
        insertCalls.push({ table, values });
        return [];
      },
    }),
    select: () => ({
      from: (table: unknown) => {
        expect(table).toBe(activities);

        return {
          where: () => ({
            orderBy: () => ({
              limit: async () => (latestActivityId ? [{ id: latestActivityId }] : []),
            }),
          }),
        };
      },
    }),
  };

  const caller = onboardingRouter.createCaller({
    db: db as any,
    session: { user: { id: userId } },
    headers: new Headers(),
    clientType: "test",
    trpcSource: "vitest",
  } as any);

  return { caller, insertCalls };
}

describe("onboardingRouter", () => {
  it("completes onboarding while ignoring an extra primary_sport field for baseline efforts", async () => {
    const { caller, insertCalls } = createCaller();

    const result = await caller.completeOnboarding({
      experience_level: "beginner",
      dob: "1990-01-01T00:00:00.000Z",
      weight_kg: 70,
      gender: "male",
      primary_sport: "cycling",
    } as any);

    expect(result).toMatchObject({
      success: true,
      created: {
        profile_metrics: 5,
        activity_efforts: 0,
      },
      baseline_used: true,
      confidence: "low",
      warnings: [],
    });

    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0]?.table).toBe(profileMetrics);
    expect(insertCalls[0]?.values).toHaveLength(5);
    expect(insertCalls.some((call) => call.table === activityEfforts)).toBe(false);
  });

  it("surfaces invalid heart-rate combinations from estimateMetrics as a thrown error", async () => {
    const { caller } = createCaller();

    await expect(
      caller.estimateMetrics({
        weight_kg: 70,
        gender: "male",
        age: 30,
        max_hr: 100,
        resting_hr: 120,
      }),
    ).rejects.toThrow("Max HR must be greater than resting HR");
  });

  it("rejects unexpected fields on estimateMetrics", async () => {
    const { caller } = createCaller();

    await expect(
      caller.estimateMetrics({
        weight_kg: 70,
        gender: "male",
        age: 30,
        unexpected: true,
      } as any),
    ).rejects.toThrow(/unrecognized/i);
  });
});
