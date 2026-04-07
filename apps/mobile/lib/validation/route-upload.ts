import { z } from "zod";

export const routeUploadActivityCategories = ["run", "bike", "swim", "strength", "other"] as const;

export const routeUploadActivityCategoryOptions = [
  { value: "run", label: "Run" },
  { value: "bike", label: "Bike" },
  { value: "swim", label: "Swim" },
  { value: "strength", label: "Strength" },
  { value: "other", label: "Other" },
] as const;

export const routeUploadFormSchema = z.object({
  name: z.string().trim().min(1, "Please enter a route name").max(100),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  activityCategory: z.enum(routeUploadActivityCategories),
  fileName: z.string().min(1, "Please select a GPX file"),
  fileContent: z.string().min(1, "Please select a GPX file"),
});

export type RouteUploadFormValues = z.infer<typeof routeUploadFormSchema>;
