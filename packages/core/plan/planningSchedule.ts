import { z } from "zod";
import { dateOnlySchema } from "../schemas/date-only";

export { dateOnlySchema } from "../schemas/date-only";

export const planningScheduleSchema = z
  .object({
    startDate: dateOnlySchema,
    preferredWeekdays: z.array(z.number().int().min(0).max(6)).max(7),
    sessionDateOverrides: z.record(z.string().min(1), dateOnlySchema),
  })
  .strict();

export type PlanningSchedule = z.infer<typeof planningScheduleSchema>;
