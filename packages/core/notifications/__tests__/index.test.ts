import { describe, expect, it } from "vitest";

import {
  getNotificationViewModel,
  getUnreadNotificationIds,
  isNotificationUnread,
  normalizeNotificationListItem,
} from "../index";

describe("notification helpers", () => {
  it("normalizes notification records used by app screens", () => {
    const notification = normalizeNotificationListItem({
      id: "n-1",
      actor_id: "u-1",
      created_at: "2026-03-21T00:00:00.000Z",
      read_at: null,
      type: "follow_request",
    });

    expect(notification).not.toBeNull();
    expect(notification?.type).toBe("follow_request");
    expect(isNotificationUnread(notification!)).toBe(true);
  });

  it("builds deterministic list item copy", () => {
    const notification = normalizeNotificationListItem({
      id: "n-2",
      actor_id: "u-2",
      created_at: "2026-03-21T00:00:00.000Z",
      read_at: null,
      type: "new_message",
    });

    expect(getNotificationViewModel(notification!)).toMatchObject({
      title: "New Message",
      description: "You have a new message in your inbox.",
      isUnread: true,
      requiresFollowRequestAction: false,
    });
  });

  it("collects unread notification ids across read_at and is_read shapes", () => {
    const notifications = [
      normalizeNotificationListItem({
        id: "n-1",
        created_at: "2026-03-21T00:00:00.000Z",
        read_at: null,
        type: "follow_request",
      }),
      normalizeNotificationListItem({
        id: "n-2",
        created_at: "2026-03-21T00:00:00.000Z",
        is_read: true,
      }),
      normalizeNotificationListItem({
        id: "n-3",
        created_at: "2026-03-21T00:00:00.000Z",
        is_read: false,
      }),
    ].filter((value): value is NonNullable<typeof value> => value !== null);

    expect(getUnreadNotificationIds(notifications)).toEqual(["n-1", "n-3"]);
  });

  it("keeps unknown notification types instead of dropping them", () => {
    const notification = normalizeNotificationListItem({
      id: "n-4",
      created_at: "2026-03-21T00:00:00.000Z",
      type: "future_backend_type",
    });

    expect(notification).not.toBeNull();
    expect(getNotificationViewModel(notification!)).toMatchObject({
      title: "Notification",
      description: "Tap to view details.",
      type: "future_backend_type",
    });
  });
});
