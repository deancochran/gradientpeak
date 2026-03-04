import {
  publicNotificationsRowSchema,
  publicNotificationTypeSchema,
} from "@repo/supabase";
import { z } from "zod";

export const NotificationTypeSchema = publicNotificationTypeSchema;
export type NotificationType = z.infer<typeof NotificationTypeSchema>;

export const NotificationSchema = publicNotificationsRowSchema;
export type Notification = z.infer<typeof NotificationSchema>;

export const MarkNotificationReadSchema = z.object({
  notification_ids: z.array(z.string().uuid()),
});
export type MarkNotificationRead = z.infer<typeof MarkNotificationReadSchema>;
