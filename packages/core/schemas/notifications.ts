import { z } from "zod";

export const MarkNotificationReadSchema = z.object({
  notification_ids: z.array(z.string().uuid()),
});
export type MarkNotificationRead = z.infer<typeof MarkNotificationReadSchema>;
