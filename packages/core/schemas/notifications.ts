import { z } from "zod";

export const NotificationTypeSchema = z.enum([
  "new_message",
  "coaching_invitation",
  "coaching_invitation_accepted",
  "coaching_invitation_declined",
  "new_follower",
  "follow_request",
]);
export type NotificationType = z.infer<typeof NotificationTypeSchema>;

export const NotificationSchema = z.object({
  actor_id: z.string().uuid(),
  created_at: z.string(),
  entity_id: z.string().uuid().nullable().optional(),
  id: z.string().uuid(),
  read_at: z.string().nullable(),
  type: NotificationTypeSchema,
  user_id: z.string().uuid(),
});
export type Notification = z.infer<typeof NotificationSchema>;

export const MarkNotificationReadSchema = z.object({
  notification_ids: z.array(z.string().uuid()),
});
export type MarkNotificationRead = z.infer<typeof MarkNotificationReadSchema>;
