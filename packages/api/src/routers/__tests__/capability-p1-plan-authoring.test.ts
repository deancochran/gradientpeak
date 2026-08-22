import { describe, expect, it } from "vitest";
import { activityPlansRouter } from "../activity-plans";

const PLAN_ID = "11111111-1111-4111-8111-111111111111";
const STRUCTURE_HASH = `v1:sha256:${"a".repeat(64)}`;

function unauthenticatedCaller() {
  return activityPlansRouter.createCaller({
    db: undefined,
    session: null,
    headers: new Headers(),
    clientType: "test",
    trpcSource: "vitest",
  } as never);
}

describe("activity-plan authoring API boundary", () => {
  it.each([
    ["browse-and-inspect list", () => unauthenticatedCaller().list({ ownerScope: "own" })],
    ["browse-and-inspect detail", () => unauthenticatedCaller().getById({ id: PLAN_ID })],
    [
      "create",
      () =>
        unauthenticatedCaller().create({
          name: "Boundary plan",
          description: "",
          structure: { activity_category: "run", segments: [] },
        }),
    ],
    [
      "edit-basics",
      () =>
        unauthenticatedCaller().update({
          id: PLAN_ID,
          expectedStructureHash: STRUCTURE_HASH,
          name: "Updated boundary plan",
        }),
    ],
  ] as const)("rejects unauthenticated %s access", async (_capability, call) => {
    await expect(call()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
