import { z } from "zod";

export const MarkNotificationReadSchema = z.object({
  notification_ids: z.array(z.string().uuid()).min(1).max(100),
});
export type MarkNotificationRead = z.infer<typeof MarkNotificationReadSchema>;
