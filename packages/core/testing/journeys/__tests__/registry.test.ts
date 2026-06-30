import { describe, expect, it } from "vitest";
import { allParityFeatureIds } from "../../../parity";
import { productJourneyRegistry, productJourneySchema } from "..";

describe("product journey registry", () => {
  it("uses unique journey ids", () => {
    const ids = productJourneyRegistry.map((journey) => journey.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps every journey schema-valid", () => {
    const invalidJourneys = productJourneyRegistry.filter(
      (journey) => !productJourneySchema.safeParse(journey).success,
    );

    expect(invalidJourneys).toEqual([]);
  });

  it("references only known parity features", () => {
    const unknownFeatureRefs = productJourneyRegistry.flatMap((journey) =>
      journey.parityFeatureIds
        .filter((featureId) => !allParityFeatureIds.includes(featureId))
        .map((featureId) => `${journey.id} -> ${featureId}`),
    );

    expect(unknownFeatureRefs).toEqual([]);
  });
});
