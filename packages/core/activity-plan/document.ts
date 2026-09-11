import { stringifyCanonicalJson } from "../athlete-intelligence/canonical-json";
import {
  type ActivityPlanDocument,
  activityPlanDocumentSchema,
  activityPlanVariantIdSchema,
} from "./document-schema";
import { type ActivityPlanStructure, activityPlanStructureSchema } from "./structure-schema";

export const INITIAL_ACTIVITY_PLAN_VARIANT_NAME = "Base" as const;

export function initialBaseVariantId(activityPlanId: string): string {
  return activityPlanVariantIdSchema.parse(activityPlanId);
}

/** Constructs the server-authoritative, runtime-neutral initial document without generating identity. */
export function initializeActivityPlanDocument(input: {
  activityPlanId: string;
  structure: unknown;
}): ActivityPlanDocument {
  const variantId = initialBaseVariantId(input.activityPlanId);

  return activityPlanDocumentSchema.parse({
    contractVersion: 1,
    defaultVariantId: variantId,
    variants: [
      {
        id: variantId,
        name: INITIAL_ACTIVITY_PLAN_VARIANT_NAME,
        structure: input.structure,
      },
    ],
  });
}

export const activityPlanVariantResolutionFailureCodes = {
  unknownDefaultVariant: "ACTIVITY_PLAN_UNKNOWN_DEFAULT_VARIANT",
  unknownExplicitVariant: "ACTIVITY_PLAN_UNKNOWN_EXPLICIT_VARIANT",
} as const;

export type ActivityPlanVariantResolutionFailureCode =
  (typeof activityPlanVariantResolutionFailureCodes)[keyof typeof activityPlanVariantResolutionFailureCodes];

export class ActivityPlanVariantResolutionError extends Error {
  readonly code: ActivityPlanVariantResolutionFailureCode;
  readonly variantId: string;

  constructor(code: ActivityPlanVariantResolutionFailureCode, variantId: string) {
    super(`[${code}] Activity-plan variant ${variantId} does not exist in the document.`);
    this.name = "ActivityPlanVariantResolutionError";
    this.code = code;
    this.variantId = variantId;
  }
}

export type ResolvedActivityPlanVariant = {
  selection: "default" | "explicit";
  variantId: string;
  variantName: string;
  structure: ActivityPlanStructure;
};

/** Resolves only omission to the default; every supplied identity is an exact lookup. */
export function resolveActivityPlanVariant(
  document: ActivityPlanDocument,
  selection?: { variantId?: string },
): ResolvedActivityPlanVariant {
  const explicitVariantId = selection?.variantId;
  const resolution = explicitVariantId === undefined ? "default" : "explicit";
  const parsedExplicitVariantId =
    explicitVariantId === undefined
      ? undefined
      : activityPlanVariantIdSchema.safeParse(explicitVariantId);
  const variantId =
    explicitVariantId === undefined
      ? document.defaultVariantId
      : parsedExplicitVariantId?.success === true
        ? parsedExplicitVariantId.data
        : explicitVariantId;
  const variant = document.variants.find((candidate) => candidate.id === variantId);

  if (!variant) {
    const code =
      resolution === "default"
        ? activityPlanVariantResolutionFailureCodes.unknownDefaultVariant
        : activityPlanVariantResolutionFailureCodes.unknownExplicitVariant;
    throw new ActivityPlanVariantResolutionError(code, variantId);
  }

  return {
    selection: resolution,
    variantId: variant.id,
    variantName: variant.name,
    structure: variant.structure,
  };
}

/**
 * Returns the portable canonical JSON bytes-to-hash input for the whole document.
 * Object key order is insignificant; variant array order remains significant. Variant
 * identities, names, default selection, and complete nested structures are all included.
 */
export function getCanonicalActivityPlanDocumentHashInput(document: ActivityPlanDocument): string {
  return stringifyCanonicalJson(document);
}

/** Returns the portable canonical bytes-to-hash input for one executable V3 structure. */
export function getCanonicalActivityPlanStructureHashInput(structure: unknown): string {
  return stringifyCanonicalJson(activityPlanStructureSchema.parse(structure));
}
