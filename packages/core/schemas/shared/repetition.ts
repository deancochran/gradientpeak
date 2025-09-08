import { z } from "zod";

import { Step, stepSchema } from "./step";

export const repetitionSchema: z.ZodType<{
  repeat: number;
  steps: Step[];
}> = z.object({
  repeat: z.number().min(1),
  steps: z.array(stepSchema),
});

export type Repetition = z.infer<typeof repetitionSchema>;
