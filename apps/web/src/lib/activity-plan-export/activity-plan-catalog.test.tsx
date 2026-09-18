import { pdf } from "@react-pdf/renderer";
import { ALL_SAMPLE_PLANS, SYSTEM_TEMPLATES } from "@repo/core";
import { describe, expect, it } from "vitest";
import {
  ACTIVITY_PLAN_CATALOG_BASE_FRONT_MATTER_PAGES,
  ACTIVITY_PLAN_CATALOG_PAGE_SIZE,
  ACTIVITY_PLAN_CATALOG_PRINT_GEOMETRY,
  activityPlanCatalogNeedsBlankBeforeBackCover,
  assertActivityPlanCatalogLayout,
  buildActivityPlanCatalogLayout,
  buildActivityPlanCatalogModels,
  getActivityPlanCatalogContentPageCount,
  getActivityPlanCatalogInteriorMargins,
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
    const adaptable = entries.find((entry) => entry.model.title === "Aerobic Durability Ride");
    expect(adaptable?.adaptation).toEqual({
      allowedStates: expect.arrayContaining([expect.stringContaining("45 minutes")]),
      controls: [expect.stringContaining("Main-set duration: default 1h 10m")],
    });
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

  it("places every activity exactly once with no more than two activities per page", () => {
    const entries = buildActivityPlanCatalogModels();
    const layout = buildActivityPlanCatalogLayout(entries, []);
    expect(() => assertActivityPlanCatalogLayout(layout, entries)).not.toThrow();
    expect(entries).toHaveLength(SYSTEM_TEMPLATES.length);
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

  it("numbers plan pages immediately after dynamically paginated front matter", () => {
    const layout = buildActivityPlanCatalogLayout(buildActivityPlanCatalogModels());
    const frontMatterPages =
      ACTIVITY_PLAN_CATALOG_BASE_FRONT_MATTER_PAGES + layout.contentsPages.length;
    expect(layout.planPages[0]?.pageNumber).toBe(frontMatterPages + 1);
    layout.planPages.forEach((page, index) => {
      expect(page.pageNumber).toBe(frontMatterPages + index + 1);
    });
  });

  it("keeps every plan in the direct activity-category contents", () => {
    const entries = buildActivityPlanCatalogModels();
    const layout = buildActivityPlanCatalogLayout(entries);
    const contentsIds = layout.contentsPages.flatMap((page) =>
      page.columns.flatMap((column) => column?.entries.map((entry) => entry.key) ?? []),
    );
    expect(contentsIds).toHaveLength(entries.length);
    expect(new Set(contentsIds)).toEqual(new Set(entries.map((entry) => entry.key)));
  });

  it("builds a linked finder index with complete section counts and page ranges", () => {
    const layout = buildActivityPlanCatalogLayout(buildActivityPlanCatalogModels());
    expect(layout.finderSections.map((section) => section.entryCount)).toEqual(
      layout.sections.map((section) => section.entries.length),
    );
    for (const section of layout.finderSections) {
      const pages = layout.planPages.filter((page) => page.sectionKey === section.key);
      expect(section.firstEntryKey).toBe(pages[0]?.entries[0].key);
      expect(section.startPageNumber).toBe(pages[0]?.pageNumber);
      expect(section.endPageNumber).toBe(pages.at(-1)?.pageNumber);
    }
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
    const blob = await pdf(<ActivityPlanCatalogPdfDocument layout={layout} />).toBlob();
    const source = Buffer.from(await blob.arrayBuffer()).toString("latin1");
    expect(source.match(/\/Type\s*\/Page\b/gu)?.length ?? 0).toBe(
      getActivityPlanCatalogExpectedPageCount(layout),
    );
  }, 15_000);

  it("falls back to separate full pages when either activity exceeds the two-up budget", () => {
    const entries = buildActivityPlanCatalogModels().slice(0, 2);
    const first = entries[0];
    if (!first) throw new Error("Expected a catalog fixture");
    const oversized = {
      ...first,
      model: { ...first.model, description: "Long catalog copy. ".repeat(500) },
    };
    expect(isActivityPlanTwoUpEligible(oversized.model)).toBe(false);
    expect(
      buildActivityPlanCatalogLayout([oversized, ...entries.slice(1)], []).planPages,
    ).toHaveLength(2);
  });

  it("builds one complete facing-page spread for every system training template", () => {
    const layout = buildActivityPlanCatalogLayout(buildActivityPlanCatalogModels());
    const section = layout.trainingPlanSection;
    if (!section) throw new Error("Expected training plan template pages");

    expect(section.openerPageNumber % 2).toBe(1);
    expect(section.plans).toHaveLength(ALL_SAMPLE_PLANS.length);
    expect(section.plans.map((plan) => plan.name)).toEqual(
      ALL_SAMPLE_PLANS.map((plan) => plan.name),
    );
    section.plans.forEach((plan, index) => {
      expect(plan.overviewPageNumber).toBe(section.openerPageNumber + 1 + index * 2);
      expect(plan.overviewPageNumber % 2).toBe(0);
      expect(plan.schedulePageNumber).toBe(plan.overviewPageNumber + 1);
      expect(plan.weeks).toHaveLength(plan.scheduleVisual.totalWeeks);
      expect(plan.weeks.flatMap((week) => week.sessions)).toHaveLength(
        plan.scheduleVisual.totalSessions,
      );
    });
  });

  it("resolves every scheduled training session to an activity catalog page", () => {
    const curatedDurationObjectiveIds = new Set([
      "1b4c5d6e-7f8a-4b0c-9d2e-3f4a5b6c7d8e",
      "3b6c7d8e-9f0a-4b2c-bd4e-5f6a7b8c9d0e",
      "8c1d2e3f-4a5b-4c7d-8e9f-0a1b2c3d4e5f",
    ]);
    const layout = buildActivityPlanCatalogLayout(buildActivityPlanCatalogModels());
    const activityPageNumbers = new Map(
      layout.planPages.flatMap((page) => page.entries.map((entry) => [entry.key, page.pageNumber])),
    );
    const sessions =
      layout.trainingPlanSection?.plans.flatMap((plan) =>
        plan.weeks.flatMap((week) => week.sessions),
      ) ?? [];

    expect(sessions).toHaveLength(
      ALL_SAMPLE_PLANS.reduce((total, plan) => total + plan.structure.sessions.length, 0),
    );
    for (const session of sessions) {
      expect(session.activityPageNumber).toBe(activityPageNumbers.get(session.activityPlanId));
      expect(
        session.targetDurationMinutes === null ||
          curatedDurationObjectiveIds.has(session.activityPlanId),
      ).toBe(true);
      expect(session.targetCommonLoad).toBeNull();
    }
  });

  it("renders exactly the catalog pages and an even-page back cover", async () => {
    const layout = buildActivityPlanCatalogLayout(buildActivityPlanCatalogModels());
    const blob = await pdf(<ActivityPlanCatalogPdfDocument layout={layout} />).toBlob();
    expect(blob.type).toBe("application/pdf");
    expect(blob.size).toBeGreaterThan(1_000);
    const source = Buffer.from(await blob.arrayBuffer()).toString("latin1");
    const renderedPageCount = source.match(/\/Type\s*\/Page\b/gu)?.length ?? 0;
    expect(renderedPageCount).toBe(getActivityPlanCatalogExpectedPageCount(layout));
    expect(renderedPageCount % 2).toBe(0);
    expect(getActivityPlanCatalogContentPageCount(layout)).toBe(
      layout.trainingPlanSection?.plans.at(-1)?.schedulePageNumber,
    );
    expect(getActivityPlanCatalogExpectedPageCount(layout)).toBe(
      getActivityPlanCatalogContentPageCount(layout) +
        (activityPlanCatalogNeedsBlankBeforeBackCover(layout) ? 1 : 0) +
        1,
    );
  });
});
