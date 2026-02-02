import { z } from "zod";

export const NotificationSchema = z.object({
  id: z.string().uuid().optional(), // Optional for creation
  profile_id: z.string().uuid(),
  title: z.string().min(1),
  message: z.string().min(1),
  is_read: z.boolean().default(false),
  created_at: z.string().datetime().optional(), // Optional for creation
});

export type Notification = z.infer<typeof NotificationSchema>;
