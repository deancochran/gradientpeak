import { getRequiredWebParityFeatures, type ParityFeatureId } from "@repo/core/parity";
import type { JourneyEvidence } from "@repo/core/testing/journeys";
import { describe, expect, it } from "vitest";

import { mobileWebJourneyDomains } from "../../../e2e/contracts/mobile-web-journeys";
import {
  getWebJourneyRuntimeCoverageReport,
  type WebJourneyCoverageEntry,
  type WebJourneyCoverageManifest,
  webJourneyCoverageManifest,
} from "./journey-coverage";

describe("web mobile-journey coverage manifest", () => {
  it("maps exactly the 83 canonical journeys", () => {
    const canonicalIds = mobileWebJourneyDomains
      .flatMap((domain) => domain.journeys.map((journey) => journey.id))
      .sort();
    const manifestIds = Object.keys(webJourneyCoverageManifest).sort();

    expect(new Set(canonicalIds).size).toBe(83);
    expect(manifestIds).toEqual(canonicalIds);
  });

  it("maps every journey and every required-on-web feature without including web-only features", () => {
    const requiredFeatureIds = getRequiredWebParityFeatures()
      .map((feature) => feature.id)
      .sort();
    const mappedFeatureIds = [
      ...new Set(
        Object.values(webJourneyCoverageManifest).flatMap((coverage) =>
          coverage.mappings.map((mapping) => mapping.featureId),
        ),
      ),
    ].sort();

    expect(requiredFeatureIds).toHaveLength(47);
    expect(mappedFeatureIds).toEqual(requiredFeatureIds);
    expect(mappedFeatureIds).not.toContain("coaching.dashboard");

    for (const [journeyId, coverage] of Object.entries(webJourneyCoverageManifest)) {
      expect(coverage.mappings.length, `${journeyId} needs a feature mapping`).toBeGreaterThan(0);
      for (const mapping of coverage.mappings) {
        if (mapping.relation !== "direct") {
          expect(
            mapping.rationale?.trim(),
            `${journeyId} ${mapping.relation} mapping needs a rationale`,
          ).toBeTruthy();
        }
      }
    }
  });

  it("reports zero runtime-verified coverage until machine execution evidence exists", () => {
    const report = getWebJourneyRuntimeCoverageReport();

    expect(report.journeys).toMatchObject({
      declared: 83,
      denominator: 83,
      percentage: 0,
      runtimeVerified: 0,
      syntaxChecked: 0,
    });
    expect(report.features).toMatchObject({
      declared: 47,
      denominator: 47,
      percentage: 0,
      runtimeVerified: 0,
      syntaxChecked: 0,
    });
  });

  it("requires every mapped journey to be runtime verified before crediting a feature", () => {
    const featureId: ParityFeatureId = "auth.sign_in";
    const manifest = {
      first: verifiedEntry(featureId, "first"),
      second: declaredEntry(featureId),
    } satisfies WebJourneyCoverageManifest;

    const partialReport = getWebJourneyRuntimeCoverageReport(manifest, [featureId]);
    expect(partialReport.journeys.runtimeVerified).toBe(1);
    expect(partialReport.journeys.percentage).toBe(50);
    expect(partialReport.features.runtimeVerified).toBe(0);
    expect(partialReport.features.percentage).toBe(0);

    const completeReport = getWebJourneyRuntimeCoverageReport(
      {
        ...manifest,
        second: verifiedEntry(featureId, "second"),
      },
      [featureId],
    );
    expect(completeReport.features.runtimeVerified).toBe(1);
    expect(completeReport.features.percentage).toBe(100);
  });

  it("rejects runtime verification without machine-produced runtime evidence", () => {
    const invalidManifest = {
      invalid: {
        mappings: [{ featureId: "auth.sign_in", relation: "direct" }],
        runtimeVerification: { evidence: [], status: "runtime_verified" },
      },
    } as const satisfies WebJourneyCoverageManifest;

    expect(() => getWebJourneyRuntimeCoverageReport(invalidManifest, ["auth.sign_in"])).toThrow(
      /without machine runtime evidence/,
    );
  });

  it("rejects malformed machine execution metadata", () => {
    const invalidManifest = {
      invalid: {
        mappings: [{ featureId: "auth.sign_in", relation: "direct" }],
        runtimeVerification: {
          evidence: [
            {
              execution: {
                artifactPath: "",
                command: "",
                generatedAt: "not-a-timestamp",
                source: "machine",
              },
              kind: "runtime_flow",
              path: "journeys/invalid.spec.ts",
              status: "validated",
              verificationStatus: "runtime_verified",
            },
          ],
          status: "runtime_verified",
        },
      },
    } as const satisfies WebJourneyCoverageManifest;

    expect(() => getWebJourneyRuntimeCoverageReport(invalidManifest, ["auth.sign_in"])).toThrow(
      /invalid runtime evidence/,
    );
  });
});

function declaredEntry(featureId: ParityFeatureId): WebJourneyCoverageEntry {
  return {
    mappings: [{ featureId, relation: "direct" }],
    runtimeVerification: { evidence: [], status: "declared" },
  };
}

function verifiedEntry(featureId: ParityFeatureId, identity: string): WebJourneyCoverageEntry {
  const evidence: JourneyEvidence = {
    execution: {
      artifactPath: `evidence/${identity}.json`,
      command: `verify ${identity}`,
      generatedAt: "2026-07-30T00:00:00.000Z",
      source: "machine",
    },
    kind: "runtime_flow",
    path: `journeys/${identity}.spec.ts`,
    status: "validated",
    verificationStatus: "runtime_verified",
  };

  return {
    mappings: [{ featureId, relation: "direct" }],
    runtimeVerification: { evidence: [evidence], status: "runtime_verified" },
  };
}
