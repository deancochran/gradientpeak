import {
  type ActivityObservationQuantification,
  type ActivityObservationQuantificationBundle,
  type ActivityPlanPrescriptionQuantificationBundle,
  type ActivityPrescriptionQuantification,
  activityObservationQuantificationBundleSchema,
  activityPlanPrescriptionQuantificationBundleSchema,
  activityPrescriptionQuantificationBundleSchema,
  comparePlannedToCompleted,
  createObservationQuantificationBundle,
  createPrescriptionQuantificationBundle,
  plannedVsCompletedComparisonSchema,
} from "@repo/core";
import { commonLoadAggregateSchema, commonLoadResultSchema } from "@repo/core/load";
import {
  composeEffectivePlanLoad,
  type EffectiveCompositionInput,
  effectiveLoadAggregateSchema,
} from "@repo/core/training-timeline";
import { z } from "zod";

const identitySchema = z.string().trim().min(1).max(256);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const commonLoadEnvelopeSchema = z.union([commonLoadResultSchema, commonLoadAggregateSchema]);
const lifecycleQuantificationsSchema = z
  .object({
    prescriptions: activityPrescriptionQuantificationBundleSchema.nullable(),
    observations: activityObservationQuantificationBundleSchema.nullable(),
    comparison: plannedVsCompletedComparisonSchema.nullable(),
  })
  .strict();
const quantifiedCompositionItemSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("scheduled"),
      scheduledItemId: identitySchema,
      date: dateSchema,
      commonLoad: commonLoadEnvelopeSchema,
      prescriptionQuantification: activityPlanPrescriptionQuantificationBundleSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("completed"),
      completedActivityId: identitySchema,
      date: dateSchema,
      replacedScheduledItemId: identitySchema.nullable(),
      commonLoad: commonLoadEnvelopeSchema,
      observationQuantification: activityObservationQuantificationBundleSchema,
    })
    .strict(),
]);

export type QuantifiedEffectiveCompositionInput = Omit<
  EffectiveCompositionInput,
  "scheduledItems" | "completedActivities"
> & {
  scheduledItems: Array<
    Omit<EffectiveCompositionInput["scheduledItems"][number], "commonLoad"> & {
      prescriptionQuantification: ActivityPlanPrescriptionQuantificationBundle;
    }
  >;
  completedActivities: Array<
    Omit<EffectiveCompositionInput["completedActivities"][number], "commonLoad"> & {
      observationQuantification: ActivityObservationQuantificationBundle;
    }
  >;
};

export const effectivePlanCompositionDtoSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("available"),
      periodStartDate: z.string(),
      periodEndDate: z.string(),
      planningDate: z.string(),
      firmItems: z.array(quantifiedCompositionItemSchema),
      firm: effectiveLoadAggregateSchema,
      lifecycleQuantifications: lifecycleQuantificationsSchema,
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

/** Shared API projection for mobile and web. */
export function composeEffectivePlanDto(
  input: QuantifiedEffectiveCompositionInput,
): EffectivePlanCompositionDto {
  const normalizedScheduledItems = input.scheduledItems.map((item) => ({
    ...item,
    prescriptionQuantification: activityPlanPrescriptionQuantificationBundleSchema.parse(
      item.prescriptionQuantification,
    ),
  }));
  const normalizedCompletedActivities = input.completedActivities.map((item) => ({
    ...item,
    observationQuantification: activityObservationQuantificationBundleSchema.parse(
      item.observationQuantification,
    ),
  }));
  const scheduledById = new Map(
    normalizedScheduledItems.map((item) => [item.scheduledItemId, item] as const),
  );
  const completedById = new Map(
    normalizedCompletedActivities.map((item) => [item.completedActivityId, item] as const),
  );
  const composition = composeEffectivePlanLoad({
    ...input,
    scheduledItems: normalizedScheduledItems.map(({ prescriptionQuantification, ...item }) => ({
      ...item,
      commonLoad: prescriptionQuantification.summary.commonLoad,
    })),
    completedActivities: normalizedCompletedActivities.map(
      ({ observationQuantification, ...item }) => ({
        ...item,
        commonLoad: observationQuantification.summary.commonLoad,
      }),
    ),
  });
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
  const enrich = (item: (typeof composition.items)[number]) => {
    const { loadStatus: _loadStatus, ...publicItem } = item;
    if (item.kind === "scheduled") {
      const source = scheduledById.get(item.scheduledItemId);
      if (!source) throw new Error("Effective composition item lost its prescription source");
      return { ...publicItem, prescriptionQuantification: source.prescriptionQuantification };
    }
    const source = completedById.get(item.completedActivityId);
    if (!source) throw new Error("Effective composition item lost its observation source");
    return { ...publicItem, observationQuantification: source.observationQuantification };
  };
  const lifecycleMembers = (items: typeof composition.items) => {
    const prescriptions: ActivityPrescriptionQuantification[] = [];
    const observations: ActivityObservationQuantification[] = [];
    for (const item of items) {
      if (item.kind === "scheduled") {
        const source = scheduledById.get(item.scheduledItemId);
        if (!source) throw new Error("Effective composition item lost its prescription source");
        prescriptions.push(...source.prescriptionQuantification.members);
      } else {
        const source = completedById.get(item.completedActivityId);
        if (!source) throw new Error("Effective composition item lost its observation source");
        observations.push(...source.observationQuantification.members);
      }
      if (item.kind === "completed" && item.replacedScheduledItemId !== null) {
        const replaced = scheduledById.get(item.replacedScheduledItemId);
        if (!replaced) continue;
        prescriptions.push(...replaced.prescriptionQuantification.members);
      }
    }
    return { prescriptions, observations };
  };
  const summarizeLifecycles = (members: ReturnType<typeof lifecycleMembers>) => {
    const prescriptions =
      members.prescriptions.length === 0
        ? null
        : createPrescriptionQuantificationBundle({ members: members.prescriptions });
    const observations =
      members.observations.length === 0
        ? null
        : createObservationQuantificationBundle({ members: members.observations });
    return {
      prescriptions,
      observations,
      comparison:
        prescriptions === null && observations === null ? null : comparePlannedToCompleted(members),
    };
  };
  const lifecycleQuantifications = summarizeLifecycles(lifecycleMembers(composition.items));
  return effectivePlanCompositionDtoSchema.parse({
    status: "available",
    periodStartDate: composition.periodStartDate,
    periodEndDate: composition.periodEndDate,
    planningDate: composition.planningDate,
    firmItems: composition.items.map(enrich),
    firm: composition.aggregate,
    lifecycleQuantifications,
  });
}
