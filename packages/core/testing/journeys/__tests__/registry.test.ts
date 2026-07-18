import { describe, expect, it } from "vitest";
import { allParityFeatureIds } from "../../../parity";
import {
  journeyCoverageSchema,
  journeyEvidenceSchema,
  productJourneyRegistry,
  productJourneySchema,
} from "..";

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

describe("journey evidence verification", () => {
  it("defaults legacy evidence and coverage to declared verification", () => {
    const evidence = journeyEvidenceSchema.parse({
      kind: "runtime_flow",
      path: ".maestro/flows/example.yaml",
      status: "validated",
    });
    const coverage = journeyCoverageSchema.parse({ status: "validated" });

    expect(evidence.verificationStatus).toBe("declared");
    expect(coverage.runtimeVerificationStatus).toBe("declared");
  });

  it("requires machine-produced execution metadata for runtime-verified evidence", () => {
    expect(
      journeyEvidenceSchema.safeParse({
        kind: "runtime_flow",
        path: ".maestro/flows/example.yaml",
        status: "validated",
        verificationStatus: "runtime_verified",
      }).success,
    ).toBe(false);

    expect(
      journeyEvidenceSchema.safeParse({
        execution: {
          artifactPath: ".maestro/artifacts/example.json",
          command: "maestro test example.yaml",
          generatedAt: "2026-07-18T12:00:00Z",
          source: "machine",
        },
        kind: "runtime_flow",
        path: ".maestro/flows/example.yaml",
        status: "validated",
        verificationStatus: "runtime_verified",
      }).success,
    ).toBe(true);
  });

  it("does not allow coverage to claim runtime verification from implementation status alone", () => {
    expect(
      journeyCoverageSchema.safeParse({
        evidence: [
          {
            kind: "runtime_flow",
            path: ".maestro/flows/example.yaml",
            status: "validated",
          },
        ],
        runtimeVerificationStatus: "runtime_verified",
        status: "validated",
      }).success,
    ).toBe(false);
  });
});
