import { z } from "zod";

export const notificationListItemTypeSchema = z.enum([
  "new_message",
  "coaching_invitation",
  "coaching_invitation_accepted",
  "coaching_invitation_declined",
  "new_follower",
  "follow_request",
]);

export type NotificationListItemType = z.infer<typeof notificationListItemTypeSchema>;

export const notificationListItemSchema = z
  .object({
    id: z.string(),
    actor_id: z.string().optional(),
    created_at: z.string().default(""),
    is_read: z.boolean().optional(),
    read_at: z.string().nullable().optional(),
    type: z.string().optional(),
  })
  .passthrough();

export type NotificationListItem = z.infer<typeof notificationListItemSchema>;

export interface NotificationViewModel {
  actorId?: string;
  createdAt: string;
  id: string;
  isUnread: boolean;
  requiresFollowRequestAction: boolean;
  title: string;
  description: string;
  type?: string;
}

export function normalizeNotificationListItem(value: unknown): NotificationListItem | null {
  const parsed = notificationListItemSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function isNotificationUnread(notification: NotificationListItem): boolean {
  if (typeof notification.is_read === "boolean") {
    return !notification.is_read;
  }

  return !notification.read_at;
}

export function getUnreadNotificationIds(notifications: readonly NotificationListItem[]): string[] {
  return notifications
    .filter((notification) => isNotificationUnread(notification))
    .map((notification) => notification.id);
}

export function getNotificationViewModel(
  notification: NotificationListItem,
): NotificationViewModel {
  switch (notification.type) {
    case "new_message":
      return {
        actorId: notification.actor_id,
        createdAt: notification.created_at,
        id: notification.id,
        isUnread: isNotificationUnread(notification),
        requiresFollowRequestAction: false,
        title: "New Message",
        description: "You have a new message in your inbox.",
        type: notification.type,
      };
    case "coaching_invitation":
      return {
        actorId: notification.actor_id,
        createdAt: notification.created_at,
        id: notification.id,
        isUnread: isNotificationUnread(notification),
        requiresFollowRequestAction: false,
        title: "Coaching Invite",
        description: "You have received a new coaching invitation.",
        type: notification.type,
      };
    case "coaching_invitation_accepted":
      return {
        actorId: notification.actor_id,
        createdAt: notification.created_at,
        id: notification.id,
        isUnread: isNotificationUnread(notification),
        requiresFollowRequestAction: false,
        title: "Invitation Accepted",
        description: "Your coaching invitation was accepted.",
        type: notification.type,
      };
    case "coaching_invitation_declined":
      return {
        actorId: notification.actor_id,
        createdAt: notification.created_at,
        id: notification.id,
        isUnread: isNotificationUnread(notification),
        requiresFollowRequestAction: false,
        title: "Invitation Declined",
        description: "Your coaching invitation was declined.",
        type: notification.type,
      };
    case "new_follower":
      return {
        actorId: notification.actor_id,
        createdAt: notification.created_at,
        id: notification.id,
        isUnread: isNotificationUnread(notification),
        requiresFollowRequestAction: false,
        title: "New Follower",
        description: "Someone new started following you.",
        type: notification.type,
      };
    case "follow_request":
      return {
        actorId: notification.actor_id,
        createdAt: notification.created_at,
        id: notification.id,
        isUnread: isNotificationUnread(notification),
        requiresFollowRequestAction: true,
        title: "Follow Request",
        description: "Someone requested to follow you.",
        type: notification.type,
      };
    default:
      return {
        actorId: notification.actor_id,
        createdAt: notification.created_at,
        id: notification.id,
        isUnread: isNotificationUnread(notification),
        requiresFollowRequestAction: false,
        title: "Notification",
        description: "Tap to view details.",
        type: notification.type,
      };
  }
}
