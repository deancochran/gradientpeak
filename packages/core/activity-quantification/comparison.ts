import { z } from "zod";

import { aggregateObservations, aggregatePrescriptions } from "./aggregate";
import type {
  ActivityObservationQuantification,
  ActivityPrescriptionQuantification,
} from "./contracts";
import { aggregateActivityQuantificationSchema } from "./contracts";

const prescriptionSummarySchema = aggregateActivityQuantificationSchema.refine(
  (summary) => summary.lifecycle === "prescription",
  { message: "Planned comparison summary must contain prescriptions" },
);
const observationSummarySchema = aggregateActivityQuantificationSchema.refine(
  (summary) => summary.lifecycle === "observation",
  { message: "Completed comparison summary must contain observations" },
);

export const plannedVsCompletedComparisonSchema = z
  .object({
    kind: z.literal("planned_vs_completed_comparison"),
    prescriptions: prescriptionSummarySchema,
    observations: observationSummarySchema,
    commonLoadDelta: z.number().finite().nullable(),
  })
  .strict();

export type PlannedVsCompletedComparison = z.infer<typeof plannedVsCompletedComparisonSchema>;

function numericLoad(
  summary: ReturnType<typeof aggregatePrescriptions> | ReturnType<typeof aggregateObservations>,
): number | null {
  return summary.commonLoad.status === "unavailable" ? null : summary.commonLoad.load;
}

/**
 * Planned and completed work retain separate lifecycle summaries. This is a
 * comparison operation, never a mixed aggregate.
 */
export function comparePlannedToCompleted(input: {
  prescriptions: readonly ActivityPrescriptionQuantification[];
  observations: readonly ActivityObservationQuantification[];
}): PlannedVsCompletedComparison {
  const prescriptions = aggregatePrescriptions(input.prescriptions);
  const observations = aggregateObservations(input.observations);
  const prescribedLoad = numericLoad(prescriptions);
  const observedLoad = numericLoad(observations);
  return plannedVsCompletedComparisonSchema.parse({
    kind: "planned_vs_completed_comparison",
    prescriptions,
    observations,
    commonLoadDelta:
      prescribedLoad === null || observedLoad === null ? null : observedLoad - prescribedLoad,
  });
}
