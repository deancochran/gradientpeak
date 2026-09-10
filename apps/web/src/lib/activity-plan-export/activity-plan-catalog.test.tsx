import { pdf } from "@react-pdf/renderer";
import { SYSTEM_TEMPLATES } from "@repo/core";
import { describe, expect, it } from "vitest";
import {
  ACTIVITY_PLAN_CATALOG_BASE_FRONT_MATTER_PAGES,
  ACTIVITY_PLAN_CATALOG_PAGE_SIZE,
  ACTIVITY_PLAN_CATALOG_PRINT_GEOMETRY,
  ACTIVITY_PLAN_CATALOG_WORKSHEET_PAGE_COUNT,
  ACTIVITY_PLAN_PORTFOLIO_METADATA,
  activityPlanCatalogNeedsBlankBeforeBackCover,
  assertActivityPlanCatalogLayout,
  buildActivityPlanCatalogLayout,
  buildActivityPlanCatalogModels,
  getActivityPlanCatalogContentPageCount,
  getActivityPlanCatalogInteriorMargins,
  getActivityPlanCatalogWorksheetStartPage,
  isActivityPlanTwoUpEligible,
} from "./activity-plan-catalog";
import {
  ActivityPlanCatalogPdfDocument,
  getActivityPlanCatalogExpectedPageCount,
} from "./activity-plan-catalog-pdf-document";

describe("activity plan catalog export", () => {
  it("builds one authored print model for every system template", () => {
    const entries = buildActivityPlanCatalogModels();
    expect(entries).toHaveLength(SYSTEM_TEMPLATES.length);
    expect(entries.every((entry) => entry.model.format === "full-page")).toBe(true);
    expect(entries.map((entry) => entry.model.title)).toEqual(
      SYSTEM_TEMPLATES.map((template) => template.name),
    );
    expect(new Set(entries.map((entry) => entry.key)).size).toBe(entries.length);
  });

  it("uses US Letter trim dimensions with one-eighth-inch bleed", () => {
    expect(ACTIVITY_PLAN_CATALOG_PAGE_SIZE).toEqual({ height: 810, width: 630 });
    expect(ACTIVITY_PLAN_CATALOG_PRINT_GEOMETRY).toEqual({
      bleedPoints: 9,
      pageHeight: 810,
      pageWidth: 630,
      trimHeight: 792,
      trimWidth: 612,
    });
  });

  it("mirrors the wider binding margin by physical page parity", () => {
    expect(getActivityPlanCatalogInteriorMargins(3)).toEqual({ left: 48, right: 30 });
    expect(getActivityPlanCatalogInteriorMargins(4)).toEqual({ left: 30, right: 48 });
    expect(getActivityPlanCatalogInteriorMargins(101)).toEqual({ left: 48, right: 30 });
  });

  it("starts worksheets after all rendered front matter when the catalog has no plans", () => {
    const layout = buildActivityPlanCatalogLayout([], []);

    expect(getActivityPlanCatalogWorksheetStartPage(layout)).toBe(6);
    expect(getActivityPlanCatalogContentPageCount(layout)).toBe(9);
    expect(activityPlanCatalogNeedsBlankBeforeBackCover(layout)).toBe(false);
    expect(getActivityPlanCatalogExpectedPageCount(layout)).toBe(10);
  });

  it("adds a duplex blank only when needed to place the back cover on an even page", () => {
    const layout = buildActivityPlanCatalogLayout(buildActivityPlanCatalogModels());
    const oppositeParityLayout = { ...layout, planPages: layout.planPages.slice(0, -1) };
    const layouts = [layout, oppositeParityLayout];

    expect(layouts.map(activityPlanCatalogNeedsBlankBeforeBackCover).sort()).toEqual([false, true]);
    for (const candidate of layouts) {
      expect(activityPlanCatalogNeedsBlankBeforeBackCover(candidate)).toBe(
        getActivityPlanCatalogContentPageCount(candidate) % 2 === 0,
      );
      expect(getActivityPlanCatalogExpectedPageCount(candidate) % 2).toBe(0);
    }
  });

  it("places every activity exactly once with no more than two activities per page", () => {
    const entries = buildActivityPlanCatalogModels();
    const layout = buildActivityPlanCatalogLayout(entries);
    expect(() => assertActivityPlanCatalogLayout(layout, entries)).not.toThrow();
    expect(entries).toHaveLength(198);
    expect(layout.planPages.flatMap((page) => page.entries).map((entry) => entry.key)).toHaveLength(
      entries.length,
    );
    expect(layout.planPages.every((page) => page.entries.length <= 2)).toBe(true);
    expect(layout.planPages.some((page) => page.entries.length === 2)).toBe(true);
    expect(
      layout.planPages
        .filter((page) => page.entries.length === 2)
        .every((page) => page.entries.every((entry) => isActivityPlanTwoUpEligible(entry.model))),
    ).toBe(true);
  });

  it("numbers plan pages after dynamically paginated contents", () => {
    const layout = buildActivityPlanCatalogLayout(buildActivityPlanCatalogModels());
    const frontMatterPages =
      ACTIVITY_PLAN_CATALOG_BASE_FRONT_MATTER_PAGES +
      layout.discoveryPages.length +
      layout.pathways.length +
      layout.contentsPages.length;
    expect(layout.planPages[0]?.pageNumber).toBe(frontMatterPages + 1);
    layout.planPages.forEach((page, index) => {
      expect(page.pageNumber).toBe(frontMatterPages + index + 1);
    });
  });

  it("indexes every plan with authoritative metadata while retaining unindexed plans in contents", () => {
    const entries = buildActivityPlanCatalogModels();
    const layout = buildActivityPlanCatalogLayout(entries);
    const indexedIds = layout.discoveryPages.flatMap((page) =>
      page.entries.map(({ entry }) => entry.key),
    );
    const metadataIds = ACTIVITY_PLAN_PORTFOLIO_METADATA.map((metadata) => metadata.templateId);
    const contentsIds = layout.contentsPages.flatMap((page) =>
      page.columns.flatMap((column) => column?.entries.map((entry) => entry.key) ?? []),
    );

    expect(indexedIds).toHaveLength(metadataIds.length);
    expect(new Set(indexedIds)).toEqual(new Set(metadataIds));
    expect(contentsIds).toHaveLength(entries.length);
    const unindexedIds = entries
      .filter((entry) => !metadataIds.includes(entry.key))
      .map((entry) => entry.key);
    expect(unindexedIds.length).toBeGreaterThan(0);
    expect(new Set(contentsIds)).toEqual(new Set(entries.map((entry) => entry.key)));
  });

  it("builds all eight complete guided pathways with dynamic plan references", () => {
    const layout = buildActivityPlanCatalogLayout(buildActivityPlanCatalogModels());
    expect(layout.pathways).toHaveLength(4);
    expect(layout.pathways.flatMap((page) => page.families)).toHaveLength(8);
    for (const family of layout.pathways.flatMap((page) => page.families)) {
      expect(family.entries.map(({ metadata }) => metadata.difficulty)).toEqual([
        "foundation",
        "development",
        "advanced",
        "race-specific",
      ]);
      for (const { entry } of family.entries) {
        expect(
          layout.planPages.find((page) =>
            page.entries.some((candidate) => candidate.key === entry.key),
          )?.pageNumber,
        ).toBeGreaterThan(0);
      }
    }
  });

  it("fails layout construction when configured pathway metadata is incomplete", () => {
    const incompleteMetadata = ACTIVITY_PLAN_PORTFOLIO_METADATA.filter(
      (metadata) =>
        !(metadata.family === "bike:aerobic-durability" && metadata.difficulty === "foundation"),
    );

    expect(() =>
      buildActivityPlanCatalogLayout(buildActivityPlanCatalogModels(), incompleteMetadata),
    ).toThrow("Catalog pathway bike:aerobic-durability does not have four authoritative levels");
  });

  it("renders dynamically paginated contents for 200 long-titled plans", async () => {
    const fixture = buildActivityPlanCatalogModels()[0];
    if (!fixture) throw new Error("Expected a catalog fixture");
    const entries = Array.from({ length: 200 }, (_, index) => ({
      ...fixture,
      key: `fixture-${index}`,
      model: {
        ...fixture.model,
        title: `Long-distance race preparation and technique development catalog plan ${index + 1}`,
      },
    }));
    const layout = buildActivityPlanCatalogLayout(entries, []);
    const contentsEntries = layout.contentsPages.flatMap((page) =>
      page.columns.flatMap((section) => section?.entries ?? []),
    );

    expect(layout.contentsPages.length).toBeGreaterThan(1);
    expect(contentsEntries.map((entry) => entry.key)).toEqual(entries.map((entry) => entry.key));
    expect(
      layout.contentsPages
        .flatMap((page) => page.columns)
        .every((column) => !column || column.entries.length <= 46),
    ).toBe(true);
    const blob = await pdf(<ActivityPlanCatalogPdfDocument layout={layout} />).toBlob();
    const source = Buffer.from(await blob.arrayBuffer()).toString("latin1");
    expect(source.match(/\/Type\s*\/Page\b/gu)?.length ?? 0).toBe(
      getActivityPlanCatalogExpectedPageCount(layout),
    );
  });

  it("falls back to separate full pages when either activity exceeds the two-up budget", () => {
    const entries = buildActivityPlanCatalogModels().slice(0, 2);
    const first = entries[0];
    if (!first) throw new Error("Expected a catalog fixture");
    const oversized = {
      ...first,
      model: { ...first.model, description: "Long catalog copy. ".repeat(500) },
    };
    expect(isActivityPlanTwoUpEligible(oversized.model)).toBe(false);
    const layout = buildActivityPlanCatalogLayout([oversized, ...entries.slice(1)], []);
    expect(layout.planPages.map((page) => page.entries.length)).toEqual([1, 1]);
  });

  it("pairs the nearest eligible activities within a section without crossing categories", () => {
    const entries = buildActivityPlanCatalogModels();
    const firstEligible = entries.find((entry) => isActivityPlanTwoUpEligible(entry.model));
    const secondEligible = entries.find(
      (entry) =>
        entry.key !== firstEligible?.key &&
        entry.model.activityCategory === firstEligible?.model.activityCategory &&
        isActivityPlanTwoUpEligible(entry.model),
    );
    if (!firstEligible || !secondEligible)
      throw new Error("Expected two eligible catalog fixtures");
    const oversized = {
      ...firstEligible,
      key: "oversized-catalog-fixture",
      model: { ...firstEligible.model, description: "Long catalog copy. ".repeat(500) },
    };
    const layout = buildActivityPlanCatalogLayout([firstEligible, oversized, secondEligible], []);
    expect(layout.planPages[0]?.entries.map((entry) => entry.key)).toEqual([
      firstEligible.key,
      secondEligible.key,
    ]);
    expect(layout.planPages[1]?.entries).toEqual([oversized]);
  });

  it("renders exactly the planned pages without an overflow continuation", async () => {
    const layout = buildActivityPlanCatalogLayout(buildActivityPlanCatalogModels());
    const blob = await pdf(<ActivityPlanCatalogPdfDocument layout={layout} />).toBlob();
    expect(blob.type).toBe("application/pdf");
    expect(blob.size).toBeGreaterThan(1_000);
    const source = Buffer.from(await blob.arrayBuffer()).toString("latin1");
    const renderedPageCount = source.match(/\/Type\s*\/Page\b/gu)?.length ?? 0;
    expect(renderedPageCount).toBe(getActivityPlanCatalogExpectedPageCount(layout));
    expect(renderedPageCount % 2).toBe(0);
    expect(getActivityPlanCatalogExpectedPageCount(layout)).toBe(
      ACTIVITY_PLAN_CATALOG_BASE_FRONT_MATTER_PAGES +
        layout.discoveryPages.length +
        layout.pathways.length +
        layout.contentsPages.length +
        layout.planPages.length +
        ACTIVITY_PLAN_CATALOG_WORKSHEET_PAGE_COUNT +
        (activityPlanCatalogNeedsBlankBeforeBackCover(layout) ? 1 : 0) +
        1,
    );
  });
});
