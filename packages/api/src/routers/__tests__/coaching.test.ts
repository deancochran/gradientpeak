import { coachesAthletes, coachingInvitations } from "@repo/db";
import { describe, expect, it } from "vitest";
import { coachingRouter } from "../coaching";

const ATHLETE_ID = "11111111-1111-4111-8111-111111111111";
const COACH_ID = "22222222-2222-4222-8222-222222222222";
const INVITATION_ID = "33333333-3333-4333-8333-333333333333";

type MockState = {
  invitationRows?: Array<{
    athlete_id: string;
    coach_id: string;
    created_at: Date | string;
    id: string;
    status: "pending" | "accepted" | "declined";
    updated_at: Date | string;
  }>;
  rosterRows?: Array<{
    athlete_id: string;
    profile_id: string | null;
    profile_full_name: string | null;
    profile_avatar_url: string | null;
    profile_username: string | null;
  }>;
  coachRows?: Array<{
    coach_id: string;
    profile_id: string | null;
    profile_full_name: string | null;
    profile_avatar_url: string | null;
    profile_username: string | null;
  }>;
};

function createDbMock(state: MockState = {}) {
  const insertCalls: Array<{ table: unknown; values: unknown }> = [];
  const updateCalls: Array<{ table: unknown; values: unknown }> = [];

  const resolveSelectRows = (table: unknown) => {
    if (table === coachingInvitations) {
      return state.invitationRows ?? [];
    }

    if (table === coachesAthletes) {
      return state.rosterRows ?? state.coachRows ?? [];
    }

    return [];
  };

  const createSelectBuilder = () => {
    let table: unknown;
    let joinedProfiles = false;

    const resolve = () => {
      if (table === coachesAthletes && joinedProfiles) {
        return Promise.resolve(state.rosterRows ?? state.coachRows ?? []);
      }

      return Promise.resolve(resolveSelectRows(table));
    };

    const builder: any = {
      from: (nextTable: unknown) => {
        table = nextTable;
        return builder;
      },
      leftJoin: () => {
        joinedProfiles = true;
        return builder;
      },
      where: () => builder,
      limit: async (count: number) => {
        const rows = await resolve();
        return rows.slice(0, count);
      },
      then: (
        onFulfilled: (value: unknown[]) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) => resolve().then(onFulfilled, onRejected),
    };

    return builder;
  };

  const createUpdateBuilder = (table: unknown) => ({
    set: (values: unknown) => {
      updateCalls.push({ table, values });

      return {
        where: async () => [],
      };
    },
  });

  const db: any = {
    select: () => createSelectBuilder(),
    insert: (table: unknown) => ({
      values: async (values: unknown) => {
        insertCalls.push({ table, values });
        return [];
      },
    }),
    update: (table: unknown) => createUpdateBuilder(table),
    transaction: async (callback: (tx: any) => Promise<void>) => {
      await callback({
        insert: db.insert,
        update: db.update,
      });
    },
  };

  return { db, insertCalls, updateCalls };
}

function createCaller(userId: string, state?: MockState) {
  const { db, insertCalls, updateCalls } = createDbMock(state);

  return {
    caller: coachingRouter.createCaller({
      db,
      session: { user: { id: userId } },
      headers: new Headers(),
      clientType: "test",
      trpcSource: "vitest",
    } as any),
    insertCalls,
    updateCalls,
  };
}

describe("coachingRouter", () => {
  it("creates a pending coaching invitation for the current user", async () => {
    const { caller, insertCalls } = createCaller(COACH_ID);

    await expect(
      caller.invite({
        athlete_id: ATHLETE_ID,
        coach_id: COACH_ID,
      }),
    ).resolves.toEqual({ success: true });

    expect(insertCalls).toContainEqual({
      table: coachingInvitations,
      values: {
        athlete_id: ATHLETE_ID,
        coach_id: COACH_ID,
        status: "pending",
      },
    });
  });

  it("accepts an invitation and creates the coach-athlete link", async () => {
    const { caller, insertCalls, updateCalls } = createCaller(ATHLETE_ID, {
      invitationRows: [
        {
          id: INVITATION_ID,
          athlete_id: ATHLETE_ID,
          coach_id: COACH_ID,
          status: "pending",
          created_at: "2026-04-03T00:00:00.000Z",
          updated_at: "2026-04-03T00:00:00.000Z",
        },
      ],
    });

    await expect(
      caller.respond({
        invitation_id: INVITATION_ID,
        status: "accepted",
      }),
    ).resolves.toEqual({ success: true });

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]?.table).toBe(coachingInvitations);
    expect(updateCalls[0]?.values).toMatchObject({ status: "accepted" });
    expect(updateCalls[0]?.values).toHaveProperty("updated_at");
    expect(insertCalls).toContainEqual({
      table: coachesAthletes,
      values: {
        coach_id: COACH_ID,
        athlete_id: ATHLETE_ID,
      },
    });
  });

  it("returns a normalized roster for the signed-in coach", async () => {
    const { caller } = createCaller(COACH_ID, {
      rosterRows: [
        {
          athlete_id: ATHLETE_ID,
          profile_id: ATHLETE_ID,
          profile_full_name: "Athlete Example",
          profile_avatar_url: "https://example.com/avatar.png",
          profile_username: "athlete-example",
        },
      ],
    });

    await expect(caller.getRoster()).resolves.toEqual([
      {
        athlete_id: ATHLETE_ID,
        profile: {
          id: ATHLETE_ID,
          full_name: "Athlete Example",
          avatar_url: "https://example.com/avatar.png",
          username: "athlete-example",
        },
      },
    ]);
  });

  it("returns the athlete's coach with profile details", async () => {
    const { caller } = createCaller(ATHLETE_ID, {
      coachRows: [
        {
          coach_id: COACH_ID,
          profile_id: COACH_ID,
          profile_full_name: "Coach Example",
          profile_avatar_url: "https://example.com/coach.png",
          profile_username: "coach-example",
        },
      ],
    });

    await expect(caller.getCoach()).resolves.toEqual({
      coach_id: COACH_ID,
      profiles: {
        id: COACH_ID,
        full_name: "Coach Example",
        avatar_url: "https://example.com/coach.png",
        username: "coach-example",
      },
    });
  });
});
