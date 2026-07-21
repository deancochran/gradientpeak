import { type ActivityEffortSport, activityEffortSportSchema, BestEffortSchema } from "@repo/core";
import { activityEffortTypeSchema } from "@repo/core/athlete-inputs";
import { z } from "zod";

export const activityEffortCategoryOptions = [
  { label: "Run", value: "run" },
  { label: "Ride", value: "bike" },
  { label: "Swim", value: "swim" },
] as const satisfies readonly { label: string; value: ActivityEffortSport }[];

export const activityEffortFormSchema = BestEffortSchema.extend({
  activity_category: activityEffortSportSchema,
  duration_seconds: z.coerce.number().int().positive("Duration must be positive."),
  effort_type: activityEffortTypeSchema,
  recorded_at: z.string().min(1, "Choose when this effort was recorded."),
  unit: z.string().trim().min(1, "Enter a unit."),
  value: z.coerce.number().positive("Value must be positive."),
});

export type ActivityEffortFormInput = z.input<typeof activityEffortFormSchema>;
export type ActivityEffortFormValues = z.infer<typeof activityEffortFormSchema>;
