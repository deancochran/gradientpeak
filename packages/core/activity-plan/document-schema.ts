import { z } from "zod";

import { activityPlanStructureSchema } from "./structure-schema";
import {
  ACTIVITY_PLAN_LIMITS,
  getEncodedJsonByteLength,
  isActivityPlanEncodedByteLengthWithinLimit,
} from "./structure-validation";

const NIL_UUID = "00000000-0000-0000-0000-000000000000";

export const ACTIVITY_PLAN_DOCUMENT_LIMITS = {
  maxVariants: 16,
  maxVariantNameCodePoints: 100,
  maxEncodedJsonBytes: ACTIVITY_PLAN_LIMITS.maxEncodedJsonBytes,
} as const;

export const activityPlanDocumentIssueCodes = {
  unsupportedVersion: "ACTIVITY_PLAN_DOCUMENT_UNSUPPORTED_VERSION",
  missingVariants: "ACTIVITY_PLAN_DOCUMENT_MISSING_VARIANTS",
  variantLimitExceeded: "ACTIVITY_PLAN_DOCUMENT_VARIANT_LIMIT_EXCEEDED",
  duplicateVariantId: "ACTIVITY_PLAN_DOCUMENT_DUPLICATE_VARIANT_ID",
  invalidVariantName: "ACTIVITY_PLAN_DOCUMENT_INVALID_VARIANT_NAME",
  duplicateVariantName: "ACTIVITY_PLAN_DOCUMENT_DUPLICATE_VARIANT_NAME",
  unknownDefaultVariant: "ACTIVITY_PLAN_DOCUMENT_UNKNOWN_DEFAULT_VARIANT",
  mixedActivityCategory: "ACTIVITY_PLAN_DOCUMENT_MIXED_ACTIVITY_CATEGORY",
  payloadTooLarge: "ACTIVITY_PLAN_DOCUMENT_PAYLOAD_TOO_LARGE",
} as const;

export type ActivityPlanDocumentIssueCode =
  (typeof activityPlanDocumentIssueCodes)[keyof typeof activityPlanDocumentIssueCodes];

const documentIssueMessage = (code: ActivityPlanDocumentIssueCode, message: string) =>
  `[${code}] ${message}`;

export const activityPlanVariantIdSchema = z
  .string()
  .toLowerCase()
  .uuid()
  .refine((value) => value.toLowerCase() !== NIL_UUID, {
    message: "Activity-plan variant IDs must not use the nil UUID.",
  });

export const activityPlanVariantNameSchema = z
  .string()
  .refine((value) => value === value.trim(), {
    message: documentIssueMessage(
      activityPlanDocumentIssueCodes.invalidVariantName,
      "Variant names must not contain leading or trailing whitespace.",
    ),
  })
  .refine(
    (value) => {
      const length = Array.from(value).length;
      return length >= 1 && length <= ACTIVITY_PLAN_DOCUMENT_LIMITS.maxVariantNameCodePoints;
    },
    {
      message: documentIssueMessage(
        activityPlanDocumentIssueCodes.invalidVariantName,
        `Variant names must contain between 1 and ${ACTIVITY_PLAN_DOCUMENT_LIMITS.maxVariantNameCodePoints} Unicode characters.`,
      ),
    },
  );

export const activityPlanVariantSchema = z
  .object({
    id: activityPlanVariantIdSchema,
    name: activityPlanVariantNameSchema,
    structure: activityPlanStructureSchema,
  })
  .strict();

const activityPlanDocumentShapeSchema = z
  .object({
    contractVersion: z.literal(1, {
      error: documentIssueMessage(
        activityPlanDocumentIssueCodes.unsupportedVersion,
        "Only activity-plan document contract version 1 is accepted.",
      ),
    }),
    defaultVariantId: activityPlanVariantIdSchema,
    variants: z
      .array(activityPlanVariantSchema)
      .min(
        1,
        documentIssueMessage(
          activityPlanDocumentIssueCodes.missingVariants,
          "An activity-plan document must contain at least one variant.",
        ),
      )
      .max(
        ACTIVITY_PLAN_DOCUMENT_LIMITS.maxVariants,
        documentIssueMessage(
          activityPlanDocumentIssueCodes.variantLimitExceeded,
          `An activity-plan document cannot contain more than ${ACTIVITY_PLAN_DOCUMENT_LIMITS.maxVariants} variants.`,
        ),
      ),
  })
  .strict();

type ActivityPlanDocumentShape = z.output<typeof activityPlanDocumentShapeSchema>;

function addDocumentIssue(
  ctx: z.RefinementCtx,
  code: ActivityPlanDocumentIssueCode,
  path: PropertyKey[],
  message: string,
): void {
  ctx.addIssue({
    code: "custom",
    path,
    message: documentIssueMessage(code, message),
    params: { activityPlanDocumentIssueCode: code },
  });
}

function addActivityPlanDocumentIssues(
  document: ActivityPlanDocumentShape,
  ctx: z.RefinementCtx,
): void {
  const variantIds = new Map<string, number>();
  const normalizedNames = new Map<string, number>();
  let activityCategory:
    | ActivityPlanDocumentShape["variants"][number]["structure"]["activity_category"]
    | undefined;

  document.variants.forEach((variant, variantIndex) => {
    const firstIdIndex = variantIds.get(variant.id);
    if (firstIdIndex !== undefined) {
      addDocumentIssue(
        ctx,
        activityPlanDocumentIssueCodes.duplicateVariantId,
        ["variants", variantIndex, "id"],
        `Variant ID ${variant.id} duplicates variants.${firstIdIndex}.id.`,
      );
    } else {
      variantIds.set(variant.id, variantIndex);
    }

    const normalizedName = variant.name.trim().toLowerCase();
    const firstNameIndex = normalizedNames.get(normalizedName);
    if (firstNameIndex !== undefined) {
      addDocumentIssue(
        ctx,
        activityPlanDocumentIssueCodes.duplicateVariantName,
        ["variants", variantIndex, "name"],
        `Variant name ${variant.name} duplicates variants.${firstNameIndex}.name after normalization.`,
      );
    } else {
      normalizedNames.set(normalizedName, variantIndex);
    }

    if (activityCategory === undefined) {
      activityCategory = variant.structure.activity_category;
    } else if (activityCategory !== variant.structure.activity_category) {
      addDocumentIssue(
        ctx,
        activityPlanDocumentIssueCodes.mixedActivityCategory,
        ["variants", variantIndex, "structure", "activity_category"],
        `Every variant must use activity category ${activityCategory}.`,
      );
    }
  });

  if (!variantIds.has(document.defaultVariantId)) {
    addDocumentIssue(
      ctx,
      activityPlanDocumentIssueCodes.unknownDefaultVariant,
      ["defaultVariantId"],
      `Default variant ID ${document.defaultVariantId} does not identify a document variant.`,
    );
  }

  const encodedBytes = getEncodedJsonByteLength(document);
  if (!isActivityPlanEncodedByteLengthWithinLimit(encodedBytes)) {
    addDocumentIssue(
      ctx,
      activityPlanDocumentIssueCodes.payloadTooLarge,
      [],
      `The encoded activity-plan document cannot exceed ${ACTIVITY_PLAN_DOCUMENT_LIMITS.maxEncodedJsonBytes} bytes.`,
    );
  }
}

/** Strict persisted activity-plan document containing complete executable V3 variants. */
export const activityPlanDocumentSchema = activityPlanDocumentShapeSchema
  .superRefine(addActivityPlanDocumentIssues)
  .brand<"ValidatedActivityPlanDocument">();

export type ActivityPlanVariant = z.output<typeof activityPlanVariantSchema>;
export type ActivityPlanDocument = z.output<typeof activityPlanDocumentSchema>;
export type ActivityPlanDocumentInput = z.input<typeof activityPlanDocumentSchema>;

export function validateActivityPlanDocument(data: unknown) {
  return activityPlanDocumentSchema.safeParse(data);
}
