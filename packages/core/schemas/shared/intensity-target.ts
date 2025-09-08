import { z } from "zod";

export const intensityTargetSchema = z.object({
  type: z.enum([
    "%FTP",
    "%MaxHR",
    "%ThresholdHR",
    "watts",
    "bpm",
    "speed",
    "cadence",
    "RPE",
  ]),
  min: z.number().optional(),
  max: z.number().optional(),
  target: z.number().optional(),
});
export type IntensityTarget = z.infer<typeof intensityTargetSchema>;
