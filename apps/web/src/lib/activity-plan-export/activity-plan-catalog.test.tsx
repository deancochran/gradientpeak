import "../../../scripts/catalog-fonts";
import { pdf } from "@react-pdf/renderer";
import {
  ALL_SAMPLE_PLANS,
  persistedTrainingPlanStructureSchema,
  SYSTEM_TEMPLATES,
  type SystemTrainingPlanTemplate,
} from "@repo/core";
import { describe, expect, it } from "vitest";
import {
  ACTIVITY_PLAN_CATALOG_BASE_FRONT_MATTER_PAGES,
  ACTIVITY_PLAN_CATALOG_PAGE_SIZE,
  ACTIVITY_PLAN_CATALOG_PRINT_GEOMETRY,
  activityPlanCatalogNeedsBlankBeforeBackCover,
  assertActivityPlanCatalogLayout,
  buildActivityPlanCatalogLayout,
  buildActivityPlanCatalogModels,
  formatActivityPlanCatalogDuration,
  formatActivityPlanCatalogInstruction,
  formatActivityPlanCatalogTotal,
  getActivityPlanCatalogContentPageCount,
  getActivityPlanCatalogInteriorMargins,
  getActivityPlanCatalogTimedProfileWidths,
  measureActivityPlanCatalogFragments,
} from "./activity-plan-catalog";
import {
  ActivityPlanCatalogPdfDocument,
  ActivityPlanCatalogProfile,
  getActivityPlanCatalogExpectedPageCount,
} from "./activity-plan-catalog-pdf-document";

function createLocalV5ShortCatalogFixture() {
  const source = buildActivityPlanCatalogModels().find(
    (entry) => entry.model.title === "Recovery Feel Swim",
  );
  if (!source) throw new Error("Expected active V5 catalog source fixture");
  return {
    ...source,
    key: "local-v5-short-catalog-fixture",
    model: { ...source.model, title: "Local V5 Short Fixture" },
  };
}

function createLocalTrainingPlanFixture(activityPlanId: string): SystemTrainingPlanTemplate {
  return {
    id: "20000000-0000-4000-8000-000000000001",
    name: "Local V5 schedule fixture",
    description: "Test-only schedule coverage for the catalog builder.",
    sessions_per_week_target: 1,
    duration_hours: 2,
    structure: persistedTrainingPlanStructureSchema.parse({
      id: "20000000-0000-4000-8000-000000000001",
      version: 1,
      plan_preferences: {
        weekly_session_count: null,
        target_weekly_duration_minutes: null,
        maximum_session_duration_minutes: null,
        preferred_weekdays: [],
        rest_days: [],
        progression_style: null,
        recovery_priority: null,
      },
      sessions: [
        {
          id: "20000000-0000-4000-8000-000000000101",
          offset_days: 0,
          activity_plan_id: activityPlanId,
          demand: {
            activity_category: "swim",
            training_intent: "aerobic_base",
            target_duration_minutes: null,
            target_common_load: null,
            importance: "normal",
          },
          event_overrides: { title: "Local fixture session" },
        },
      ],
    }),
  };
}

describe("activity plan catalog export", () => {
  it.each([
    "FTP Intervals",
    "Threshold Intervals",
  ])("renders %s as a text-free, bottom-aligned profile", (title) => {
    const model = buildActivityPlanCatalogModels().find(
      (entry) => entry.model.title === title,
    )?.model;
    if (!model) throw new Error(`Missing ${title}`);
    const profile = ActivityPlanCatalogProfile({ model });
    const svg = profile?.props.children;
    expect(svg.type).toBe("SVG");
    expect(svg.props.viewBox).toBe("0 0 100 100");
    const bars = svg.props.children;
    expect(bars).toHaveLength(model.intensityProfile.length);
    for (const bar of bars) {
      expect(bar.type).toBe("RECT");
      expect(bar.props.y + bar.props.height).toBe(100);
      expect(bar.props.children).toBeUndefined();
    }
  });
  it("removes only known migration wrappers from athlete-facing cues", () => {
    const source =
      "Notes:\nMaintain steady cadence.\n\nBlock context:\nSegment: bike activity\n\nInterval:\nThreshold";
    expect(
      formatActivityPlanCatalogInstruction({
        activityCategory: "bike",
        instructions: source,
        name: "Threshold",
      }),
    ).toBe("Maintain steady cadence.");
    expect(
      formatActivityPlanCatalogInstruction({
        activityCategory: "bike",
        instructions: "Block context:\nSegment: run activity\n\nInterval:\nDifferent interval",
        name: "Threshold",
      }),
    ).toBe("Block context:\nSegment: run activity\n\nInterval:\nDifferent interval");
    expect(source).toContain("Block context:");
  });

  it("uses compact totals and exact timed profile widths without implying mixed-unit elapsed time", () => {
    expect(formatActivityPlanCatalogTotal("Time: 1h 13m")).toBe("73 min");
    expect(formatActivityPlanCatalogDuration("8m 30s")).toBe("8 min 30 sec");
    expect(formatActivityPlanCatalogDuration("400 m")).toBe("400 m");
    expect(formatActivityPlanCatalogTotal("Timed subtotal: 1m 30s")).toBe("Timed: 1 min 30 sec");
    expect(formatActivityPlanCatalogTotal("Distance: 2 km")).toBe("Distance: 2 km");
    expect(
      getActivityPlanCatalogTimedProfileWidths([
        { durationSeconds: 480 },
        { durationSeconds: 240 },
        { durationSeconds: 1_200 },
      ]),
    ).toEqual([25, 12.5, 62.5]);
    expect(
      getActivityPlanCatalogTimedProfileWidths([
        { durationSeconds: 480 },
        { durationSeconds: null },
      ]),
    ).toBeNull();
  });
  it("builds one authored print model for every system template", () => {
    const entries = buildActivityPlanCatalogModels();
    expect(entries).toHaveLength(SYSTEM_TEMPLATES.length);
    expect(entries.every((entry) => entry.model.format === "full-page")).toBe(true);
    expect(entries.map((entry) => entry.model.title)).toEqual(
      SYSTEM_TEMPLATES.map((template) => template.name),
    );
    expect(new Set(entries.map((entry) => entry.key)).size).toBe(entries.length);
    expect(entries.find((entry) => entry.model.title === "FTP Intervals")).toBeTruthy();
    const steps = entries.flatMap((entry) =>
      entry.model.sections.flatMap((section) => section.groups.flatMap((group) => group.steps)),
    );
    expect(steps.every((step) => step.durationLabel)).toBe(true);
    expect(steps.every((step) => Array.isArray(step.targetLabels))).toBe(true);
  });

  it("uses exact A5 trim dimensions with one-eighth-inch bleed", () => {
    expect(ACTIVITY_PLAN_CATALOG_PAGE_SIZE).toEqual({ height: 613.275591, width: 437.527559 });
    expect(ACTIVITY_PLAN_CATALOG_PRINT_GEOMETRY).toEqual({
      bleedPoints: 9,
      pageHeight: 613.275591,
      pageWidth: 437.527559,
      trimHeight: 595.275591,
      trimWidth: 419.527559,
    });
  });

  it("mirrors the wider binding margin by physical page parity", () => {
    expect(getActivityPlanCatalogInteriorMargins(3)).toEqual({ left: 52.2, right: 27 });
    expect(getActivityPlanCatalogInteriorMargins(4)).toEqual({ left: 27, right: 52.2 });
    expect(getActivityPlanCatalogInteriorMargins(101)).toEqual({ left: 52.2, right: 27 });
  });

  it("starts every activity on a separate full page", () => {
    const entries = buildActivityPlanCatalogModels();
    const layout = buildActivityPlanCatalogLayout(entries, []);
    expect(() => assertActivityPlanCatalogLayout(layout, entries)).not.toThrow();
    expect(entries).toHaveLength(SYSTEM_TEMPLATES.length);
    expect(
      new Set(layout.planPages.flatMap((page) => page.entries.map((entry) => entry.entry.key))),
    ).toEqual(new Set(entries.map((entry) => entry.key)));
    expect(layout.planPages.every((page) => page.entries.length === 1)).toBe(true);
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
      expect(section.firstEntryKey).toBe(pages[0]?.entries[0].entry.key);
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
  }, 15_000);

  it("uses rendered-fit callbacks for ordered continuations without an estimate", async () => {
    const entry = buildActivityPlanCatalogModels()[0];
    if (!entry) throw new Error("Expected catalog fixture");
    const section = entry.model.sections[0];
    const group = section?.groups[0];
    const step = group?.steps[0];
    if (!section || !group || !step) throw new Error("Expected a catalog group fixture");
    const oversized = {
      ...entry,
      model: {
        ...entry.model,
        sections: [
          {
            ...section,
            groups: Array.from({ length: 5 }, (_, index) => ({
              ...group,
              id: `${group.id}-${index}`,
              steps: [{ ...step, id: `${step.id}-${index}` }],
            })),
          },
        ],
      },
    };
    const fragments = await measureActivityPlanCatalogFragments(
      oversized,
      async (fragment) =>
        fragment.model.sections.flatMap((candidate) => candidate.groups).length <= 2,
    );
    expect(fragments.length).toBeGreaterThan(1);
    expect(fragments.map((fragment) => fragment.partIndex)).toEqual(
      fragments.map((_, index) => index),
    );
    expect(
      fragments.flatMap((fragment) =>
        fragment.model.sections.flatMap((section) =>
          section.groups.flatMap((group) => group.steps.map((step) => step.id)),
        ),
      ),
    ).toEqual(
      oversized.model.sections.flatMap((section) =>
        section.groups.flatMap((group) => group.steps.map((step) => step.id)),
      ),
    );
  });

  it("keeps a naturally short activity on its dedicated first page", async () => {
    const entry = createLocalV5ShortCatalogFixture();
    const fragments = await measureActivityPlanCatalogFragments(entry, async () => true);
    const layout = buildActivityPlanCatalogLayout([entry], [], new Map([[entry.key, fragments]]));
    expect(fragments).toHaveLength(1);
    expect(layout.planPages).toHaveLength(1);
    expect(layout.planPages[0]?.entries[0].entry.key).toBe(entry.key);
  });

  it("does not split early when removing a continuation notice makes a longer fragment fit", async () => {
    const entry = buildActivityPlanCatalogModels()[0];
    const section = entry?.model.sections[0];
    const group = section?.groups[0];
    const step = group?.steps[0];
    if (!entry || !section || !group || !step) throw new Error("Expected a catalog group fixture");
    const synthetic = {
      ...entry,
      model: {
        ...entry.model,
        sections: [
          {
            ...section,
            groups: Array.from({ length: 10 }, (_, index) => ({
              ...group,
              id: `${group.id}-notice-${index}`,
              steps: [{ ...step, id: `${step.id}-notice-${index}` }],
            })),
          },
        ],
      },
    };
    const fragments = await measureActivityPlanCatalogFragments(synthetic, async (fragment) => {
      const length = fragment.model.sections.flatMap((candidate) => candidate.groups).length;
      return length === 10 || length <= 3;
    });
    expect(
      fragments[0]?.model.sections.flatMap((section) =>
        section.groups.flatMap((group) => group.steps),
      ),
    ).toHaveLength(10);
  });

  it("splits a synthetic long repeat group at step boundaries without changing its repeat count", async () => {
    const entries = buildActivityPlanCatalogModels().slice(0, 2);
    const first = entries[0];
    if (!first) throw new Error("Expected a catalog fixture");
    const firstSection = first.model.sections[0];
    if (!firstSection) throw new Error("Expected catalog section");
    const group = firstSection.groups[0];
    if (!group) throw new Error("Expected catalog group");
    const firstStep = group.steps[0];
    if (!firstStep) throw new Error("Expected catalog step");
    const oversized = {
      ...first,
      model: {
        ...first.model,
        sections: [
          {
            ...firstSection,
            groups: [
              {
                ...group,
                repetitions: 4,
                steps: Array.from({ length: 80 }, (_, index) => ({
                  ...firstStep,
                  id: `${firstStep.id}-${index}`,
                })),
              },
            ],
          },
        ],
      },
    };
    const fragments = await measureActivityPlanCatalogFragments(
      oversized,
      async (fragment) =>
        fragment.model.sections[0]?.groups[0]?.steps.length === undefined ||
        fragment.model.sections[0].groups[0].steps.length <= 4,
    );
    expect(fragments.length).toBeGreaterThan(1);
    expect(
      fragments.every((fragment) => fragment.model.sections[0]?.groups[0]?.repetitions === 4),
    ).toBe(true);
    expect(
      fragments.slice(1).every((fragment) => fragment.continuedGroupIds.includes(group.id)),
    ).toBe(true);
    expect(
      fragments
        .slice(0, -1)
        .every((fragment) => fragment.continuesAfterGroupIds.includes(group.id)),
    ).toBe(true);
  });

  it("omits retired production training templates and builds readable local V5 schedule pages", () => {
    expect(ALL_SAMPLE_PLANS).toEqual([]);
    const entries = buildActivityPlanCatalogModels();
    expect(buildActivityPlanCatalogLayout(entries).trainingPlanSection).toBeNull();
    const localPlan = createLocalTrainingPlanFixture(entries[0]?.key ?? "");
    const layout = buildActivityPlanCatalogLayout(entries, [localPlan]);
    const section = layout.trainingPlanSection;
    if (!section) throw new Error("Expected training plan template pages");

    expect(section.openerPageNumber % 2).toBe(1);
    expect(section.plans).toHaveLength(1);
    expect(section.plans.map((plan) => plan.name)).toEqual([localPlan.name]);
    section.plans.forEach((plan) => {
      expect(plan.overviewPageNumber).toBeGreaterThan(section.openerPageNumber);
      expect(plan.schedulePageNumbers[0]).toBe(plan.overviewPageNumber + 1);
      expect(plan.schedulePageNumbers.length).toBeGreaterThanOrEqual(1);
      expect(plan.weeks).toHaveLength(plan.scheduleVisual.totalWeeks);
      expect(plan.weeks.flatMap((week) => week.sessions)).toHaveLength(
        plan.scheduleVisual.totalSessions,
      );
    });
  });

  it("resolves every local training fixture session to an activity catalog page", () => {
    const entries = buildActivityPlanCatalogModels();
    const localPlan = createLocalTrainingPlanFixture(entries[0]?.key ?? "");
    const layout = buildActivityPlanCatalogLayout(entries, [localPlan]);
    const activityPageNumbers = new Map(
      layout.planPages.flatMap((page) =>
        page.entries
          .filter((fragment) => fragment.partIndex === 0)
          .map((fragment) => [fragment.entry.key, page.pageNumber]),
      ),
    );
    const sessions =
      layout.trainingPlanSection?.plans.flatMap((plan) =>
        plan.weeks.flatMap((week) => week.sessions),
      ) ?? [];

    expect(sessions).toHaveLength(localPlan.structure.sessions.length);
    for (const session of sessions) {
      expect(session.activityPageNumber).toBe(activityPageNumbers.get(session.activityPlanId));
      expect(session.targetDurationMinutes).toBeNull();
      expect(session.targetCommonLoad).toBeNull();
    }
  });

  it("renders exactly the catalog pages and an even-page back cover", async () => {
    const entry = createLocalV5ShortCatalogFixture();
    const fragments = await measureActivityPlanCatalogFragments(entry, async () => true);
    const layout = buildActivityPlanCatalogLayout([entry], [], new Map([[entry.key, fragments]]));
    const blob = await pdf(<ActivityPlanCatalogPdfDocument layout={layout} />).toBlob();
    expect(blob.type).toBe("application/pdf");
    expect(blob.size).toBeGreaterThan(1_000);
    const source = Buffer.from(await blob.arrayBuffer()).toString("latin1");
    const renderedPageCount = source.match(/\/Type\s*\/Page\b/gu)?.length ?? 0;
    expect(renderedPageCount).toBe(getActivityPlanCatalogExpectedPageCount(layout));
    expect(renderedPageCount % 2).toBe(0);
    expect(getActivityPlanCatalogContentPageCount(layout)).toBe(
      layout.planPages.at(-1)?.pageNumber,
    );
    expect(getActivityPlanCatalogExpectedPageCount(layout)).toBe(
      getActivityPlanCatalogContentPageCount(layout) +
        (activityPlanCatalogNeedsBlankBeforeBackCover(layout) ? 1 : 0) +
        2,
    );
  });
});
