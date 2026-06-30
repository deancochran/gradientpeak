import { existsSync } from "node:fs";
import path from "node:path";
import {
  allProductJourneyIds,
  journeyCoverageSchema,
  productJourneyRegistry,
} from "@repo/core/testing/journeys";
import { describe, expect, it } from "vitest";

import { mobileJourneyCoverageManifest } from "../lib/testing/journey-coverage";

const mobileRoot = path.resolve(__dirname, "..");

function formatList(title: string, items: string[]) {
  return `${title}\n${items.map((item) => `- ${item}`).join("\n")}`;
}

describe("mobile authoritative journey coverage", () => {
  it("covers every product journey contract", () => {
    const missingJourneys = allProductJourneyIds.filter(
      (journeyId) => !(journeyId in mobileJourneyCoverageManifest),
    );
    const extraJourneys = Object.keys(mobileJourneyCoverageManifest).filter(
      (journeyId) => !(allProductJourneyIds as readonly string[]).includes(journeyId),
    );

    expect(
      [...missingJourneys, ...extraJourneys],
      [
        formatList("Missing mobile journey coverage", missingJourneys),
        formatList("Unknown mobile journey coverage", extraJourneys),
      ].join("\n\n"),
    ).toEqual([]);
  });

  it("keeps coverage manifest entries schema-valid", () => {
    const invalidEntries = Object.entries(mobileJourneyCoverageManifest)
      .filter(([, coverage]) => !journeyCoverageSchema.safeParse(coverage).success)
      .map(([journeyId]) => journeyId);

    expect(invalidEntries).toEqual([]);
  });

  it("provides required selectors for each product journey", () => {
    const missingSelectors = productJourneyRegistry.flatMap((journey) => {
      const coverage = mobileJourneyCoverageManifest[journey.id];
      const selectors = coverage.selectors as Record<string, string | undefined>;

      return journey.requiredSelectorKeys
        .filter((selectorKey) => !selectors[selectorKey])
        .map((selectorKey) => `${journey.id} -> ${selectorKey}`);
    });

    expect(
      missingSelectors,
      formatList("Missing required mobile selectors", missingSelectors),
    ).toEqual([]);
  });

  it("references evidence files that exist in the mobile app", () => {
    const missingEvidenceFiles = Object.entries(mobileJourneyCoverageManifest).flatMap(
      ([journeyId, coverage]) =>
        coverage.evidence
          .filter((evidence) => !existsSync(path.join(mobileRoot, evidence.path)))
          .map((evidence) => `${journeyId} -> ${evidence.path}`),
    );

    expect(
      missingEvidenceFiles,
      formatList("Missing mobile journey evidence files", missingEvidenceFiles),
    ).toEqual([]);
  });

  it("does not mark a journey validated unless at least one runtime or route evidence is validated", () => {
    const overstatedJourneys = Object.entries(mobileJourneyCoverageManifest)
      .filter(([, coverage]) => coverage.status === "validated")
      .filter(
        ([, coverage]) =>
          !coverage.evidence.some(
            (evidence) =>
              evidence.status === "validated" &&
              (evidence.kind === "runtime_flow" || evidence.kind === "route_test"),
          ),
      )
      .map(([journeyId]) => journeyId);

    expect(overstatedJourneys).toEqual([]);
  });
});
