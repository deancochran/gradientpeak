import { z } from "zod";
import { controlSchema } from "./controls";
import { durationSchema } from "./duration";
import { intensityTargetSchema } from "./intensity-target";

export const stepSchema: z.ZodType<any> = z.lazy(() =>
  z.object({
    type: z.literal("Step").optional(),
    name: z.string().optional(),
    intensityClass: z.enum(["WarmUp", "Active", "Rest", "CoolDown"]).optional(),
    intensityDescription: z.string().optional(), // new field for display info
    duration: durationSchema,
    intensity: intensityTargetSchema.optional(),
    cadenceTarget: intensityTargetSchema.optional(),
    notes: z.string().optional(),
    openDuration: z.boolean().optional(),
    controls: z.array(controlSchema).optional(),
  }),
);

export type Step = z.infer<typeof stepSchema>;
