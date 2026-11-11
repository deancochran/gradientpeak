import { describe, expect, it } from "vitest";
import { profileAccessRouter } from "../account/profile-access-router";

const relationship = {
  athlete_id: "22222222-2222-4222-8222-222222222222",
  coach_id: "11111111-1111-4111-8111-111111111111",
};

function createCaller(userId?: string) {
  let databaseCalls = 0;
  const db = new Proxy(
    {},
    {
      get() {
        databaseCalls += 1;
        throw new Error("The retired handler must not access the context database");
      },
    },
  );
  return {
    caller: profileAccessRouter.createCaller({
      db,
      headers: new Headers(),
      session: userId ? { user: { id: userId } } : null,
      clientType: "test",
      trpcSource: "vitest",
    } as never),
    databaseCalls: () => databaseCalls,
  };
}

describe("profileAccessRouter.revoke retirement", () => {
  // Test mode uses an in-memory limiter. These assertions cover context DB
  // access, not production middleware's separate rate-limit bookkeeping.
  it.each([
    relationship.athlete_id,
    relationship.coach_id,
    "33333333-3333-4333-8333-333333333333",
  ])("fails closed without context database access for authenticated caller %s", async (userId) => {
    const { caller, databaseCalls } = createCaller(userId);

    await expect(caller.revoke(relationship)).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: expect.stringContaining("organizations.lifecycle"),
    });
    expect(databaseCalls()).toBe(0);
  });

  it("remains protected for anonymous callers", async () => {
    const { caller, databaseCalls } = createCaller();

    await expect(caller.revoke(relationship)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(databaseCalls()).toBe(0);
  });

  it("validates malformed relationship input before retiring the operation", async () => {
    const { caller, databaseCalls } = createCaller(relationship.coach_id);

    await expect(
      caller.revoke({ coach_id: "invalid", athlete_id: relationship.athlete_id }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(databaseCalls()).toBe(0);
  });
});
