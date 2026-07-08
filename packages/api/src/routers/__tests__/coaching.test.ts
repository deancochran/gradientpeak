import { coachesAthletes } from "@repo/db";
import { describe, expect, it } from "vitest";
import { coachingRouter } from "../coaching";

const ATHLETE_ID = "11111111-1111-4111-8111-111111111111";
const COACH_ID = "22222222-2222-4222-8222-222222222222";

type MockState = {
  rosterRows?: Array<{
    athlete_id: string;
    profile_id: string | null;
    profile_full_name: string | null;
    profile_avatar_url: string | null;
    profile_username: string | null;
  }>;
};

function createDbMock(state: MockState = {}) {
  const resolveSelectRows = (table: unknown) => {
    if (table === coachesAthletes) {
      return state.rosterRows ?? [];
    }

    return [];
  };

  const createSelectBuilder = () => {
    let table: unknown;
    let joinedProfiles = false;

    const resolve = () => {
      if (table === coachesAthletes && joinedProfiles) {
        return Promise.resolve(state.rosterRows ?? []);
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

  const db: any = {
    select: () => createSelectBuilder(),
  };

  return { db };
}

function createCaller(userId: string, state?: MockState) {
  const { db } = createDbMock(state);

  return {
    caller: coachingRouter.createCaller({
      db,
      session: { user: { id: userId } },
      headers: new Headers(),
      clientType: "test",
      trpcSource: "vitest",
    } as any),
  };
}

describe("coachingRouter", () => {
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
});
