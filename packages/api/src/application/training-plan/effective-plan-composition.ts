import { commonLoadAggregateSchema } from "@repo/core/load";
import {
  composeEffectivePlanLoad,
  type EffectiveCompositionInput,
  effectiveCompositionItemSchema,
  effectiveLoadAggregateSchema,
} from "@repo/core/training-timeline";
import { z } from "zod";

export const effectivePlanCompositionDtoSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("available"),
      periodStartDate: z.string(),
      periodEndDate: z.string(),
      planningDate: z.string(),
      firmItems: z.array(effectiveCompositionItemSchema),
      tentativeItems: z.array(effectiveCompositionItemSchema),
      firm: effectiveLoadAggregateSchema,
      tentative: commonLoadAggregateSchema,
      includingTentative: effectiveLoadAggregateSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal("integrity_unavailable"),
      reason: z.literal("duplicate_activity_to_scheduled_links"),
      periodStartDate: z.string(),
      periodEndDate: z.string(),
      planningDate: z.string(),
      duplicateLinks: z.array(
        z
          .object({
            completedActivityId: z.string(),
            scheduledItemIds: z.array(z.string()).min(2),
          })
          .strict(),
      ),
    })
    .strict(),
]);

export type EffectivePlanCompositionDto = z.infer<typeof effectivePlanCompositionDtoSchema>;

/** Shared API projection for mobile and web; firm and tentative availability never share a default. */
export function composeEffectivePlanDto(
  input: EffectiveCompositionInput,
): EffectivePlanCompositionDto {
  const composition = composeEffectivePlanLoad(input);
  if (composition.status === "integrity_unavailable") {
    return effectivePlanCompositionDtoSchema.parse({
      status: composition.status,
      reason: composition.reason,
      periodStartDate: composition.periodStartDate,
      periodEndDate: composition.periodEndDate,
      planningDate: composition.planningDate,
      duplicateLinks: composition.duplicateLinks,
    });
  }
  return effectivePlanCompositionDtoSchema.parse({
    status: "available",
    periodStartDate: composition.periodStartDate,
    periodEndDate: composition.periodEndDate,
    planningDate: composition.planningDate,
    firmItems: composition.items,
    tentativeItems: composition.tentativeItems,
    firm: composition.aggregate,
    tentative: composition.tentativeAggregate,
    includingTentative: composition.includingTentativeAggregate,
  });
}
