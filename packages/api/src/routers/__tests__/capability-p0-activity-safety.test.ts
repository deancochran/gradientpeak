import { describe, expect, it } from "vitest";
import { activitiesRouter } from "../activities";
import { profilesRouter } from "../profiles";

const ACTIVITY_ID = "11111111-1111-4111-8111-111111111111";
const PROFILE_ID = "22222222-2222-4222-8222-222222222222";

function unauthenticatedCaller(router: typeof activitiesRouter | typeof profilesRouter) {
  return router.createCaller({
    db: undefined,
    session: null,
    headers: new Headers(),
    clientType: "test",
    trpcSource: "vitest",
  } as never);
}

describe("P0 activity and profile safety capabilities", () => {
  it.each([
    [
      "activity.change-visibility",
      () =>
        unauthenticatedCaller(activitiesRouter).update({
          id: ACTIVITY_ID,
          content_visibility: "private",
        }),
    ],
    ["activity.delete", () => unauthenticatedCaller(activitiesRouter).delete({ id: ACTIVITY_ID })],
    ["profile.view", () => unauthenticatedCaller(profilesRouter).getPublicById({ id: PROFILE_ID })],
    ["profile.edit", () => unauthenticatedCaller(profilesRouter).update({ full_name: "Blocked" })],
  ] as const)("rejects unauthenticated access for %s", async (_capability, call) => {
    await expect(call()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
