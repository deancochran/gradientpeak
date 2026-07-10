import { z } from "zod";

/**
 * Uncertainty is a normalized decision-quality measure.
 * 0 means low decision uncertainty.
 * 1 means high decision uncertainty.
 * It is not a probability, likelihood, confidence interval, or calibrated
 * outcome forecast.
 */
export const uncertaintySchema = z.number().finite().min(0).max(1);

export type Uncertainty = z.infer<typeof uncertaintySchema>;

export function parseUncertainty(value: number): Uncertainty {
  return uncertaintySchema.parse(value);
}
