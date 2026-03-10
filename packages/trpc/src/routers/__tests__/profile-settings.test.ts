import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";
import { normalizeCreationConfig } from "@repo/core";
import { profileSettingsRouter } from "../profile_settings";

type QueryResult = {
  data: any;
  error: { message: string } | null;
};

type QueryMap = Record<string, QueryResult | QueryResult[]>;

const baseSettings = normalizeCreationConfig({});

function createSupabaseMock(queryMap: QueryMap) {
  const counters = new Map<string, number>();

  const nextResult = (table: string): QueryResult => {
    const entry = queryMap[table];
    if (!entry) return { data: null, error: null };
    if (!Array.isArray(entry)) return entry;

    const index = counters.get(table) ?? 0;
    counters.set(table, index + 1);

    return (
      entry[index] ?? entry[entry.length - 1] ?? { data: null, error: null }
    );
  };

  return {
    from: (table: string) => {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        upsert: () => builder,
        single: () => Promise.resolve(nextResult(table)),
        maybeSingle: () => Promise.resolve(nextResult(table)),
        then: (onFulfilled: (value: QueryResult) => unknown) =>
          Promise.resolve(nextResult(table)).then(onFulfilled),
      };

      return builder;
    },
  };
}

function createCaller(params?: { userId?: string; queryMap?: QueryMap }) {
  const { userId, queryMap = {} } = params ?? {};
  const supabase = createSupabaseMock(queryMap);

  const caller = profileSettingsRouter.createCaller({
    supabase: supabase as any,
    session: { user: { id: userId ?? "11111111-1111-4111-8111-111111111111" } },
    headers: new Headers(),
    clientType: "test",
    trpcSource: "vitest",
  } as any);

  return { caller };
}

describe("profileSettingsRouter", () => {
  it("returns null when profile settings do not exist", async () => {
    const { caller } = createCaller({
      userId: "11111111-1111-4111-8111-111111111111",
      queryMap: {
        profile_training_settings: { data: null, error: null },
      },
    });

    const result = await caller.getForProfile({
      profile_id: "11111111-1111-4111-8111-111111111111",
    });

    expect(result).toBeNull();
  });

  it("rejects unauthorized profile settings access", async () => {
    const { caller } = createCaller({
      userId: "99999999-9999-4999-8999-999999999999",
      queryMap: {
        coaches_athletes: { data: null, error: null },
      },
    });

    await expect(
      caller.getForProfile({
        profile_id: "11111111-1111-4111-8111-111111111111",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" } as Partial<TRPCError>);
  });

  it("upserts settings for an authorized coach", async () => {
    const profileId = "11111111-1111-4111-8111-111111111111";
    const coachId = "22222222-2222-4222-8222-222222222222";
    const { caller } = createCaller({
      userId: coachId,
      queryMap: {
        coaches_athletes: { data: { coach_id: coachId }, error: null },
        profile_training_settings: {
          data: {
            profile_id: profileId,
            settings: baseSettings,
            updated_at: "2026-03-06T00:00:00.000Z",
          },
          error: null,
        },
      },
    });

    const result = await caller.upsert({
      profile_id: profileId,
      settings: baseSettings,
    });

    expect(result.profile_id).toBe(profileId);
    expect(result.cache_tags).toContain("profileSettings.getForProfile");
  });
});
