import { z } from "zod";

export const activityTypeOptions = [
  { label: "Run", value: "run" },
  { label: "Ride", value: "bike" },
  { label: "Swim", value: "swim" },
  { label: "Strength", value: "strength" },
  { label: "Other", value: "other" },
] as const;

export const routeUploadFormSchema = z.object({
  activityCategory: z.enum(["run", "bike", "swim", "strength", "other"]),
  description: z.string(),
  name: z.string().trim().min(1, "Enter a route name."),
});

export const activityImportFormSchema = z.object({
  activityType: z.enum(["run", "bike", "swim", "strength", "other"]),
  name: z.string().trim().min(1, "Enter a name for this imported activity."),
  notes: z.string(),
});

export const activityEffortFormSchema = z.object({
  activity_category: z.enum(["run", "bike", "swim", "strength", "other"]),
  duration_seconds: z.coerce.number().int().positive("Duration must be positive."),
  effort_type: z.enum(["power", "speed"]),
  recorded_at: z.string().min(1, "Choose when this effort was recorded."),
  unit: z.string().trim().min(1, "Enter a unit."),
  value: z.coerce.number().positive("Value must be positive."),
});

export type RouteUploadFormValues = z.infer<typeof routeUploadFormSchema>;
export type ActivityImportFormValues = z.infer<typeof activityImportFormSchema>;
export type ActivityEffortFormValues = z.infer<typeof activityEffortFormSchema>;
