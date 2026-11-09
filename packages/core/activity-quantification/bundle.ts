import { z } from "zod";

import { aggregateObservations, aggregatePrescriptions } from "./aggregate";
import {
  type ActivityObservationQuantification,
  type ActivityPrescriptionQuantification,
  type ActivityQuantification,
  type ActivityQuantificationLifecycle,
  type ActivityQuantificationSummaryScope,
  activityObservationQuantificationSchema,
  activityObservationSummarySchema,
  activityPrescriptionQuantificationSchema,
  activityPrescriptionSummarySchema,
  activityQuantificationSchema,
  aggregateActivityQuantificationSchema,
} from "./contracts";

function expectedSummary(input: {
  members: readonly ActivityQuantification[];
  lifecycle: ActivityQuantificationLifecycle;
  summaryScope: ActivityQuantificationSummaryScope;
}) {
  if (input.lifecycle === "prescription") {
    const members = input.members.map((member) => {
      if (member.kind !== "prescription") {
        throw new Error("A prescription bundle cannot contain observation members");
      }
      return member;
    });
    return aggregatePrescriptions(members, { summaryScope: input.summaryScope });
  }
  const members = input.members.map((member) => {
    if (member.kind !== "observation") {
      throw new Error("An observation bundle cannot contain prescription members");
    }
    return member;
  });
  return aggregateObservations(members, { summaryScope: input.summaryScope });
}

/** Serialized bundles are accepted only when the summary exactly covers their members. */
export const activityQuantificationBundleSchema = z
  .object({
    members: z.array(activityQuantificationSchema).max(10_000),
    summary: aggregateActivityQuantificationSchema,
  })
  .strict()
  .superRefine((bundle, context) => {
    try {
      const expected = expectedSummary({
        members: bundle.members,
        lifecycle: bundle.summary.lifecycle,
        summaryScope: bundle.summary.summaryScope,
      });
      if (JSON.stringify(bundle.summary) !== JSON.stringify(expected)) {
        context.addIssue({
          code: "custom",
          path: ["summary"],
          message: "Quantification bundle summary must be derived exactly from its members",
        });
      }
    } catch (error) {
      context.addIssue({
        code: "custom",
        path: ["members"],
        message:
          error instanceof Error ? error.message : "Quantification bundle members are invalid",
      });
    }
  });

export const activityPrescriptionQuantificationBundleSchema = z
  .object({
    members: z.array(activityPrescriptionQuantificationSchema).max(10_000),
    summary: activityPrescriptionSummarySchema,
  })
  .strict()
  .superRefine((bundle, context) => {
    if (bundle.summary.lifecycle !== "prescription") {
      context.addIssue({
        code: "custom",
        path: ["summary", "lifecycle"],
        message: "Prescription bundle summary must contain prescriptions",
      });
      return;
    }
    const canonical = activityQuantificationBundleSchema.safeParse(bundle);
    if (!canonical.success) {
      context.addIssue({
        code: "custom",
        message: "Prescription bundle summary must exactly cover its members",
      });
    }
  });

/**
 * A plan is one component aggregate: every member is a distinct authored
 * occurrence nested under the same stable plan (or its persisted event binding).
 */
export const activityPlanPrescriptionQuantificationBundleSchema = z
  .object({
    members: z.array(activityPrescriptionQuantificationSchema).min(1).max(10_000),
    summary: activityPrescriptionSummarySchema,
  })
  .strict()
  .superRefine((bundle, context) => {
    if (bundle.summary.summaryScope !== "components") {
      context.addIssue({
        code: "custom",
        path: ["summary", "summaryScope"],
        message: "An activity plan quantification must be a component bundle",
      });
    }
    if (
      bundle.summary.subjectIdentity.subjectType !== "plan" &&
      bundle.summary.subjectIdentity.subjectType !== "plan_preview" &&
      bundle.summary.subjectIdentity.subjectType !== "scheduled_event"
    ) {
      context.addIssue({
        code: "custom",
        path: ["summary", "subjectIdentity"],
        message: "An activity plan component bundle requires one stable plan subject",
      });
    }
    const stages = new Set(bundle.members.map((member) => member.stage));
    if (stages.size !== 1) {
      context.addIssue({
        code: "custom",
        path: ["members"],
        message: "Activity plan occurrence members must share one prescription stage",
      });
    }
    for (const [index, member] of bundle.members.entries()) {
      if (member.subjectIdentity.subjectType !== "plan_occurrence") {
        context.addIssue({
          code: "custom",
          path: ["members", index, "subjectIdentity"],
          message: "Activity plan members require nested plan-occurrence subjects",
        });
      }
      const scheduled = bundle.summary.subjectIdentity.subjectType === "scheduled_event";
      if ((member.stage === "scheduled") !== scheduled) {
        context.addIssue({
          code: "custom",
          path: ["members", index, "stage"],
          message: "Scheduled stage must agree with the persisted event subject",
        });
      }
    }
    const canonical = activityPrescriptionQuantificationBundleSchema.safeParse(bundle);
    if (!canonical.success) {
      context.addIssue({
        code: "custom",
        message: "Activity plan component summary must exactly cover its occurrences",
      });
    }
  });

export const activityObservationQuantificationBundleSchema = z
  .object({
    members: z.array(activityObservationQuantificationSchema).max(10_000),
    summary: activityObservationSummarySchema,
  })
  .strict()
  .superRefine((bundle, context) => {
    if (bundle.summary.lifecycle !== "observation") {
      context.addIssue({
        code: "custom",
        path: ["summary", "lifecycle"],
        message: "Observation bundle summary must contain observations",
      });
      return;
    }
    const canonical = activityQuantificationBundleSchema.safeParse(bundle);
    if (!canonical.success) {
      context.addIssue({
        code: "custom",
        message: "Observation bundle summary must exactly cover its members",
      });
    }
  });

export type ActivityQuantificationBundle = z.infer<typeof activityQuantificationBundleSchema>;

export type ActivityPrescriptionQuantificationBundle = z.infer<
  typeof activityPrescriptionQuantificationBundleSchema
>;

export type ActivityPlanPrescriptionQuantificationBundle = z.infer<
  typeof activityPlanPrescriptionQuantificationBundleSchema
>;

export type ActivityObservationQuantificationBundle = z.infer<
  typeof activityObservationQuantificationBundleSchema
>;

export function createPrescriptionQuantificationBundle(input: {
  members: readonly ActivityPrescriptionQuantification[];
  summaryScope?: ActivityQuantificationSummaryScope | undefined;
}): ActivityPrescriptionQuantificationBundle {
  // aggregatePrescriptions performs full member validation. Serialized/untrusted
  // bundles still use the exhaustive schema above, so the constructor need not
  // immediately parse and re-aggregate its own canonical result.
  const prescriptions = [...input.members];
  const summary = aggregatePrescriptions(prescriptions, {
    summaryScope: input.summaryScope ?? "collection",
  });
  return { members: prescriptions, summary };
}

export function createObservationQuantificationBundle(input: {
  members: readonly ActivityObservationQuantification[];
  summaryScope?: ActivityQuantificationSummaryScope | undefined;
}): ActivityObservationQuantificationBundle {
  // aggregateObservations is the validating constructor path. Avoid validating
  // and aggregating the same canonical members a second time.
  const observations = [...input.members];
  const summary = aggregateObservations(observations, {
    summaryScope: input.summaryScope ?? "collection",
  });
  return { members: observations, summary };
}

export function createActivityPlanPrescriptionQuantificationBundle(input: {
  members: readonly ActivityPrescriptionQuantification[];
}): ActivityPlanPrescriptionQuantificationBundle {
  const members = [...input.members];
  const first = members[0];
  if (!first || first.subjectIdentity.subjectType !== "plan_occurrence") {
    throw new Error("An activity plan requires at least one plan-occurrence component");
  }
  const parentSubjectIdentity = first.subjectIdentity.parentSubjectIdentity;
  const scheduled = parentSubjectIdentity.subjectType === "scheduled_event";
  for (const member of members) {
    if (
      member.subjectIdentity.subjectType !== "plan_occurrence" ||
      member.subjectIdentity.parentSubjectIdentity.fingerprint !== parentSubjectIdentity.fingerprint
    ) {
      throw new Error("Activity plan occurrences must share one plan parent subject");
    }
    if (member.stage !== first.stage || (member.stage === "scheduled") !== scheduled) {
      throw new Error("Activity plan occurrences must share their parent prescription stage");
    }
  }
  return {
    members,
    summary: aggregatePrescriptions(members, { summaryScope: "components" }),
  };
}

/** Core-owned constructor; a caller supplies members, never an independent summary. */
export function createActivityQuantificationBundle(input: {
  members: readonly ActivityQuantification[];
  lifecycle?: ActivityQuantificationLifecycle | undefined;
  summaryScope?: ActivityQuantificationSummaryScope | undefined;
}): ActivityQuantificationBundle {
  const members = [...input.members];
  const lifecycles = new Set(members.map((member) => member.kind));
  if (lifecycles.size > 1) {
    throw new Error("A quantification bundle cannot mix prescriptions and observations");
  }
  const lifecycle = members[0]?.kind ?? input.lifecycle;
  if (lifecycle === undefined) {
    throw new Error("An empty quantification bundle requires an explicit lifecycle");
  }
  if (input.lifecycle !== undefined && input.lifecycle !== lifecycle) {
    throw new Error("Quantification bundle lifecycle does not match its members");
  }
  const summary = expectedSummary({
    members,
    lifecycle,
    summaryScope: input.summaryScope ?? "collection",
  });
  return { members, summary };
}
