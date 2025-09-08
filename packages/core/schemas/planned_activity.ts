import { z } from "zod";
import { repetitionSchema } from "./shared/repetition";
import { stepSchema } from "./shared/step";

export const plannedActivityStructureSchema = z.object({
  version: z.string().default("1.0"),
  name: z.string(),
  description: z.string().optional(),
  steps: z.array(z.union([stepSchema, repetitionSchema])),
});
export type PlannedActivityStructure = z.infer<
  typeof plannedActivityStructureSchema
>;
