import { z } from "zod";

export const canonicalSportSchema = z.enum([
  "run",
  "bike",
  "swim",
  "strength",
  "other",
]);

export const planningSportSchema = z.union([
  canonicalSportSchema,
  z.literal("mixed"),
]);

export type CanonicalSport = z.infer<typeof canonicalSportSchema>;
export type PlanningSport = z.infer<typeof planningSportSchema>;
