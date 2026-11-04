import { ALL_SAMPLE_PLANS, SYSTEM_TEMPLATES } from "@repo/core";
import React from "react";
import { describe, expect, it } from "vitest";
import {
  assertActivityPlanCatalogLayout,
  buildActivityPlanCatalogLayout,
  buildActivityPlanCatalogModels,
  buildPublisherActivityPlanCatalogModels,
  getActivityPlanCatalogTimedProfileWidths,
  PUBLISHER_EXCLUDED_TEMPLATE_IDS,
} from "./activity-plan-catalog";
import {
  ACTIVITY_CATEGORY_PDF_LUCIDE_NODES,
  ActivityCategoryPdfIcon,
  ActivityPlanDistanceCatalogActivityPlanPage,
  buildActivityPlanDistanceCatalogCompleteBookPlan,
  DISTANCE_CATALOG_CONVERSION_PANELS,
  DISTANCE_CATALOG_CONVERSION_PERCENTAGES,
  formatDistanceCatalogPrescription,
  getDistanceCatalogConversionValue,
  getDistanceCatalogCuePresentation,
  getDistanceCatalogHeaderChips,
  getDistanceCatalogPrescriptionPlacement,
  getDistanceCatalogPrescriptionPlacementKey,
  getDistanceCatalogProfileBars,
  getDistanceCatalogStepAccent,
} from "./activity-plan-distance-catalog-document";

describe("distance-reading activity-plan catalog", () => {
  it("standardizes all activityPlan headers to distance and duration only", () => {
    for (const entry of buildPublisherActivityPlanCatalogModels()) {
      const chips = getDistanceCatalogHeaderChips(entry.model);
      expect(chips).toHaveLength(2);
      expect(chips[0]).toMatch(/^Distance(?: subtotal)?:/);
      expect(chips[1]).toMatch(/^Duration:/);
      expect(chips.join(" ")).not.toMatch(/Intensity|Active time|Repetitions|\breps\b|Rest:/);
    }
  });

  it("does not mistake timed rest for the total duration of a distance activityPlan", () => {
    const entry = buildPublisherActivityPlanCatalogModels().find(
      (candidate) => candidate.model.title === "Track 400m Repeats",
    );
    if (!entry) throw new Error("Missing track fixture");
    expect(getDistanceCatalogHeaderChips(entry.model)).toEqual([
      "Distance: 6.4 km",
      "Duration: Variable",
    ]);
  });

  it("includes passive rest in fully timed duration", () => {
    const entry = buildPublisherActivityPlanCatalogModels()[0];
    if (!entry) throw new Error("Missing catalog fixture");
    const bar = entry.model.intensityProfile[0];
    if (!bar) throw new Error("Missing profile fixture");
    expect(
      getDistanceCatalogHeaderChips({
        ...entry.model,
        totals: ["Active time: 2m", "Rest: 30s"],
        intensityProfile: [
          { ...bar, label: "RPE 8", durationSeconds: 120 },
          { ...bar, label: "Rest", durationSeconds: 30 },
        ],
      }),
    ).toEqual(["Distance: Not prescribed", "Duration: 2 min 30 sec"]);
  });

  it("does not show rep-based strength timed subtotals as total duration", () => {
    const entry = buildPublisherActivityPlanCatalogModels().find(
      (candidate) => candidate.model.title === "Upper Body Strength",
    );
    if (!entry) throw new Error("Missing strength fixture");
    expect(getDistanceCatalogHeaderChips(entry.model)).toEqual([
      "Distance: Not prescribed",
      "Duration: Variable",
    ]);
  });
  it("keeps duration and all authored targets inline without inventing targets", () => {
    expect(
      formatDistanceCatalogPrescription({
        durationLabel: "2m",
        targetLabels: ["50% FTP", "90 rpm"],
      }),
    ).toBe("2min @ 50%FTP 90rpm");
    expect(
      formatDistanceCatalogPrescription({
        durationLabel: "8m",
        targetLabels: ["95% Threshold HR"],
      }),
    ).toBe("8min @ 95%THR");
    expect(
      formatDistanceCatalogPrescription({
        durationLabel: "4m",
        targetLabels: ["80% Max HR"],
      }),
    ).toBe("4min @ 80%HRmax");
    expect(
      formatDistanceCatalogPrescription({
        durationLabel: "400 m",
        targetLabels: [],
      }),
    ).toBe("400m");
    expect(
      formatDistanceCatalogPrescription({
        durationLabel: "Open",
        targetLabels: ["6 RPE"],
      }),
    ).toBe("Open @ 6 RPE");
    expect(
      formatDistanceCatalogPrescription({ durationLabel: "30 sec", targetLabels: ["120% FTP"] }),
    ).toBe("30sec @ 120%FTP");
    expect(
      formatDistanceCatalogPrescription({
        durationLabel: "2 min 30 sec",
        targetLabels: ["55% FTP"],
      }),
    ).toBe("2min 30sec @ 55%FTP");
    expect(formatDistanceCatalogPrescription({ durationLabel: "1 km", targetLabels: [] })).toBe(
      "1km",
    );
  });

  it("uses actual name and target widths at the readable-gap boundary", () => {
    // 204 + 8 + 300 exactly fills the actual row, so neither run wraps.
    expect(getDistanceCatalogPrescriptionPlacement(204, 300, 512)).toBe("inline");
    expect(getDistanceCatalogPrescriptionPlacement(204.01, 300, 512)).toBe("below");
    expect(getDistanceCatalogPrescriptionPlacement(20, 300, 512)).toBe("inline");
    expect(getDistanceCatalogPrescriptionPlacement(205, 300, 512)).toBe("below");
    expect(() => getDistanceCatalogPrescriptionPlacement(20, 512.01, 512)).toThrow(
      "wider than its full step width",
    );
  });

  it("qualifies identical local step IDs by activityPlan before storing placement", () => {
    const placements = new Map([
      [
        getDistanceCatalogPrescriptionPlacementKey("vo2", "step-1"),
        { placement: "inline", prescriptionWidth: 180 },
      ],
      [
        getDistanceCatalogPrescriptionPlacementKey("recovery", "step-1"),
        { placement: "below", prescriptionWidth: 240 },
      ],
    ] as const);
    expect(placements).toHaveLength(2);
    expect(placements.get(getDistanceCatalogPrescriptionPlacementKey("vo2", "step-1"))).toEqual({
      placement: "inline",
      prescriptionWidth: 180,
    });
    expect(
      placements.get(getDistanceCatalogPrescriptionPlacementKey("recovery", "step-1")),
    ).toEqual({
      placement: "below",
      prescriptionWidth: 240,
    });
  });
  it("keeps every authored activityPlan and every scheduled training-template session", () => {
    const entries = buildActivityPlanCatalogModels();
    const layout = buildActivityPlanCatalogLayout(entries);
    assertActivityPlanCatalogLayout(layout, entries);
    expect(entries).toHaveLength(SYSTEM_TEMPLATES.length);
    expect(ALL_SAMPLE_PLANS).toEqual([]);
    expect(layout.trainingPlanSection).toBeNull();
  });

  it("excludes exactly two publisher-only activityPlans while retaining the active system registry", () => {
    const entries = buildPublisherActivityPlanCatalogModels();
    const excludedNames = SYSTEM_TEMPLATES.filter((template) =>
      PUBLISHER_EXCLUDED_TEMPLATE_IDS.has(template.id),
    ).map((template) => template.name);

    expect(SYSTEM_TEMPLATES).toHaveLength(68);
    expect(PUBLISHER_EXCLUDED_TEMPLATE_IDS.size).toBe(2);
    expect(entries).toHaveLength(66);
    expect(entries.map((entry) => entry.key)).not.toEqual(
      expect.arrayContaining([...PUBLISHER_EXCLUDED_TEMPLATE_IDS]),
    );
    expect(excludedNames).toEqual(["CrossFit WOD", "Other Race Simulation"]);
  });

  it("uses the installed Lucide category geometry for all 66 publisher activityPlans", () => {
    const publisherEntries = buildPublisherActivityPlanCatalogModels();
    expect(publisherEntries).toHaveLength(66);
    expect(new Set(publisherEntries.map((entry) => entry.model.activityCategory))).toEqual(
      new Set(["bike", "run", "swim", "strength", "other"]),
    );
    // apps/mobile/lib/constants/activities.ts is the canonical product mapping:
    // Bike, Footprints, Waves, Dumbbell, Activity.
    expect(ACTIVITY_CATEGORY_PDF_LUCIDE_NODES).toEqual({
      bike: [
        ["circle", { cx: "18.5", cy: "17.5", r: "3.5" }],
        ["circle", { cx: "5.5", cy: "17.5", r: "3.5" }],
        ["circle", { cx: "15", cy: "5", r: "1" }],
        ["path", { d: "M12 17.5V14l-3-3 4-3 2 3h2" }],
      ],
      run: [
        [
          "path",
          {
            d: "M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z",
          },
        ],
        [
          "path",
          {
            d: "M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z",
          },
        ],
        ["path", { d: "M16 17h4" }],
        ["path", { d: "M4 13h4" }],
      ],
      swim: [
        [
          "path",
          {
            d: "M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1",
          },
        ],
        [
          "path",
          {
            d: "M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1",
          },
        ],
        [
          "path",
          {
            d: "M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1",
          },
        ],
      ],
      strength: [
        [
          "path",
          {
            d: "M17.596 12.768a2 2 0 1 0 2.829-2.829l-1.768-1.767a2 2 0 0 0 2.828-2.829l-2.828-2.828a2 2 0 0 0-2.829 2.828l-1.767-1.768a2 2 0 1 0-2.829 2.829z",
          },
        ],
        ["path", { d: "m2.5 21.5 1.4-1.4" }],
        ["path", { d: "m20.1 3.9 1.4-1.4" }],
        [
          "path",
          {
            d: "M5.343 21.485a2 2 0 1 0 2.829-2.828l1.767 1.768a2 2 0 1 0 2.829-2.829l-6.364-6.364a2 2 0 1 0-2.829 2.829l1.768 1.767a2 2 0 0 0-2.828 2.829z",
          },
        ],
        ["path", { d: "m9.6 14.4 4.8-4.8" }],
      ],
      other: [
        [
          "path",
          {
            d: "M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2",
          },
        ],
      ],
    });
    for (const category of ["bike", "run", "swim", "strength", "other"] as const) {
      const icon = ActivityCategoryPdfIcon({ category });
      expect(icon.props).toMatchObject({
        fill: "none",
        height: 16,
        stroke: "#0369a1",
        strokeLinecap: "round",
        strokeLinejoin: "round",
        strokeWidth: 2,
        viewBox: "0 0 24 24",
        width: 16,
      });
      expect(React.Children.toArray(icon.props.children)).toHaveLength(
        ACTIVITY_CATEGORY_PDF_LUCIDE_NODES[category].length,
      );
      for (const child of React.Children.toArray(icon.props.children)) {
        expect(React.isValidElement(child)).toBe(true);
        if (!React.isValidElement(child)) continue;
        expect(child.props).toMatchObject({
          fill: "none",
          stroke: "#0369a1",
          strokeLinecap: "round",
          strokeLinejoin: "round",
          strokeWidth: 2,
        });
      }
    }
  });

  it("offsets chapters and every visible reference for the complete reader book without forcing recto parity", () => {
    const layout = buildActivityPlanCatalogLayout(buildActivityPlanCatalogModels());
    const fragments = layout.planPages.flatMap((page) => page.entries);
    const trainingPages = (layout.trainingPlanSection?.plans ?? []).flatMap((plan) =>
      plan.weeks.map((week) => ({ plan, week })),
    );
    const plan = buildActivityPlanDistanceCatalogCompleteBookPlan(fragments, trainingPages);
    expect(plan.frontMatterPageCount).toBeGreaterThanOrEqual(3);
    // Reader pages are not duplex imposition faces: no parity blank is inserted.
    expect(plan.frontMatterPageCount).toBeGreaterThan(0);
    expect(plan.activityPlanPageNumbers.size).toBe(SYSTEM_TEMPLATES.length);
    expect(plan.activityPlanSlots).toHaveLength(SYSTEM_TEMPLATES.length);
    expect(plan.chapters.map((chapter) => chapter.title)).toEqual([
      "Tests",
      "Cycling",
      "Running",
      "Swimming",
      "Strength",
      "Cross-training & recovery",
    ]);
    expect(plan.trainingFirstPageNumbers.size).toBe(ALL_SAMPLE_PLANS.length);
    expect(plan.contentsPages.flat()).toHaveLength(
      SYSTEM_TEMPLATES.length + ALL_SAMPLE_PLANS.length + 4 + plan.chapters.length,
    );
    expect(plan.totalPageCount).toBe(
      plan.frontMatterPageCount +
        plan.chapters.length +
        plan.activityPlanSlots.reduce((total, slot) => total + slot.contentFragments.length, 0) +
        trainingPages.length +
        1,
    );
    const portraitPlan = buildActivityPlanDistanceCatalogCompleteBookPlan(
      fragments,
      trainingPages,
      "portrait",
    );
    expect(portraitPlan.contentsPages.flat()).toHaveLength(
      SYSTEM_TEMPLATES.length + ALL_SAMPLE_PLANS.length + 4 + portraitPlan.chapters.length,
    );
    expect(portraitPlan.contentsPages).toHaveLength(
      1 +
        Math.ceil(
          (SYSTEM_TEMPLATES.length +
            ALL_SAMPLE_PLANS.length +
            4 +
            portraitPlan.chapters.length -
            15) /
            19,
        ),
    );
    expect(portraitPlan.contentsPages.every((page) => page.length > 0 && page.length <= 20)).toBe(
      true,
    );
    expect(portraitPlan.totalPageCount).toBe(
      portraitPlan.frontMatterPageCount +
        portraitPlan.chapters.length +
        portraitPlan.activityPlanSlots.reduce(
          (total, slot) => total + slot.contentFragments.length,
          0,
        ) +
        trainingPages.length +
        1,
    );
    let nextActivityPlanPage = plan.frontMatterPageCount + 1;
    for (const chapter of plan.chapters) {
      expect(chapter.pageNumber).toBe(nextActivityPlanPage);
      nextActivityPlanPage += 1;
      for (const slot of chapter.slots) {
        const pageNumber = plan.activityPlanPageNumbers.get(slot.activityPlanId);
        expect(pageNumber).toBe(nextActivityPlanPage);
        expect(slot.contentFragments.length).toBeGreaterThanOrEqual(1);
        nextActivityPlanPage += slot.contentFragments.length;
      }
    }
    for (const [trainingPlanId, pageNumber] of plan.trainingFirstPageNumbers) {
      const rendered =
        trainingPages[
          pageNumber -
            plan.frontMatterPageCount -
            plan.chapters.length +
            plan.activityPlanSlots.reduce(
              (total, slot) => total + slot.contentFragments.length,
              0,
            ) -
            1
        ];
      expect(rendered?.plan.id).toBe(trainingPlanId);
      expect(rendered?.week.weekIndex).toBe(0);
    }
  });

  it("uses the A5 contents capacity while retaining every physical reference", () => {
    const entries = buildPublisherActivityPlanCatalogModels();
    const layout = buildActivityPlanCatalogLayout(entries, []);
    const fragments = layout.planPages.flatMap((page) => page.entries);
    const plan = buildActivityPlanDistanceCatalogCompleteBookPlan(fragments, [], "portrait");
    const contents = plan.contentsPages.flat();

    expect(entries).toHaveLength(66);
    expect(plan.contentsPages).toHaveLength(5);
    expect(plan.contentsPages.every((page) => page.length > 0 && page.length <= 19)).toBe(true);
    // Quick start, glossary, heart-rate chart, and watts chart precede chapters.
    expect(plan.guidePageCount).toBe(4);
    expect(plan.frontMatterPageCount).toBe(10);
    expect(plan.guideFirstPageNumber).toBe(7);
    expect(plan.totalPageCount).toBe(
      plan.frontMatterPageCount +
        plan.chapters.length +
        plan.activityPlanSlots.reduce((total, slot) => total + slot.contentFragments.length, 0) +
        1,
    );
    const activityPlanContents = contents.filter((entry) => entry.kind === "ActivityPlan");
    expect(activityPlanContents.map((entry) => entry.category)).toEqual(
      [...activityPlanContents.map((entry) => entry.category)].sort(
        (left, right) =>
          ["bike", "run", "swim", "strength", "other"].indexOf(left ?? "") -
          ["bike", "run", "swim", "strength", "other"].indexOf(right ?? ""),
      ),
    );
    expect(new Set(activityPlanContents.map((entry) => entry.category))).toEqual(
      new Set(["bike", "run", "swim", "strength", "other"]),
    );
    expect(contents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "Guide",
          pageNumber: plan.guideFirstPageNumber,
          title: "Quick start",
        }),
      ]),
    );
    expect(contents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "Guide",
          pageNumber: plan.guideFirstPageNumber + 1,
          title: "Glossary",
        }),
      ]),
    );
    expect(contents.some((entry) => entry.title === "How to use the assessments")).toBe(false);
    expect(contents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "Guide",
          pageNumber: plan.guideFirstPageNumber + 2,
          title: "HR conversion · 0–110%",
        }),
        expect.objectContaining({
          kind: "Guide",
          pageNumber: plan.guideFirstPageNumber + 3,
          title: "FTP conversion · 0–150%",
        }),
      ]),
    );
    let nextActivityPlanPage = plan.frontMatterPageCount + 1;
    for (const chapter of plan.chapters) {
      expect(contents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "Chapter",
            pageNumber: nextActivityPlanPage,
            title: chapter.title,
          }),
        ]),
      );
      nextActivityPlanPage += 1;
      for (const slot of chapter.slots) {
        const pageNumber = plan.activityPlanPageNumbers.get(slot.activityPlanId);
        const title = slot.contentFragments[0]?.model.title;
        expect(pageNumber).toBe(nextActivityPlanPage);
        nextActivityPlanPage += slot.contentFragments.length;
        expect(contents).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              kind: slot.activityPlanId.startsWith("b5a10000") ? "Assessment" : "ActivityPlan",
              pageNumber,
              title,
            }),
          ]),
        );
      }
    }
  });

  it("keeps every 10% conversion value on one compact table per reference", () => {
    expect(DISTANCE_CATALOG_CONVERSION_PERCENTAGES["heart-rate"]).toEqual([
      0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110,
    ]);
    expect(DISTANCE_CATALOG_CONVERSION_PERCENTAGES.ftp).toEqual([
      0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150,
    ]);
    expect(DISTANCE_CATALOG_CONVERSION_PANELS).toEqual({
      "heart-rate": [[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110]],
      ftp: [[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150]],
    });
    for (const [references, percentages] of [
      [
        Array.from({ length: 11 }, (_, index) => 120 + index * 10),
        DISTANCE_CATALOG_CONVERSION_PERCENTAGES["heart-rate"],
      ],
      [
        Array.from({ length: 17 }, (_, index) => 100 + index * 25),
        DISTANCE_CATALOG_CONVERSION_PERCENTAGES.ftp,
      ],
    ] as const)
      for (const reference of references)
        for (const percentage of percentages)
          expect(getDistanceCatalogConversionValue(reference, percentage)).toBe(
            Math.round((reference * percentage) / 100),
          );
  });

  it("starts each activityPlan on the next available page for naturally sized activityPlan fragments", () => {
    const fragment = buildActivityPlanCatalogLayout(
      buildActivityPlanCatalogModels(),
    ).planPages.flatMap((page) => page.entries)[0];
    if (!fragment) throw new Error("Expected a catalog fixture");

    const plan = buildActivityPlanDistanceCatalogCompleteBookPlan(
      [
        {
          ...fragment,
          entry: { ...fragment.entry, key: "two-page" },
          key: "two-page-1",
          partIndex: 0,
        },
        {
          ...fragment,
          entry: { ...fragment.entry, key: "two-page" },
          key: "two-page-2",
          partIndex: 1,
        },
        {
          ...fragment,
          entry: { ...fragment.entry, key: "one-page" },
          key: "one-page-1",
          partIndex: 0,
        },
      ],
      [],
      "portrait",
    );

    expect(plan.activityPlanSlots.map((slot) => slot.contentFragments.length)).toEqual([2, 1]);
    expect(plan.activityPlanSlots.map((slot) => slot.firstPageNumber)).toEqual([
      plan.frontMatterPageCount + 2,
      plan.frontMatterPageCount + 4,
    ]);
    expect(plan.totalPageCount).toBe(plan.frontMatterPageCount + 1 + 3 + 1);
  });

  it("keeps a synthetic third fragment consecutive without imposing a page cap", () => {
    const fragment = buildActivityPlanCatalogLayout(
      buildActivityPlanCatalogModels(),
    ).planPages.flatMap((page) => page.entries)[0];
    if (!fragment) throw new Error("Expected a catalog fixture");

    const plan = buildActivityPlanDistanceCatalogCompleteBookPlan(
      [
        { ...fragment, key: "synthetic-part-1", partCount: 3, partIndex: 0 },
        { ...fragment, key: "synthetic-part-2", partCount: 3, partIndex: 1 },
        { ...fragment, key: "synthetic-part-3", partCount: 3, partIndex: 2 },
      ],
      [],
      "portrait",
    );
    expect(plan.activityPlanSlots).toHaveLength(1);
    expect(plan.activityPlanSlots[0]?.contentFragments).toHaveLength(3);
    expect(plan.activityPlanSlots[0]?.firstPageNumber).toBe(plan.frontMatterPageCount + 2);
    expect(plan.totalPageCount).toBe(plan.frontMatterPageCount + 1 + 3 + 1);
  });

  it("uses exact timed widths and the matching profile color for each step", () => {
    const fragment = buildActivityPlanCatalogLayout(buildActivityPlanCatalogModels())
      .planPages.flatMap((page) => page.entries)
      .find((candidate) => candidate.model.title === "FTP Intervals");
    expect(fragment).toBeDefined();
    if (!fragment) return;
    const bars = getDistanceCatalogProfileBars(fragment);
    expect(bars.map((bar) => bar.width)).toEqual(
      getActivityPlanCatalogTimedProfileWidths(fragment.model.intensityProfile),
    );
    const threshold = fragment.model.sections[0]?.groups[1]?.steps[0];
    expect(threshold).toBeDefined();
    if (threshold) expect(getDistanceCatalogStepAccent(fragment, threshold.id)).toBe("#ef4444");
  });

  it("keeps the shared A5 14 pt step and prescription type and a graphics-only profile", async () => {
    const source = await import("node:fs/promises").then(({ readFile }) =>
      readFile(new URL("./activity-plan-distance-catalog-document.tsx", import.meta.url), "utf8"),
    );
    expect(source).toContain("export const DISTANCE_CATALOG_STEP_FONT_SIZE = 14");
    expect(source).toContain(
      "DISTANCE_CATALOG_A5_TRIM: [number, number] = [419.527559, 595.275591]",
    );
    expect(source).toContain("paddingTop: 43.2");
    expect(source).toContain("fontSize: 18");
    expect(source).toMatch(/pageNumber:\s*\{[\s\S]*?fontSize:\s*12/u);
    expect(source).toMatch(/name:\s*\{[\s\S]*?fontSize:\s*DISTANCE_CATALOG_STEP_FONT_SIZE/u);
    expect(source).toMatch(
      /nameAbovePrescription:\s*\{[\s\S]*?fontSize:\s*DISTANCE_CATALOG_STEP_FONT_SIZE/u,
    );
    expect(source).toMatch(/duration:\s*\{\s*color: "#0f172a"/u);
    expect(source.match(/fontSize: DISTANCE_CATALOG_STEP_FONT_SIZE/gu)).toHaveLength(4);
    expect(source).toContain("formatDistanceCatalogPrescription(step)");
    expect(source).toContain("DISTANCE_CATALOG_INLINE_GAP = 8");
    expect(source).toContain("hyphenationCallback={noHyphenation}");
    expect(source).toContain("unit: { fontWeight: 400 }");
    expect(source).toMatch(
      /durationBelowName:\s*\{[\s\S]*?fontSize:\s*DISTANCE_CATALOG_STEP_FONT_SIZE,[\s\S]*?textAlign:\s*"right"/u,
    );
    expect(source).toContain('preserveAspectRatio="none"');
    expect(source).toContain("<Rect");
    expect(source).not.toContain("ActivityPlan profile");
    expect(source).not.toContain("Step overview");
    expect(source).toContain("fontSize: 11, lineHeight: 1.25");
    expect(source).toContain("fontSize: 12");
    const exporter = await import("node:fs/promises").then(({ readFile }) =>
      readFile(
        new URL("../../../scripts/export-activity-plan-distance-catalog.tsx", import.meta.url),
        "utf8",
      ),
    );
    expect(exporter).toContain("const CATALOG_FONT_SIZE = DISTANCE_CATALOG_STEP_FONT_SIZE");
    expect(exporter).toContain("const catalogFontFeatures = { dlig: false, liga: false }");
    expect(exporter).toContain("font.layout(value, catalogFontFeatures)");
    expect(exporter).toContain("[21, 18, 17]");
  });

  it("wires the exporter-supplied white PNG onto both black complete-book covers", async () => {
    const source = await import("node:fs/promises").then(({ readFile }) =>
      readFile(new URL("./activity-plan-distance-catalog-document.tsx", import.meta.url), "utf8"),
    );

    expect(source).toContain("Image,");
    expect(
      source.match(/<Image src=\{coverLogoDataUri\} style=\{styles\.bookCoverLogo\} \/>/gu),
    ).toHaveLength(2);
    expect(source).not.toContain("GradientPeakPdfMark");
  });

  it("documents new-page activityPlan allocation without the retired recto or blank-back policy", async () => {
    const source = await import("node:fs/promises").then(({ readFile }) =>
      readFile(new URL("./activity-plan-distance-catalog-document.tsx", import.meta.url), "utf8"),
    );

    expect(source).toContain("follow its steps from top to bottom");
    expect(source).toContain("Continue →");
    expect(source).not.toContain("right-hand (recto) page");
    expect(source).not.toContain("blank reverse page");
  });

  it("removes publication information from reader pages while retaining full-page conversion tables", async () => {
    const source = await import("node:fs/promises").then(({ readFile }) =>
      readFile(new URL("./activity-plan-distance-catalog-document.tsx", import.meta.url), "utf8"),
    );
    expect(source).not.toContain("CompleteBookInsideFrontPage");
    expect(source).not.toContain("Publication information");
    expect(source).toContain("Heart-rate conversion");
    expect(source).toContain("FTP conversion");
    expect(source).toContain('title: "Quick start"');
    expect(source).toContain("Glossary");
    expect(source).toContain("Rating of perceived exertion");
    expect(source).toContain("HRmax / MaxHR");
    expect(source).toContain("CSS");
    expect(source).not.toContain("assessment-intro");
    expect(source).not.toContain("How to use the assessments");
    expect(source).toContain("not interchangeable");
    expect(source).toContain("DISTANCE_CATALOG_CONVERSION_PANELS");
    expect(source).toContain('{isHeartRate ? "HR" : "Watts"}');
    expect(source).not.toContain("Reference\\nHR (bpm)");
    expect(source).not.toContain("Reference\\nFTP (W)");
    expect(source).toContain("reference × percentage ÷ 100");
  });

  it("keeps the A5 upload package duplex, bled, and regression-checked against reader order", async () => {
    const source = await import("node:fs/promises").then(({ readFile }) =>
      readFile(
        new URL("../../../scripts/export-activity-plan-distance-catalog.tsx", import.meta.url),
        "utf8",
      ),
    );
    expect(source).toContain("BLEED=9");
    expect(source).toContain("TRIM_W, TRIM_H = 419.527559, 595.275591");
    expect(source).toContain("page.merge_translated_page(source_page, BLEED, BLEED");
    expect(source).toContain("blank inside front");
    expect(source).toContain("blank inside back");
    expect(source).toContain("upload-interior-duplex.pdf");
    expect(source).toContain("range(1, len(reader.pages)-1)");
    expect(source).toContain("interior_pages.append(blank())");
    expect(source).toContain("source_interior != upload_interior");
    expect(source).toContain("reader_hash");
    expect(source).toContain("final_blank_reverse_face");
    expect(source).toContain("upload_interior_faces");
  });

  it("moves only the proven V5 interval wrapper into a group heading", () => {
    expect(
      getDistanceCatalogCuePresentation({
        activityCategory: "bike",
        instructions:
          "Notes:\nStay smooth.\n\nBlock context:\nSegment: bike activity\n\nInterval:\n30/15 Block 2",
        name: "30-second Work",
      }),
    ).toEqual({ cue: "Stay smooth.", groupContext: "30/15 Block 2" });
    expect(
      getDistanceCatalogCuePresentation({
        activityCategory: "bike",
        instructions: "Interval:\nKeep this hand-authored note.",
        name: "Work",
      }),
    ).toEqual({
      cue: "Interval:\nKeep this hand-authored note.",
      groupContext: null,
    });
  });

  it("puts the full-activityPlan profile once below first-page context and before ordered steps", () => {
    const entry = buildActivityPlanCatalogModels()[0];
    expect(entry).toBeDefined();
    if (!entry) return;
    const groups = entry.model.sections.flatMap((section) => section.groups);
    const firstPage = ActivityPlanDistanceCatalogActivityPlanPage({
      fragment: {
        continuedGroupIds: [],
        continuesAfterGroupIds: [],
        entry,
        key: "profile-first-page",
        model: entry.model,
        partCount: 2,
        partIndex: 0,
        showContext: true,
      },
      pageNumber: 1,
    });
    const continuationPage = ActivityPlanDistanceCatalogActivityPlanPage({
      fragment: {
        continuedGroupIds: [],
        continuesAfterGroupIds: [],
        entry,
        key: "profile-continuation-page",
        model: entry.model,
        partCount: 3,
        partIndex: 1,
        showContext: false,
      },
      pageNumber: 2,
    });
    const children = (page: typeof firstPage) => React.Children.toArray(page.props.children);
    const isProfile = (child: React.ReactNode) =>
      React.isValidElement(child) &&
      typeof child.type === "function" &&
      child.type.name === "ActivityPlanProfile";
    const isContinue = (child: React.ReactNode) =>
      React.isValidElement(child) &&
      typeof child.type === "function" &&
      child.type.name === "ContinueIndicator";
    const isPageNumber = (child: React.ReactNode) =>
      React.isValidElement(child) &&
      typeof child.type === "function" &&
      child.type.name === "CatalogPageNumber";
    const profileIndex = children(firstPage).findIndex(isProfile);
    const firstStepIndex = children(firstPage).findIndex(
      (child) =>
        React.isValidElement(child) &&
        String(child.key).endsWith(entry.model.sections[0]?.groups[0]?.id ?? ""),
    );
    expect(profileIndex).toBeGreaterThan(0);
    expect(profileIndex).toBeLessThan(firstStepIndex);
    expect(
      children(firstPage)
        .map((child) =>
          React.isValidElement(child)
            ? groups.find((group) => String(child.key).endsWith(group.id))?.id
            : undefined,
        )
        .filter((id): id is string => Boolean(id)),
    ).toEqual(groups.map((group) => group.id));
    expect(children(continuationPage).some(isProfile)).toBe(false);
    expect(children(firstPage).some(isContinue)).toBe(true);
    // Every non-final natural fragment, not just the first, directs the reader onward.
    expect(children(continuationPage).some(isContinue)).toBe(true);
    expect(children(firstPage).some(isPageNumber)).toBe(true);
    expect(children(continuationPage).some(isPageNumber)).toBe(true);
  });

  it("renders assessments with the ordinary activityPlan layout and keeps result instructions in descriptions", () => {
    const entries = buildActivityPlanCatalogModels();
    const assessment = entries.find(
      (entry) => entry.key === "b5a10000-0001-4000-8001-000000000001",
    );
    const ordinary = entries.find((entry) => entry.key !== "b5a10000-0001-4000-8001-000000000001");
    expect(assessment).toBeDefined();
    expect(ordinary).toBeDefined();
    if (!assessment || !ordinary) return;

    const fragment = (entry: typeof assessment) => ({
      continuedGroupIds: [],
      continuesAfterGroupIds: [],
      entry,
      key: `${entry.key}-first-page`,
      model: entry.model,
      partCount: 1,
      partIndex: 0,
      showContext: true,
    });
    const assessmentPage = ActivityPlanDistanceCatalogActivityPlanPage({
      fragment: fragment(assessment),
      pageNumber: 1,
    });
    const ordinaryPage = ActivityPlanDistanceCatalogActivityPlanPage({
      fragment: fragment(ordinary),
      pageNumber: 2,
    });
    const childTypes = (page: typeof assessmentPage) =>
      React.Children.toArray(page.props.children).map((child) =>
        React.isValidElement(child) ? child.type : child,
      );

    // Context, profile, authored groups, and page number are the same ordinary
    // activityPlan composition; only the authored group count may differ.
    expect(childTypes(assessmentPage).slice(0, 2)).toEqual(childTypes(ordinaryPage).slice(0, 2));
    expect(childTypes(assessmentPage).at(-1)).toBe(childTypes(ordinaryPage).at(-1));
    expect(assessment.model.description).toContain("average power for 30 min");
    expect(JSON.stringify(assessmentPage)).not.toContain("After the test");
  });
});
