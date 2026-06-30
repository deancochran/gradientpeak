import { z } from "zod";

export const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const planningScheduleSchema = z
  .object({
    startDate: dateOnlySchema,
    preferredWeekdays: z.array(z.number().int().min(0).max(6)).max(7),
    sessionDateOverrides: z.record(z.string().min(1), dateOnlySchema),
  })
  .strict();

export type PlanningSchedule = z.infer<typeof planningScheduleSchema>;
