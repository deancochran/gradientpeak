import { z } from "zod";

export const durationSchema = z.object({
  type: z.enum(["time", "distance", "repetitions"]),
  value: z.number().nonnegative(),
  unit: z.string().optional(), // e.g., "seconds", "meters", "reps"
});
export type Duration = z.infer<typeof durationSchema>;
