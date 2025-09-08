import { z } from "zod";

export const controlSchema = z.object({
  type: z.enum(["grade", "resistance", "powerTarget"]).optional(), // expand as needed
  value: z.number(),
  unit: z.string().optional(), // e.g., %, watts, etc.
});
export type Control = z.infer<typeof controlSchema>;
