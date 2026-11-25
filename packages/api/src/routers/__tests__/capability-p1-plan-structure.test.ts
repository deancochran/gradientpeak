import { describe, expect, it, vi } from "vitest";

const { toggleLike, addComment } = vi.hoisted(() => ({
  toggleLike: vi.fn(async (input: { entityType: string }) => ({
    liked: input.entityType === "activity_plan",
  })),
  addComment: vi.fn(async (input: { input: { entity_type: string; content: string } }) => ({
    entity_type: input.input.entity_type,
    content: input.input.content.trim(),
  })),
}));

vi.mock("../../application/social/contentEngagement", () => ({
  toggleContentLike: toggleLike,
  addContentComment: addComment,
  readContentComments: vi.fn(),
}));

import { socialRouter } from "../social";

describe("activity-plan.like-and-comment", () => {
  it("accepts an activity-plan like and comment through the public API contract", async () => {
    const caller = socialRouter.createCaller({
      db: {} as never,
      session: { user: { id: "11111111-1111-4111-8111-111111111111" } },
      headers: new Headers(),
      clientType: "test",
      trpcSource: "vitest",
    } as never);
    const id = "22222222-2222-4222-8222-222222222222";

    await expect(
      caller.toggleLike({ entity_id: id, entity_type: "activity_plan" }),
    ).resolves.toEqual({ liked: true });
    await expect(
      caller.addComment({ entity_id: id, entity_type: "activity_plan", content: "  Ready  " }),
    ).resolves.toEqual({ entity_type: "activity_plan", content: "Ready" });
    expect(toggleLike).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "activity_plan" }),
    );
    expect(addComment).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({ entity_type: "activity_plan", content: "  Ready  " }),
      }),
    );
  });
});
