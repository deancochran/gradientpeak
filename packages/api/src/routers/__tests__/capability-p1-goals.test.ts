import { describe, expect, it } from "vitest";
import { goalsRouter } from "../goals";

const GOAL_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PROFILE_ID = "11111111-1111-4111-8111-111111111111";

function unauthenticatedCaller() {
  return goalsRouter.createCaller({
    db: undefined,
    session: null,
    headers: new Headers(),
    clientType: "test",
    trpcSource: "vitest",
  } as never);
}

describe("goals public API boundaries", () => {
  it.each([
    [
      "goals.browse-and-inspect list",
      () => unauthenticatedCaller().list({ profile_id: PROFILE_ID }),
    ],
    ["goals.browse-and-inspect detail", () => unauthenticatedCaller().getById({ id: GOAL_ID })],
    [
      "goals.create",
      () =>
        unauthenticatedCaller().create({
          profile_id: PROFILE_ID,
          target_date: "2026-06-01",
          title: "Boundary goal",
          priority: 5,
          activity_category: "run",
          target_payload: {
            type: "consistency",
            target_sessions_per_week: 3,
            target_weeks: 8,
          },
        }),
    ],
    [
      "goals.edit",
      () => unauthenticatedCaller().update({ id: GOAL_ID, data: { title: "Edited" } }),
    ],
    ["goals.delete", () => unauthenticatedCaller().delete({ id: GOAL_ID })],
  ] as const)("requires authentication for %s", async (_capability, call) => {
    await expect(call()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
