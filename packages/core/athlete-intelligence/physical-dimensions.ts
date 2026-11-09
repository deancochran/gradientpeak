import { z } from "zod";

/** Ordered consistently wherever physical requirements and capability are compared. */
export const physicalDimensionOrder = [
  "threshold",
  "speed",
  "distance",
  "duration",
  "frequency",
] as const;

export const physicalDimensionSchema = z.enum(physicalDimensionOrder);

export type PhysicalDimension = z.infer<typeof physicalDimensionSchema>;
