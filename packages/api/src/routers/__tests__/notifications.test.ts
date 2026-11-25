import { describe, expect, it, vi } from "vitest";
import { notificationsRouter } from "../notifications";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ACTOR_ID = "22222222-2222-4222-8222-222222222222";
const NOTIFICATION_ID = "33333333-3333-4333-8333-333333333333";
const NOTIFICATION_ID_2 = "44444444-4444-4444-8444-444444444444";
const ENTITY_ID = "55555555-5555-4555-8555-555555555555";

function createCaller(db: Record<string, unknown> = {}) {
  const caller = notificationsRouter.createCaller({
    db,
    session: { user: { id: USER_ID } },
    headers: new Headers(),
    clientType: "test",
    trpcSource: "vitest",
  } as never);

  return { caller, db };
}

describe("notificationsRouter", () => {
  it("returns recent notifications with normalized timestamps", async () => {
    const createdAt = new Date("2026-04-03T10:00:00.000Z");
    const readAt = new Date("2026-04-03T11:00:00.000Z");
    const limit = vi.fn().mockResolvedValue([
      {
        id: NOTIFICATION_ID,
        user_id: USER_ID,
        actor_id: ACTOR_ID,
        type: "new_message",
        entity_id: ENTITY_ID,
        read_at: readAt,
        created_at: createdAt,
      },
    ]);
    const select = vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ orderBy: vi.fn(() => ({ limit })) })),
      })),
    }));
    const { caller } = createCaller({ select });

    await expect(caller.getRecent({ limit: 1 })).resolves.toEqual([
      {
        id: NOTIFICATION_ID,
        user_id: USER_ID,
        actor_id: ACTOR_ID,
        type: "new_message",
        entity_id: ENTITY_ID,
        read_at: readAt.toISOString(),
        created_at: createdAt.toISOString(),
      },
    ]);
    expect(select).toHaveBeenCalledOnce();
  });

  it("returns unread count as a number even when the database returns a string", async () => {
    const where = vi.fn().mockResolvedValue([{ count: 3 }]);
    const select = vi.fn(() => ({ from: vi.fn(() => ({ where })) }));
    const { caller } = createCaller({ select });

    await expect(caller.getUnreadCount()).resolves.toBe(3);
    expect(select).toHaveBeenCalledOnce();
  });

  it("accepts tRPC's forward direction and reads a stable timestamp-and-id history page", async () => {
    const createdAt = new Date("2026-04-03T10:00:00.000Z");
    const limit = vi.fn().mockResolvedValue([
      {
        id: NOTIFICATION_ID_2,
        user_id: USER_ID,
        actor_id: ACTOR_ID,
        type: "new_message",
        entity_id: ENTITY_ID,
        read_at: null,
        created_at: createdAt,
      },
      {
        id: NOTIFICATION_ID,
        user_id: USER_ID,
        actor_id: ACTOR_ID,
        type: "new_message",
        entity_id: ENTITY_ID,
        read_at: null,
        created_at: createdAt,
      },
      {
        id: "66666666-6666-4666-8666-666666666666",
        user_id: USER_ID,
        actor_id: ACTOR_ID,
        type: "new_message",
        entity_id: ENTITY_ID,
        read_at: null,
        created_at: createdAt,
      },
    ]);
    const orderBy = vi.fn(() => ({ limit }));
    const select = vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ orderBy })) })) }));
    const { caller } = createCaller({ select });

    const page = await caller.getHistory({ direction: "forward", limit: 2, view: "all" });
    expect(page.items.map((item) => item.id)).toEqual([NOTIFICATION_ID_2, NOTIFICATION_ID]);
    expect(page.nextCursor).toEqual({ createdAt: createdAt.toISOString(), id: NOTIFICATION_ID });
    expect(limit).toHaveBeenCalledWith(3);
  });

  it("rejects invalid cursors and profile-like input rather than allowing another profile scope", async () => {
    const { caller } = createCaller();

    await expect(
      caller.getHistory({ cursor: { createdAt: "not-a-date", id: NOTIFICATION_ID } }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(caller.getHistory({ limit: 101 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(caller.getHistory({ direction: "backward" } as never)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(caller.getHistory({ profileId: ACTOR_ID } as never)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("marks the requested notifications as read", async () => {
    const where = vi.fn().mockResolvedValue([]);
    const update = vi.fn(() => ({ set: vi.fn(() => ({ where })) }));
    const { caller } = createCaller({ update });

    await expect(
      caller.markRead({
        notification_ids: [NOTIFICATION_ID, NOTIFICATION_ID_2],
      }),
    ).resolves.toEqual({ success: true });
    expect(update).toHaveBeenCalledOnce();
  });

  it("markRead rejects unexpected input keys", async () => {
    const { caller } = createCaller();

    await expect(
      caller.markRead({ notification_ids: [NOTIFICATION_ID], extra: true } as never),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
