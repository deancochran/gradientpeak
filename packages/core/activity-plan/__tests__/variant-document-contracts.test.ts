import { describe, expect, it } from "vitest";

import {
  fixtureUuid,
  fourVariantActivityPlanDocumentFixture,
  oneVariantActivityPlanDocumentFixture,
  twoVariantActivityPlanDocumentFixture,
} from "../__fixtures__/variant-documents";
import {
  ActivityPlanVariantResolutionError,
  activityPlanVariantResolutionFailureCodes,
  getCanonicalActivityPlanDocumentHashInput,
  initializeActivityPlanDocument,
  resolveActivityPlanVariant,
} from "../document";
import {
  ACTIVITY_PLAN_DOCUMENT_LIMITS,
  type ActivityPlanDocumentInput,
  activityPlanDocumentIssueCodes,
  activityPlanDocumentSchema,
} from "../document-schema";
import {
  activityPlanStructureSchema,
  type EditableActivityPlanStructure,
} from "../structure-schema";

const issueMessages = (input: unknown): string => {
  const result = activityPlanDocumentSchema.safeParse(input);
  expect(result.success).toBe(false);
  return result.success ? "" : result.error.issues.map((issue) => issue.message).join(" ");
};

const requireFixtureVariant = (input: ActivityPlanDocumentInput, index: number) => {
  const variant = input.variants[index];
  if (!variant) throw new Error(`Fixture requires variant ${index}.`);
  return variant;
};

describe("activity-plan variant document contract", () => {
  it.each([
    ["one", oneVariantActivityPlanDocumentFixture, 1],
    ["two", twoVariantActivityPlanDocumentFixture, 2],
    ["four", fourVariantActivityPlanDocumentFixture, 4],
  ])("accepts the representative %s-variant complete document", (_name, fixture, count) => {
    const document = activityPlanDocumentSchema.parse(fixture);

    expect(document.variants).toHaveLength(count);
    for (const variant of document.variants) {
      expect(activityPlanStructureSchema.safeParse(variant.structure).success).toBe(true);
    }
  });

  it("initializes exactly one Base variant using the activity-plan ID as its default identity", () => {
    const activityPlanId = fixtureUuid(900);
    const structure = oneVariantActivityPlanDocumentFixture.variants[0]?.structure;
    if (!structure) throw new Error("Fixture requires one complete structure.");

    const document = initializeActivityPlanDocument({ activityPlanId, structure });

    expect(document).toEqual({
      contractVersion: 1,
      defaultVariantId: activityPlanId,
      variants: [{ id: activityPlanId, name: "Base", structure }],
    });
  });

  it("rejects root V3 input rather than providing runtime legacy compatibility", () => {
    const structure = oneVariantActivityPlanDocumentFixture.variants[0]?.structure;
    expect(activityPlanDocumentSchema.safeParse(structure).success).toBe(false);
  });

  it("rejects unsupported versions, zero variants, and more than sixteen variants", () => {
    expect(
      issueMessages({ ...oneVariantActivityPlanDocumentFixture, contractVersion: 2 }),
    ).toContain(activityPlanDocumentIssueCodes.unsupportedVersion);
    expect(
      issueMessages({
        contractVersion: 1,
        defaultVariantId: fixtureUuid(100),
        variants: [],
      }),
    ).toContain(activityPlanDocumentIssueCodes.missingVariants);

    const structure = oneVariantActivityPlanDocumentFixture.variants[0]?.structure;
    if (!structure) throw new Error("Fixture requires one complete structure.");
    const variants = Array.from(
      { length: ACTIVITY_PLAN_DOCUMENT_LIMITS.maxVariants + 1 },
      (_, index) => ({
        id: fixtureUuid(1_000 + index),
        name: `Variant ${index + 1}`,
        structure,
      }),
    );
    expect(
      issueMessages({ contractVersion: 1, defaultVariantId: variants[0]?.id, variants }),
    ).toContain(activityPlanDocumentIssueCodes.variantLimitExceeded);
  });

  it("rejects duplicate variant IDs and case-equivalent names", () => {
    const duplicateId = structuredClone(twoVariantActivityPlanDocumentFixture);
    requireFixtureVariant(duplicateId, 1).id = requireFixtureVariant(duplicateId, 0).id;
    expect(issueMessages(duplicateId)).toContain(activityPlanDocumentIssueCodes.duplicateVariantId);

    const duplicateName = structuredClone(twoVariantActivityPlanDocumentFixture);
    requireFixtureVariant(duplicateName, 1).name = "bAsE";
    expect(issueMessages(duplicateName)).toContain(
      activityPlanDocumentIssueCodes.duplicateVariantName,
    );
  });

  it("canonicalizes UUID casing before identity uniqueness and default resolution", () => {
    const duplicateId = structuredClone(twoVariantActivityPlanDocumentFixture);
    requireFixtureVariant(duplicateId, 1).id = requireFixtureVariant(
      duplicateId,
      0,
    ).id.toUpperCase();
    expect(issueMessages(duplicateId)).toContain(activityPlanDocumentIssueCodes.duplicateVariantId);

    const uppercaseDefault = structuredClone(oneVariantActivityPlanDocumentFixture);
    uppercaseDefault.defaultVariantId = uppercaseDefault.defaultVariantId.toUpperCase();
    requireFixtureVariant(uppercaseDefault, 0).id = requireFixtureVariant(
      uppercaseDefault,
      0,
    ).id.toUpperCase();
    const document = activityPlanDocumentSchema.parse(uppercaseDefault);

    expect(document.defaultVariantId).toBe(oneVariantActivityPlanDocumentFixture.defaultVariantId);
    expect(document.variants[0]?.id).toBe(oneVariantActivityPlanDocumentFixture.defaultVariantId);
    expect(resolveActivityPlanVariant(document).variantId).toBe(
      oneVariantActivityPlanDocumentFixture.defaultVariantId,
    );
    expect(
      resolveActivityPlanVariant(document, {
        variantId: oneVariantActivityPlanDocumentFixture.defaultVariantId.toUpperCase(),
      }).variantId,
    ).toBe(oneVariantActivityPlanDocumentFixture.defaultVariantId);
  });

  it("rejects blank, leading/trailing-whitespace, and overlong variant names", () => {
    for (const name of ["", " Base ", "x".repeat(101)]) {
      const input = structuredClone(oneVariantActivityPlanDocumentFixture);
      requireFixtureVariant(input, 0).name = name;
      expect(issueMessages(input)).toContain(activityPlanDocumentIssueCodes.invalidVariantName);
    }
  });

  it("rejects an unknown default variant", () => {
    expect(
      issueMessages({
        ...oneVariantActivityPlanDocumentFixture,
        defaultVariantId: fixtureUuid(999),
      }),
    ).toContain(activityPlanDocumentIssueCodes.unknownDefaultVariant);
  });

  it("rejects mixed activity categories", () => {
    const input = structuredClone(twoVariantActivityPlanDocumentFixture);
    requireFixtureVariant(input, 1).structure.activity_category = "bike";

    expect(issueMessages(input)).toContain(activityPlanDocumentIssueCodes.mixedActivityCategory);
  });

  it("rejects a document when any complete nested V3 structure is invalid", () => {
    const input = structuredClone(twoVariantActivityPlanDocumentFixture);
    requireFixtureVariant(input, 1).structure.segments = [];

    expect(activityPlanDocumentSchema.safeParse(input).success).toBe(false);
  });

  it("rejects aggregate encoded size beyond the existing persistence boundary", () => {
    let nextId = 10;
    const largeStructure: EditableActivityPlanStructure = {
      version: 3,
      activity_category: "run",
      segments: [
        {
          id: fixtureUuid(nextId++),
          role: "activity",
          name: "Run",
          intervals: Array.from({ length: 20 }, () => ({
            id: fixtureUuid(nextId++),
            name: "Main set",
            repetitions: 1,
            notes: "i".repeat(1_000),
            steps: Array.from({ length: 20 }, () => ({
              id: fixtureUuid(nextId++),
              name: "Steady effort",
              description: "d".repeat(500),
              notes: "n".repeat(1_000),
              duration: { type: "distance" as const, meters: 1 },
              targets: [{ type: "RPE" as const, intensity: 5 }],
            })),
          })),
        },
      ],
    };
    expect(activityPlanStructureSchema.safeParse(largeStructure).success).toBe(true);

    const result = activityPlanDocumentSchema.safeParse({
      contractVersion: 1,
      defaultVariantId: fixtureUuid(700),
      variants: [
        { id: fixtureUuid(700), name: "Base", structure: largeStructure },
        { id: fixtureUuid(701), name: "Build", structure: largeStructure },
      ],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message).join(" ")).toContain(
        activityPlanDocumentIssueCodes.payloadTooLarge,
      );
    }
  });
});

describe("activity-plan variant resolution", () => {
  it("uses the default only when selection identity is omitted", () => {
    const document = activityPlanDocumentSchema.parse(fourVariantActivityPlanDocumentFixture);

    expect(resolveActivityPlanVariant(document)).toMatchObject({
      selection: "default",
      variantId: fixtureUuid(102),
      variantName: "Advanced",
    });
    expect(resolveActivityPlanVariant(document, {})).toMatchObject({
      selection: "default",
      variantId: fixtureUuid(102),
    });
    expect(resolveActivityPlanVariant(document, { variantId: fixtureUuid(103) })).toMatchObject({
      selection: "explicit",
      variantId: fixtureUuid(103),
      variantName: "Race",
    });
  });

  it.each([
    "",
    fixtureUuid(999),
  ])("returns a typed failure for explicit unknown identity %j without fallback", (variantId) => {
    const document = activityPlanDocumentSchema.parse(fourVariantActivityPlanDocumentFixture);

    try {
      resolveActivityPlanVariant(document, { variantId });
      throw new Error("Expected explicit variant resolution to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(ActivityPlanVariantResolutionError);
      if (!(error instanceof ActivityPlanVariantResolutionError)) throw error;
      expect(error.code).toBe(activityPlanVariantResolutionFailureCodes.unknownExplicitVariant);
      expect(error.variantId).toBe(variantId);
    }
  });

  it("does not interpret an explicit runtime null as an omitted selection", () => {
    const document = activityPlanDocumentSchema.parse(fourVariantActivityPlanDocumentFixture);

    expect(() =>
      resolveActivityPlanVariant(document, {
        variantId: null as unknown as string,
      }),
    ).toThrow(ActivityPlanVariantResolutionError);
  });
});

describe("activity-plan document canonical hashing input", () => {
  it("is deterministic and includes every variant identity in the whole document", () => {
    const document = activityPlanDocumentSchema.parse(twoVariantActivityPlanDocumentFixture);
    const first = getCanonicalActivityPlanDocumentHashInput(document);
    const second = getCanonicalActivityPlanDocumentHashInput(document);

    expect(first).toBe(second);
    expect(JSON.parse(first)).toEqual(document);
    expect(first).toContain(fixtureUuid(100));
    expect(first).toContain(fixtureUuid(101));

    const changedIdentityInput = structuredClone(twoVariantActivityPlanDocumentFixture);
    requireFixtureVariant(changedIdentityInput, 1).id = fixtureUuid(199);
    const changedIdentity = activityPlanDocumentSchema.parse(changedIdentityInput);
    expect(getCanonicalActivityPlanDocumentHashInput(changedIdentity)).not.toBe(first);
  });

  it("changes for default, name, structure, and user-visible variant order changes", () => {
    const baseline = activityPlanDocumentSchema.parse(twoVariantActivityPlanDocumentFixture);
    const baselineInput = getCanonicalActivityPlanDocumentHashInput(baseline);
    const mutations = [
      (input: typeof twoVariantActivityPlanDocumentFixture) => {
        input.defaultVariantId = fixtureUuid(101);
      },
      (input: typeof twoVariantActivityPlanDocumentFixture) => {
        requireFixtureVariant(input, 1).name = "Progression";
      },
      (input: typeof twoVariantActivityPlanDocumentFixture) => {
        const segment = requireFixtureVariant(input, 1).structure.segments[0];
        if (!segment) throw new Error("Fixture requires one segment.");
        segment.name = "Progression run";
      },
      (input: typeof twoVariantActivityPlanDocumentFixture) => {
        input.variants.reverse();
      },
    ];

    for (const mutate of mutations) {
      const input = structuredClone(twoVariantActivityPlanDocumentFixture);
      mutate(input);
      const document = activityPlanDocumentSchema.parse(input);
      expect(getCanonicalActivityPlanDocumentHashInput(document)).not.toBe(baselineInput);
    }
  });
});
