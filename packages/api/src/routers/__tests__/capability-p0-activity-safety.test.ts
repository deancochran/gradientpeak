import { describe, expect, it } from "vitest";
import { activitiesRouter } from "../activities";
import { profilesRouter } from "../profiles";

const ACTIVITY_ID = "11111111-1111-4111-8111-111111111111";
const PROFILE_ID = "22222222-2222-4222-8222-222222222222";

function unauthenticatedActivitiesCaller() {
  return activitiesRouter.createCaller({
    db: undefined,
    session: null,
    headers: new Headers(),
    clientType: "test",
    trpcSource: "vitest",
  } as never);
}

function unauthenticatedProfilesCaller() {
  return profilesRouter.createCaller({
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
        unauthenticatedActivitiesCaller().update({
          id: ACTIVITY_ID,
          content_visibility: "private",
        }),
    ],
    ["activity.delete", () => unauthenticatedActivitiesCaller().delete({ id: ACTIVITY_ID })],
    ["profile.view", () => unauthenticatedProfilesCaller().getPublicById({ id: PROFILE_ID })],
    ["profile.edit", () => unauthenticatedProfilesCaller().update({ full_name: "Blocked" })],
  ] as const)("rejects unauthenticated access for %s", async (_capability, call) => {
    await expect(call()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
