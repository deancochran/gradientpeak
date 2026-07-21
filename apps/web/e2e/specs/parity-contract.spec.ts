import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

import { mobileWebJourneyDomains } from "../contracts/mobile-web-journeys";

test("every inventoried mobile capability has a verifiable web E2E disposition", async () => {
  expect(mobileWebJourneyDomains).toHaveLength(13);
  const journeys = mobileWebJourneyDomains.flatMap((domain) => domain.journeys);
  const ids = journeys.map((journey) => journey.id);
  const specTitles = new Map<string, Set<string>>();

  expect(new Set(ids).size).toBe(ids.length);
  expect(journeys).toHaveLength(92);
  expect(journeys.filter((journey) => journey.status === "executable")).toHaveLength(18);
  expect(journeys.filter((journey) => journey.status === "implemented-unverified")).toHaveLength(
    73,
  );
  expect(journeys.filter((journey) => journey.status === "missing-web-capability")).toHaveLength(1);

  for (const journey of journeys) {
    expect(journey.evidence.length, `${journey.id} requires exact test evidence`).toBeGreaterThan(
      0,
    );
    for (const evidence of journey.evidence) {
      const specUrl = new URL(evidence.spec, import.meta.url);
      await expect(
        access(fileURLToPath(specUrl)),
        `${journey.id} references missing spec ${evidence.spec}`,
      ).resolves.toBeUndefined();

      let titles = specTitles.get(evidence.spec);
      if (!titles) {
        const source = await readFile(fileURLToPath(specUrl), "utf8");
        titles = new Set(
          [...source.matchAll(/\b(?:test|profileTest)\s*\(\s*(?:"([^"]+)"|'([^']+)'|`([^`]+)`)/g)]
            .map((match) => match[1] ?? match[2] ?? match[3] ?? "")
            .flatMap((title) => {
              const viewportPlaceholder = "$" + "{viewport.name}";
              return title.includes(viewportPlaceholder)
                ? [
                    title.replace(viewportPlaceholder, "desktop"),
                    title.replace(viewportPlaceholder, "narrow"),
                  ]
                : [title];
            }),
        );
        specTitles.set(evidence.spec, titles);
      }
      expect(
        titles.has(evidence.testTitle),
        `${journey.id} references missing test title "${evidence.testTitle}" in ${evidence.spec}`,
      ).toBe(true);
    }

    for (const support of journey.support ?? []) {
      await expect(
        access(fileURLToPath(new URL(support, new URL("../contracts/", import.meta.url)))),
        `${journey.id} references missing support ${support}`,
      ).resolves.toBeUndefined();
    }

    if (journey.status === "executable") {
      expect(journey.seed, `${journey.id} requires a deterministic seed`).toBeTruthy();
      expect(journey.priorGap).toBeUndefined();
      expect(journey.runtimeBlocker).toBeUndefined();
    } else {
      expect(journey.priorGap?.detail, `${journey.id} must preserve its prior gap`).toBeTruthy();
      expect(journey.priorGap?.status, `${journey.id} must preserve its prior status`).toMatch(
        /^(needs-seed|missing-web-capability)$/,
      );
      expect(
        journey.runtimeBlocker,
        `${journey.id} requires a precise current runtime blocker`,
      ).toBeTruthy();
      expect(journey.seed).toBeUndefined();
    }
  }
});
