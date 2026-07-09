import { defaultAthletePreferenceProfile } from "@repo/core";
import { profileTrainingSettings } from "@repo/db";
import type { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";

import { createRouterCaller } from "../../test/router";
import { profileSettingsRouter } from "../profile-settings";

type DbPlan = {
  select?: Array<unknown[]>;
  execute?: Array<Array<{ has_access: boolean }>>;
  insert?: Array<unknown[]>;
};

const PROFILE_ID = "11111111-1111-4111-8111-111111111111";
const COACH_ID = "22222222-2222-4222-8222-222222222222";
const UNAUTHORIZED_ID = "99999999-9999-4999-8999-999999999999";

const baseSettings = defaultAthletePreferenceProfile;

function createDbMock(plan: DbPlan = {}) {
  const selectQueue = [...(plan.select ?? [])];
  const executeQueue = [...(plan.execute ?? [])];
  const insertQueue = [...(plan.insert ?? [])];

  const calls = {
    execute: [] as unknown[],
    select: 0,
    insertValues: [] as Array<Record<string, unknown>>,
    conflictConfigs: [] as Array<Record<string, unknown>>,
  };

  return {
    calls,
    db: {
      execute: async (query: unknown) => {
        calls.execute.push(query);
        return { rows: executeQueue.shift() ?? [] };
      },
      select: () => {
        const builder: any = {
          from: (table: unknown) => {
            if (table !== profileTrainingSettings) {
              throw new Error(`Unexpected table: ${String(table)}`);
            }

            return builder;
          },
          where: () => builder,
          limit: () => builder,
          then: (onFulfilled: (value: unknown[]) => unknown) => {
            calls.select += 1;
            return Promise.resolve(selectQueue.shift() ?? []).then(onFulfilled);
          },
        };

        return builder;
      },
      insert: (table: unknown) => {
        if (table !== profileTrainingSettings) {
          throw new Error(`Unexpected table: ${String(table)}`);
        }

        return {
          values: (values: Record<string, unknown>) => {
            calls.insertValues.push(values);

            return {
              onConflictDoUpdate: (config: Record<string, unknown>) => {
                calls.conflictConfigs.push(config);

                return {
                  returning: () => Promise.resolve(insertQueue.shift() ?? []),
                };
              },
            };
          },
        };
      },
    },
  };
}

function createCaller(params?: { userId?: string; plan?: DbPlan }) {
  const { userId = PROFILE_ID, plan = {} } = params ?? {};
  const { db, calls } = createDbMock(plan);

  const caller = createRouterCaller(profileSettingsRouter, { db, userId });

  return { caller, calls };
}

describe("profileSettingsRouter", () => {
  it("returns null when the signed-in profile has no saved settings", async () => {
    const { caller, calls } = createCaller({
      plan: {
        select: [[]],
      },
    });

    const result = await caller.getForProfile({ profile_id: PROFILE_ID });

    expect(result).toBeNull();
    expect(calls.execute).toHaveLength(0);
    expect(calls.select).toBe(1);
  });

  it("rejects getForProfile for users without profile access", async () => {
    const { caller, calls } = createCaller({
      userId: UNAUTHORIZED_ID,
      plan: {
        execute: [[{ has_access: false }]],
      },
    });

    await expect(caller.getForProfile({ profile_id: PROFILE_ID })).rejects.toMatchObject({
      code: "FORBIDDEN",
    } as Partial<TRPCError>);

    expect(calls.execute).toHaveLength(1);
    expect(calls.select).toBe(0);
  });

  it("rejects unknown keys on getForProfile input", async () => {
    const { caller, calls } = createCaller();

    await expect(
      caller.getForProfile({
        profile_id: PROFILE_ID,
        extra: true,
      } as Parameters<typeof caller.getForProfile>[0]),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    } as Partial<TRPCError>);

    expect(calls.execute).toHaveLength(0);
    expect(calls.select).toBe(0);
  });

  it("upserts settings for an authorized coach and returns cache tags", async () => {
    const updatedAt = new Date("2026-03-06T00:00:00.000Z");
    const { caller, calls } = createCaller({
      userId: COACH_ID,
      plan: {
        execute: [[{ has_access: true }]],
        insert: [
          [
            {
              profile_id: PROFILE_ID,
              settings: baseSettings,
              updated_at: updatedAt,
            },
          ],
        ],
      },
    });

    const result = await caller.upsert({
      profile_id: PROFILE_ID,
      settings: baseSettings,
    });

    expect(calls.execute).toHaveLength(1);
    expect(calls.insertValues).toHaveLength(1);
    expect(calls.insertValues[0]).toMatchObject({
      profile_id: PROFILE_ID,
      settings: baseSettings,
    });
    expect(calls.conflictConfigs).toHaveLength(1);
    expect(result.profile_id).toBe(PROFILE_ID);
    expect(result.updated_at).toBe("2026-03-06T00:00:00.000Z");
    expect(result.cache_tags).toEqual(["profileSettings.getForProfile", "goals.list"]);
  });

  it("rejects unknown keys on upsert input", async () => {
    const { caller, calls } = createCaller({ userId: COACH_ID });

    await expect(
      caller.upsert({
        profile_id: PROFILE_ID,
        settings: baseSettings,
        extra: true,
      } as Parameters<typeof caller.upsert>[0]),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    } as Partial<TRPCError>);

    expect(calls.execute).toHaveLength(0);
    expect(calls.insertValues).toHaveLength(0);
  });
});
