import { describe, expect, it, vi } from "vitest";
import { notificationsRouter } from "../notifications";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ACTOR_ID = "22222222-2222-4222-8222-222222222222";
const NOTIFICATION_ID = "33333333-3333-4333-8333-333333333333";
const NOTIFICATION_ID_2 = "44444444-4444-4444-8444-444444444444";
const ENTITY_ID = "55555555-5555-4555-8555-555555555555";

function createCaller(execute = vi.fn()) {
  const caller = notificationsRouter.createCaller({
    db: { execute },
    session: { user: { id: USER_ID } },
    headers: new Headers(),
    clientType: "test",
    trpcSource: "vitest",
  } as any);

  return { caller, execute };
}

describe("notificationsRouter", () => {
  it("returns recent notifications with normalized timestamps", async () => {
    const createdAt = new Date("2026-04-03T10:00:00.000Z");
    const readAt = new Date("2026-04-03T11:00:00.000Z");
    const { caller, execute } = createCaller(
      vi.fn(async () => ({
        rows: [
          {
            id: NOTIFICATION_ID,
            user_id: USER_ID,
            actor_id: ACTOR_ID,
            type: "new_message",
            entity_id: ENTITY_ID,
            read_at: readAt,
            created_at: createdAt,
            is_read: true,
          },
        ],
      })),
    );

    await expect(caller.getRecent({ limit: 1 })).resolves.toEqual([
      {
        id: NOTIFICATION_ID,
        user_id: USER_ID,
        actor_id: ACTOR_ID,
        type: "new_message",
        entity_id: ENTITY_ID,
        read_at: readAt.toISOString(),
        created_at: createdAt.toISOString(),
        is_read: true,
      },
    ]);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("returns unread count as a number even when the database returns a string", async () => {
    const { caller, execute } = createCaller(
      vi.fn(async () => ({
        rows: [{ count: "3" }],
      })),
    );

    await expect(caller.getUnreadCount()).resolves.toBe(3);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("marks the requested notifications as read", async () => {
    const { caller, execute } = createCaller(vi.fn(async () => ({ rows: [] })));

    await expect(
      caller.markRead({
        notification_ids: [NOTIFICATION_ID, NOTIFICATION_ID_2],
      }),
    ).resolves.toEqual({ success: true });
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
