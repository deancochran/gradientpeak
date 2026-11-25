import { z } from "zod";

import { type SourceId, sourceIdSchema } from "./lineage";
import { type Uncertainty, uncertaintySchema } from "./uncertainty";

export const calculationResultStateSchema = z.enum([
  "observed",
  "estimated",
  "unknown",
  "insufficient_evidence",
  "unsupported",
]);

export const missingDataStateSchema = z.enum([
  "none",
  "partial",
  "required_data_missing",
  "incompatible_data",
  "unsupported_input",
]);

export const calculationReasonCodeSchema = z.string().regex(/^[a-z][a-z0-9_]*$/);

export type CalculationResultState = z.infer<typeof calculationResultStateSchema>;
export type MissingDataState = z.infer<typeof missingDataStateSchema>;
export type CalculationReasonCode = z.infer<typeof calculationReasonCodeSchema>;

export const calculationResultSchema = z
  .object({
    estimate: z.number().finite().nullable(),
    unit: z.string().min(1).nullable(),
    uncertainty: uncertaintySchema,
    state: calculationResultStateSchema,
    missingDataState: missingDataStateSchema,
    reasonCodes: z.array(calculationReasonCodeSchema),
    contributingSourceIds: z.array(sourceIdSchema),
  })
  .strict()
  .superRefine((result, context) => {
    const hasEstimateAndUnit = result.estimate !== null && result.unit !== null;
    const hasReasons = result.reasonCodes.length > 0;
    const hasSources = result.contributingSourceIds.length > 0;

    if (result.state === "observed") {
      if (!hasEstimateAndUnit || !hasSources || result.missingDataState !== "none") {
        context.addIssue({
          code: "custom",
          message: "Observed results require a value, unit, source, and no missing data",
        });
      }
      return;
    }

    if (result.state === "estimated") {
      if (!hasEstimateAndUnit || !hasReasons || !hasSources || result.missingDataState !== "none") {
        context.addIssue({
          code: "custom",
          message: "Estimated results require a value, unit, reasons, sources, and no missing data",
        });
      }
      return;
    }

    if (result.estimate !== null || result.unit !== null || !hasReasons) {
      context.addIssue({
        code: "custom",
        message: "Unavailable results require null value and unit plus at least one reason",
      });
    }

    if (result.state === "unknown" && result.missingDataState === "none") {
      context.addIssue({ code: "custom", message: "Unknown results require missing data" });
    }

    if (
      result.state === "insufficient_evidence" &&
      result.missingDataState !== "partial" &&
      result.missingDataState !== "required_data_missing"
    ) {
      context.addIssue({
        code: "custom",
        message: "Insufficient evidence requires partial or required missing data",
      });
    }

    if (
      result.state === "unsupported" &&
      result.missingDataState !== "unsupported_input" &&
      result.missingDataState !== "incompatible_data"
    ) {
      context.addIssue({
        code: "custom",
        message: "Unsupported results require unsupported or incompatible input",
      });
    }
  });

export type CalculationResult = z.infer<typeof calculationResultSchema>;

export function observedResult(input: {
  rawValue: number;
  unit: string;
  sourceId: SourceId;
  uncertainty: Uncertainty;
  reasonCodes?: readonly CalculationReasonCode[];
}): CalculationResult {
  return calculationResultSchema.parse({
    estimate: input.rawValue,
    unit: input.unit,
    uncertainty: input.uncertainty,
    state: "observed",
    missingDataState: "none",
    reasonCodes: input.reasonCodes ?? [],
    contributingSourceIds: [input.sourceId],
  });
}

export function estimatedResult(input: {
  estimate: number;
  unit: string;
  uncertainty: Uncertainty;
  reasonCodes: readonly [CalculationReasonCode, ...CalculationReasonCode[]];
  contributingSourceIds: readonly [SourceId, ...SourceId[]];
}): CalculationResult {
  return calculationResultSchema.parse({
    ...input,
    state: "estimated",
    missingDataState: "none",
    reasonCodes: [...input.reasonCodes],
    contributingSourceIds: [...input.contributingSourceIds],
  });
}

export function unavailableResult(input: {
  state: "unknown" | "insufficient_evidence" | "unsupported";
  missingDataState: Exclude<MissingDataState, "none">;
  uncertainty: Uncertainty;
  reasonCodes: readonly [CalculationReasonCode, ...CalculationReasonCode[]];
  contributingSourceIds?: readonly SourceId[];
}): CalculationResult {
  return calculationResultSchema.parse({
    estimate: null,
    unit: null,
    ...input,
    reasonCodes: [...input.reasonCodes],
    contributingSourceIds: [...(input.contributingSourceIds ?? [])],
  });
}
