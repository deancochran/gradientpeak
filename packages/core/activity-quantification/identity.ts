import { z } from "zod";

const ACTIVITY_QUANTIFICATION_IDENTITY_ALGORITHM = "canonical-json-fnv1a64-v1";

const activityQuantificationIdentitySchema = z
  .object({
    algorithm: z.literal(ACTIVITY_QUANTIFICATION_IDENTITY_ALGORITHM),
    fingerprint: z.string().regex(/^activity-quantification:v1:fnv1a64:[0-9a-f]{16}$/),
  })
  .strict();

type ActivityQuantificationIdentity = z.infer<typeof activityQuantificationIdentitySchema>;

const identityFields = {
  algorithm: z.literal(ACTIVITY_QUANTIFICATION_IDENTITY_ALGORITHM),
  fingerprint: z.string().regex(/^activity-quantification:v1:fnv1a64:[0-9a-f]{16}$/),
};

export const activityQuantificationPlanSubjectIdentitySchema = z
  .object({
    role: z.literal("subject"),
    subjectType: z.literal("plan"),
    planId: z.string().trim().min(1),
    ...identityFields,
  })
  .strict()
  .superRefine((identity, context) => {
    const expected = createActivityQuantificationIdentity({
      role: identity.role,
      subjectType: identity.subjectType,
      planId: identity.planId,
    });
    if (identity.fingerprint !== expected.fingerprint) {
      context.addIssue({
        code: "custom",
        path: ["fingerprint"],
        message: "Plan subject fingerprint does not match its readable identity",
      });
    }
  });

export const activityQuantificationPlanPreviewSubjectIdentitySchema = z
  .object({
    role: z.literal("subject"),
    subjectType: z.literal("plan_preview"),
    previewId: z.string().trim().min(1),
    ...identityFields,
  })
  .strict()
  .superRefine((identity, context) => {
    const expected = createActivityQuantificationIdentity({
      role: identity.role,
      subjectType: identity.subjectType,
      previewId: identity.previewId,
    });
    if (identity.fingerprint !== expected.fingerprint) {
      context.addIssue({
        code: "custom",
        path: ["fingerprint"],
        message: "Plan-preview subject fingerprint does not match its readable identity",
      });
    }
  });

export const activityQuantificationStablePlanSubjectIdentitySchema = z.union([
  activityQuantificationPlanSubjectIdentitySchema,
  activityQuantificationPlanPreviewSubjectIdentitySchema,
]);

export const activityQuantificationScheduledEventSubjectIdentitySchema = z
  .object({
    role: z.literal("subject"),
    subjectType: z.literal("scheduled_event"),
    eventId: z.string().trim().min(1),
    planSubjectIdentity: activityQuantificationStablePlanSubjectIdentitySchema,
    ...identityFields,
  })
  .strict()
  .superRefine((identity, context) => {
    const expected = createActivityQuantificationIdentity({
      role: identity.role,
      subjectType: identity.subjectType,
      eventId: identity.eventId,
      planSubjectFingerprint: identity.planSubjectIdentity.fingerprint,
    });
    if (identity.fingerprint !== expected.fingerprint) {
      context.addIssue({
        code: "custom",
        path: ["fingerprint"],
        message: "Scheduled-event subject fingerprint does not match its readable identity",
      });
    }
  });

export const activityQuantificationPlanOccurrenceParentSubjectIdentitySchema = z.union([
  activityQuantificationStablePlanSubjectIdentitySchema,
  activityQuantificationScheduledEventSubjectIdentitySchema,
]);

export const activityQuantificationPlanOccurrenceSubjectIdentitySchema = z
  .object({
    role: z.literal("subject"),
    subjectType: z.literal("plan_occurrence"),
    occurrenceId: z.string().trim().min(1),
    parentSubjectIdentity: activityQuantificationPlanOccurrenceParentSubjectIdentitySchema,
    ...identityFields,
  })
  .strict()
  .superRefine((identity, context) => {
    const expected = createActivityQuantificationIdentity({
      role: identity.role,
      subjectType: identity.subjectType,
      occurrenceId: identity.occurrenceId,
      parentSubjectFingerprint: identity.parentSubjectIdentity.fingerprint,
    });
    if (identity.fingerprint !== expected.fingerprint) {
      context.addIssue({
        code: "custom",
        path: ["fingerprint"],
        message: "Plan-occurrence subject fingerprint does not match its readable identity",
      });
    }
  });

export const activityQuantificationActivitySubjectIdentitySchema = z
  .object({
    role: z.literal("subject"),
    subjectType: z.literal("activity"),
    activityId: z.string().trim().min(1),
    ...identityFields,
  })
  .strict()
  .superRefine((identity, context) => {
    const expected = createActivityQuantificationIdentity({
      role: identity.role,
      subjectType: identity.subjectType,
      activityId: identity.activityId,
    });
    if (identity.fingerprint !== expected.fingerprint) {
      context.addIssue({
        code: "custom",
        path: ["fingerprint"],
        message: "Activity subject fingerprint does not match its readable identity",
      });
    }
  });

export const activityQuantificationParentSubjectIdentitySchema = z.union([
  activityQuantificationPlanSubjectIdentitySchema,
  activityQuantificationPlanPreviewSubjectIdentitySchema,
  activityQuantificationScheduledEventSubjectIdentitySchema,
  activityQuantificationActivitySubjectIdentitySchema,
]);

export const activityQuantificationSegmentSubjectIdentitySchema = z
  .object({
    role: z.literal("subject"),
    subjectType: z.literal("segment"),
    segmentId: z.string().trim().min(1),
    parentSubjectIdentity: activityQuantificationParentSubjectIdentitySchema,
    ...identityFields,
  })
  .strict()
  .superRefine((identity, context) => {
    const expected = createActivityQuantificationIdentity({
      role: identity.role,
      subjectType: identity.subjectType,
      segmentId: identity.segmentId,
      parentSubjectFingerprint: identity.parentSubjectIdentity.fingerprint,
    });
    if (identity.fingerprint !== expected.fingerprint) {
      context.addIssue({
        code: "custom",
        path: ["fingerprint"],
        message: "Segment subject fingerprint does not match its readable identity",
      });
    }
  });

export const activityQuantificationCollectionSubjectIdentitySchema = z
  .object({
    role: z.literal("subject"),
    subjectType: z.literal("collection"),
    lifecycle: z.enum(["prescription", "observation"]),
    memberSubjectFingerprints: z
      .array(identityFields.fingerprint)
      .max(10_000)
      .refine((fingerprints) => new Set(fingerprints).size === fingerprints.length, {
        message: "Collection subject members must be unique",
      }),
    ...identityFields,
  })
  .strict()
  .superRefine((identity, context) => {
    const sortedFingerprints = [...identity.memberSubjectFingerprints].sort();
    const expected = createActivityQuantificationIdentity({
      role: identity.role,
      subjectType: identity.subjectType,
      lifecycle: identity.lifecycle,
      memberSubjectFingerprints: sortedFingerprints,
    });
    if (
      JSON.stringify(identity.memberSubjectFingerprints) !== JSON.stringify(sortedFingerprints) ||
      identity.fingerprint !== expected.fingerprint
    ) {
      context.addIssue({
        code: "custom",
        path: ["fingerprint"],
        message: "Collection subject fingerprint must canonically cover its members",
      });
    }
  });

export const activityQuantificationSubjectIdentitySchema = z.union([
  activityQuantificationPlanSubjectIdentitySchema,
  activityQuantificationPlanPreviewSubjectIdentitySchema,
  activityQuantificationScheduledEventSubjectIdentitySchema,
  activityQuantificationPlanOccurrenceSubjectIdentitySchema,
  activityQuantificationActivitySubjectIdentitySchema,
  activityQuantificationSegmentSubjectIdentitySchema,
  activityQuantificationCollectionSubjectIdentitySchema,
]);

export const activityQuantificationEvidenceIdentitySchema = z
  .object({
    role: z.literal("evidence"),
    evidenceType: z.enum([
      "plan_revision",
      "activity_artifact",
      "provider_summary",
      "segment_facts",
      "aggregate",
    ]),
    sourceIds: z.array(z.string().trim().min(1)).max(10_000),
    revisionFingerprint: z.string().trim().min(1).nullable(),
    details: z.json(),
    ...identityFields,
  })
  .strict()
  .superRefine((identity, context) => {
    const expected = createActivityQuantificationIdentity({
      role: identity.role,
      evidenceType: identity.evidenceType,
      sourceIds: identity.sourceIds,
      revisionFingerprint: identity.revisionFingerprint,
      details: identity.details,
    });
    if (identity.fingerprint !== expected.fingerprint) {
      context.addIssue({
        code: "custom",
        path: ["fingerprint"],
        message: "Evidence fingerprint does not match its readable identity and details",
      });
    }
  });

export const activityQuantificationCalculationIdentitySchema = z
  .object({
    role: z.literal("calculation"),
    model: z.string().trim().min(1),
    version: z.string().trim().min(1),
    computedAt: z.string().datetime({ offset: true }).nullable(),
    calibrationEvidenceFingerprint: z.string().trim().min(1).nullable(),
    memberCalculationFingerprints: z.array(identityFields.fingerprint).max(10_000),
    ...identityFields,
  })
  .strict()
  .superRefine((identity, context) => {
    const memberCalculationFingerprints = [...identity.memberCalculationFingerprints].sort();
    const expected = createActivityQuantificationIdentity({
      role: identity.role,
      model: identity.model,
      version: identity.version,
      computedAt: identity.computedAt,
      calibrationEvidenceFingerprint: identity.calibrationEvidenceFingerprint,
      memberCalculationFingerprints,
    });
    if (
      JSON.stringify(identity.memberCalculationFingerprints) !==
        JSON.stringify(memberCalculationFingerprints) ||
      identity.fingerprint !== expected.fingerprint
    ) {
      context.addIssue({
        code: "custom",
        path: ["fingerprint"],
        message: "Calculation fingerprint must canonically cover its calculation facts",
      });
    }
  });

export type ActivityQuantificationPlanSubjectIdentity = z.infer<
  typeof activityQuantificationPlanSubjectIdentitySchema
>;
export type ActivityQuantificationPlanPreviewSubjectIdentity = z.infer<
  typeof activityQuantificationPlanPreviewSubjectIdentitySchema
>;
export type ActivityQuantificationStablePlanSubjectIdentity = z.infer<
  typeof activityQuantificationStablePlanSubjectIdentitySchema
>;
export type ActivityQuantificationScheduledEventSubjectIdentity = z.infer<
  typeof activityQuantificationScheduledEventSubjectIdentitySchema
>;
export type ActivityQuantificationPlanOccurrenceParentSubjectIdentity = z.infer<
  typeof activityQuantificationPlanOccurrenceParentSubjectIdentitySchema
>;
export type ActivityQuantificationPlanOccurrenceSubjectIdentity = z.infer<
  typeof activityQuantificationPlanOccurrenceSubjectIdentitySchema
>;
export type ActivityQuantificationActivitySubjectIdentity = z.infer<
  typeof activityQuantificationActivitySubjectIdentitySchema
>;
export type ActivityQuantificationParentSubjectIdentity = z.infer<
  typeof activityQuantificationParentSubjectIdentitySchema
>;
export type ActivityQuantificationSegmentSubjectIdentity = z.infer<
  typeof activityQuantificationSegmentSubjectIdentitySchema
>;
export type ActivityQuantificationCollectionSubjectIdentity = z.infer<
  typeof activityQuantificationCollectionSubjectIdentitySchema
>;
export type ActivityQuantificationSubjectIdentity = z.infer<
  typeof activityQuantificationSubjectIdentitySchema
>;
export type ActivityQuantificationEvidenceIdentity = z.infer<
  typeof activityQuantificationEvidenceIdentitySchema
>;
export type ActivityQuantificationCalculationIdentity = z.infer<
  typeof activityQuantificationCalculationIdentitySchema
>;

export type ActivityQuantificationFingerprintValue =
  | null
  | boolean
  | number
  | string
  | readonly ActivityQuantificationFingerprintValue[]
  | { readonly [key: string]: ActivityQuantificationFingerprintValue | undefined };

function canonicalJson(value: unknown, ancestors: WeakSet<object>): string {
  if (value === null) return "null";

  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number": {
      if (!Number.isFinite(value)) {
        throw new Error("Activity quantification identity numbers must be finite");
      }
      const serialized = JSON.stringify(value);
      if (serialized === undefined) {
        throw new Error("Activity quantification identity number is not JSON serializable");
      }
      return serialized;
    }
    case "string": {
      const serialized = JSON.stringify(value);
      if (serialized === undefined) {
        throw new Error("Activity quantification identity string is not JSON serializable");
      }
      return serialized;
    }
    case "object": {
      if (ancestors.has(value)) {
        throw new Error("Activity quantification identity input must not be circular");
      }
      ancestors.add(value);

      if (Array.isArray(value)) {
        const serialized = `[${value.map((item) => canonicalJson(item, ancestors)).join(",")}]`;
        ancestors.delete(value);
        return serialized;
      }

      const prototype = Object.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null) {
        ancestors.delete(value);
        throw new Error("Activity quantification identity objects must be plain JSON objects");
      }

      const entries = Object.entries(value)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => {
          if (left < right) return -1;
          if (left > right) return 1;
          return 0;
        });
      const serializedEntries = entries.map(([key, child]) => {
        const serializedKey = JSON.stringify(key);
        if (serializedKey === undefined) {
          throw new Error("Activity quantification identity key is not JSON serializable");
        }
        return `${serializedKey}:${canonicalJson(child, ancestors)}`;
      });
      ancestors.delete(value);
      return `{${serializedEntries.join(",")}}`;
    }
    default:
      throw new Error("Activity quantification identity input must contain only JSON values");
  }
}

function fnv1a64(value: string): string {
  let hash = 14695981039346656037n;
  const update = (byte: number): void => {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 1099511628211n);
  };
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) continue;
    if (codePoint <= 0x7f) {
      update(codePoint);
    } else if (codePoint <= 0x7ff) {
      update(0xc0 | (codePoint >> 6));
      update(0x80 | (codePoint & 0x3f));
    } else if (codePoint <= 0xffff) {
      update(0xe0 | (codePoint >> 12));
      update(0x80 | ((codePoint >> 6) & 0x3f));
      update(0x80 | (codePoint & 0x3f));
    } else {
      update(0xf0 | (codePoint >> 18));
      update(0x80 | ((codePoint >> 12) & 0x3f));
      update(0x80 | ((codePoint >> 6) & 0x3f));
      update(0x80 | (codePoint & 0x3f));
    }
  }
  return hash.toString(16).padStart(16, "0");
}

/**
 * Creates a runtime-neutral identity from canonical JSON. Object key order is
 * insignificant and undefined object properties are omitted; array order
 * remains significant. This is an equality fingerprint, not a security or
 * authentication hash.
 */
function createActivityQuantificationIdentity(
  input: ActivityQuantificationFingerprintValue,
): ActivityQuantificationIdentity {
  const canonical = canonicalJson(input, new WeakSet());
  return activityQuantificationIdentitySchema.parse({
    algorithm: ACTIVITY_QUANTIFICATION_IDENTITY_ALGORITHM,
    fingerprint: `activity-quantification:v1:fnv1a64:${fnv1a64(canonical)}`,
  });
}

export function fingerprintActivityQuantification(
  input: ActivityQuantificationFingerprintValue,
): ActivityQuantificationSubjectIdentity["fingerprint"] {
  return createActivityQuantificationIdentity(input).fingerprint;
}

export function createPlanActivityQuantificationSubjectIdentity(input: {
  planId?: string | undefined;
  previewId?: string | undefined;
}): ActivityQuantificationStablePlanSubjectIdentity {
  if (input.planId !== undefined) {
    const identity = createActivityQuantificationIdentity({
      role: "subject",
      subjectType: "plan",
      planId: input.planId,
    });
    return activityQuantificationPlanSubjectIdentitySchema.parse({
      role: "subject",
      subjectType: "plan",
      planId: input.planId,
      ...identity,
    });
  }
  if (input.previewId === undefined) {
    throw new Error("A plan subject requires a stable plan ID or an explicit preview ID");
  }
  const identity = createActivityQuantificationIdentity({
    role: "subject",
    subjectType: "plan_preview",
    previewId: input.previewId,
  });
  return activityQuantificationPlanPreviewSubjectIdentitySchema.parse({
    role: "subject",
    subjectType: "plan_preview",
    previewId: input.previewId,
    ...identity,
  });
}

export function createScheduledEventActivityQuantificationSubjectIdentity(input: {
  eventId: string;
  planSubjectIdentity: ActivityQuantificationStablePlanSubjectIdentity;
}): ActivityQuantificationScheduledEventSubjectIdentity {
  const planSubjectIdentity = activityQuantificationStablePlanSubjectIdentitySchema.parse(
    input.planSubjectIdentity,
  );
  const identity = createActivityQuantificationIdentity({
    role: "subject",
    subjectType: "scheduled_event",
    eventId: input.eventId,
    planSubjectFingerprint: planSubjectIdentity.fingerprint,
  });
  return activityQuantificationScheduledEventSubjectIdentitySchema.parse({
    role: "subject",
    subjectType: "scheduled_event",
    eventId: input.eventId,
    planSubjectIdentity,
    ...identity,
  });
}

export function createPlanOccurrenceActivityQuantificationSubjectIdentity(input: {
  occurrenceId: string;
  parentSubjectIdentity: ActivityQuantificationPlanOccurrenceParentSubjectIdentity;
}): ActivityQuantificationPlanOccurrenceSubjectIdentity {
  const parentSubjectIdentity =
    activityQuantificationPlanOccurrenceParentSubjectIdentitySchema.parse(
      input.parentSubjectIdentity,
    );
  const identity = createActivityQuantificationIdentity({
    role: "subject",
    subjectType: "plan_occurrence",
    occurrenceId: input.occurrenceId,
    parentSubjectFingerprint: parentSubjectIdentity.fingerprint,
  });
  return activityQuantificationPlanOccurrenceSubjectIdentitySchema.parse({
    role: "subject",
    subjectType: "plan_occurrence",
    occurrenceId: input.occurrenceId,
    parentSubjectIdentity,
    ...identity,
  });
}

export function createCompletedActivityQuantificationSubjectIdentity(input: {
  activityId: string;
}): ActivityQuantificationActivitySubjectIdentity {
  const identity = createActivityQuantificationIdentity({
    role: "subject",
    subjectType: "activity",
    activityId: input.activityId,
  });
  return activityQuantificationActivitySubjectIdentitySchema.parse({
    role: "subject",
    subjectType: "activity",
    activityId: input.activityId,
    ...identity,
  });
}

export function createSegmentActivityQuantificationSubjectIdentity(input: {
  segmentId: string;
  parentSubjectIdentity: ActivityQuantificationParentSubjectIdentity;
}): ActivityQuantificationSegmentSubjectIdentity {
  const parentSubjectIdentity = activityQuantificationParentSubjectIdentitySchema.parse(
    input.parentSubjectIdentity,
  );
  const identity = createActivityQuantificationIdentity({
    role: "subject",
    subjectType: "segment",
    segmentId: input.segmentId,
    parentSubjectFingerprint: parentSubjectIdentity.fingerprint,
  });
  return activityQuantificationSegmentSubjectIdentitySchema.parse({
    role: "subject",
    subjectType: "segment",
    segmentId: input.segmentId,
    parentSubjectIdentity,
    ...identity,
  });
}

export function createCollectionActivityQuantificationSubjectIdentity(input: {
  lifecycle: "prescription" | "observation";
  memberSubjectIdentities: readonly ActivityQuantificationSubjectIdentity[];
}): ActivityQuantificationCollectionSubjectIdentity {
  const memberSubjectFingerprints = input.memberSubjectIdentities
    .map((identity) => activityQuantificationSubjectIdentitySchema.parse(identity).fingerprint)
    .sort();
  const identity = createActivityQuantificationIdentity({
    role: "subject",
    subjectType: "collection",
    lifecycle: input.lifecycle,
    memberSubjectFingerprints,
  });
  return activityQuantificationCollectionSubjectIdentitySchema.parse({
    role: "subject",
    subjectType: "collection",
    lifecycle: input.lifecycle,
    memberSubjectFingerprints,
    ...identity,
  });
}

export function createActivityQuantificationEvidenceIdentity(input: {
  evidenceType:
    | "plan_revision"
    | "activity_artifact"
    | "provider_summary"
    | "segment_facts"
    | "aggregate";
  sourceIds: readonly string[];
  revisionFingerprint: string | null;
  details: ActivityQuantificationFingerprintValue;
}): ActivityQuantificationEvidenceIdentity {
  const sourceIds = [...input.sourceIds];
  const identity = createActivityQuantificationIdentity({
    role: "evidence",
    evidenceType: input.evidenceType,
    sourceIds,
    revisionFingerprint: input.revisionFingerprint,
    details: input.details,
  });
  return activityQuantificationEvidenceIdentitySchema.parse({
    role: "evidence",
    evidenceType: input.evidenceType,
    sourceIds,
    revisionFingerprint: input.revisionFingerprint,
    details: input.details,
    ...identity,
  });
}

export function createActivityQuantificationCalculationIdentity(input: {
  model: string;
  version: string;
  computedAt: string | null;
  calibrationEvidenceFingerprint: string | null;
  memberCalculationFingerprints?: readonly string[] | undefined;
}): ActivityQuantificationCalculationIdentity {
  const memberCalculationFingerprints = [...(input.memberCalculationFingerprints ?? [])].sort();
  const identity = createActivityQuantificationIdentity({
    role: "calculation",
    model: input.model,
    version: input.version,
    computedAt: input.computedAt,
    calibrationEvidenceFingerprint: input.calibrationEvidenceFingerprint,
    memberCalculationFingerprints,
  });
  return activityQuantificationCalculationIdentitySchema.parse({
    role: "calculation",
    model: input.model,
    version: input.version,
    computedAt: input.computedAt,
    calibrationEvidenceFingerprint: input.calibrationEvidenceFingerprint,
    memberCalculationFingerprints,
    ...identity,
  });
}
