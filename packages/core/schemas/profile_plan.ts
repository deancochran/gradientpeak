import { z } from "zod";

export const weeklyTargetSchema = z.object({
  week: z.number().min(1),
  hours: z.number().nonnegative(),
  tss: z.number().nonnegative(),
});

export const profilePlanConfigSchema = z.object({
  version: z.string().default("1.0"),
  ramp_rate: z.number(),
  recovery_weeks: z.array(z.number().nonnegative()),
  test_weeks: z.array(z.number().nonnegative()),
  weekly_targets: z.array(weeklyTargetSchema),
});
export type ProfilePlanConfig = z.infer<typeof profilePlanConfigSchema>;
