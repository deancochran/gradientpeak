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
      user_id: "recipient-1",
      actor_id: "u-1",
      entity_id: null,
      created_at: "2026-03-21T00:00:00.000Z",
      read_at: null,
      type: "follow_request",
    });

    expect(notification).not.toBeNull();
    if (!notification) throw new Error("Expected normalized notification");
    expect(notification?.type).toBe("follow_request");
    expect(isNotificationUnread(notification)).toBe(true);
  });

  it("builds deterministic list item copy", () => {
    const notification = normalizeNotificationListItem({
      id: "n-2",
      user_id: "recipient-1",
      actor_id: "u-2",
      entity_id: null,
      created_at: "2026-03-21T00:00:00.000Z",
      read_at: null,
      type: "new_message",
    });

    if (!notification) throw new Error("Expected normalized notification");
    expect(getNotificationViewModel(notification)).toMatchObject({
      title: "New Message",
      description: "You have a new message in your inbox.",
      isUnread: true,
      requiresFollowRequestAction: false,
    });
  });

  it("builds cancellation copy for group event notifications", () => {
    const notification = normalizeNotificationListItem({
      id: "n-group-cancelled",
      user_id: "recipient-1",
      actor_id: "u-admin",
      entity_id: null,
      created_at: "2026-03-21T00:00:00.000Z",
      read_at: null,
      type: "group_event_cancelled",
    });

    if (!notification) throw new Error("Expected normalized notification");
    expect(getNotificationViewModel(notification)).toMatchObject({
      title: "Group Event Cancelled",
      description: "A group event on your calendar was cancelled.",
      isUnread: true,
      requiresFollowRequestAction: false,
    });
  });

  it("collects unread notification ids from required read_at values", () => {
    const notifications = [
      normalizeNotificationListItem({
        id: "n-1",
        user_id: "recipient-1",
        actor_id: null,
        entity_id: null,
        created_at: "2026-03-21T00:00:00.000Z",
        read_at: null,
        type: "follow_request",
      }),
      normalizeNotificationListItem({
        id: "n-2",
        user_id: "recipient-1",
        actor_id: null,
        entity_id: null,
        created_at: "2026-03-21T00:00:00.000Z",
        read_at: "2026-03-21T01:00:00.000Z",
        type: "new_message",
      }),
      normalizeNotificationListItem({
        id: "n-3",
        user_id: "recipient-1",
        actor_id: null,
        entity_id: null,
        created_at: "2026-03-21T00:00:00.000Z",
        read_at: null,
        type: "new_message",
      }),
    ].filter((value): value is NonNullable<typeof value> => value !== null);

    expect(getUnreadNotificationIds(notifications)).toEqual(["n-1", "n-3"]);
  });

  it("keeps unknown notification types instead of dropping them", () => {
    const notification = normalizeNotificationListItem({
      id: "n-4",
      user_id: "recipient-1",
      actor_id: null,
      entity_id: null,
      created_at: "2026-03-21T00:00:00.000Z",
      read_at: null,
      type: "future_backend_type",
    });

    expect(notification).not.toBeNull();
    if (!notification) throw new Error("Expected normalized notification");
    expect(getNotificationViewModel(notification)).toMatchObject({
      title: "Notification",
      description: "Tap to view details.",
      type: "future_backend_type",
    });
  });

  it("rejects omitted read_at, legacy is_read-only, and unknown fields", () => {
    const current = {
      id: "n-5",
      user_id: "recipient-1",
      actor_id: null,
      entity_id: null,
      created_at: "2026-03-21T00:00:00.000Z",
      read_at: null,
      type: "new_message",
    };

    const { read_at: _readAt, ...withoutReadAt } = current;
    expect(normalizeNotificationListItem(withoutReadAt)).toBeNull();
    expect(normalizeNotificationListItem({ ...withoutReadAt, is_read: false })).toBeNull();
    expect(normalizeNotificationListItem({ ...current, extra: true })).toBeNull();
  });
});
