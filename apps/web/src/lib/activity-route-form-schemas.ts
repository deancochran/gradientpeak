import {
  type ActivityEffortSport,
  activityEffortSportSchema,
  BestEffortSchema,
  type CanonicalSport,
  canonicalSportSchema,
} from "@repo/core";
import { z } from "zod";

export const activityTypeOptions = [
  { label: "Run", value: "run" },
  { label: "Ride", value: "bike" },
  { label: "Swim", value: "swim" },
  { label: "Strength", value: "strength" },
  { label: "Other", value: "other" },
] as const satisfies readonly { label: string; value: CanonicalSport }[];

export const activityEffortCategoryOptions = [
  { label: "Run", value: "run" },
  { label: "Ride", value: "bike" },
  { label: "Swim", value: "swim" },
] as const satisfies readonly { label: string; value: ActivityEffortSport }[];

export const routeUploadFormSchema = z.object({
  description: z.string(),
  name: z.string().trim().min(1, "Enter a route name."),
});

export const activityImportFormSchema = z.object({
  activityType: canonicalSportSchema,
  name: z.string().trim().min(1, "Enter a name for this imported activity."),
  notes: z.string(),
});

export const activityEffortFormSchema = BestEffortSchema.extend({
  activity_category: activityEffortSportSchema,
  duration_seconds: z.coerce.number().int().positive("Duration must be positive."),
  effort_type: z.enum(["power", "speed"]),
  recorded_at: z.string().min(1, "Choose when this effort was recorded."),
  unit: z.string().trim().min(1, "Enter a unit."),
  value: z.coerce.number().positive("Value must be positive."),
});

export type RouteUploadFormValues = z.infer<typeof routeUploadFormSchema>;
export type ActivityImportFormValues = z.infer<typeof activityImportFormSchema>;
export type ActivityEffortFormInput = z.input<typeof activityEffortFormSchema>;
export type ActivityEffortFormValues = z.infer<typeof activityEffortFormSchema>;
