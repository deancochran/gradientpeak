import { describe, expect, it } from "vitest";
import { onboardingRouter } from "../onboarding";

const USER_ID = "11111111-1111-4111-8111-111111111111";

function createCaller(conflictId?: string) {
  const limit = async () => (conflictId ? [{ id: conflictId }] : []);
  const db = {
    select: () => ({ from: () => ({ where: () => ({ limit }) }) }),
  };

  return onboardingRouter.createCaller({
    db: db as any,
    session: { user: { id: USER_ID } },
    headers: new Headers(),
    clientType: "test",
    trpcSource: "vitest",
  } as any);
}

describe("onboarding.checkUsernameAvailability", () => {
  it("returns false when another profile owns the normalized username", async () => {
    await expect(
      createCaller("22222222-2222-4222-8222-222222222222").checkUsernameAvailability({
        username: "  athlete  ",
      }),
    ).resolves.toEqual({ available: false });
  });

  it("returns true when no other profile owns the username", async () => {
    await expect(
      createCaller().checkUsernameAvailability({ username: "athlete" }),
    ).resolves.toEqual({ available: true });
  });

  it("requires authentication and validates the onboarding username contract", async () => {
    const caller = onboardingRouter.createCaller({
      db: {} as any,
      session: null,
      headers: new Headers(),
      clientType: "test",
      trpcSource: "vitest",
    } as any);

    await expect(caller.checkUsernameAvailability({ username: "athlete" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(
      createCaller().checkUsernameAvailability({ username: "   " }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
});
