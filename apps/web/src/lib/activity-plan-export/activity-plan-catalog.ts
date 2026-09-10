import {
  type ActivityPlanDifficulty,
  type ActivityPlanPortfolioMetadata,
  EXPANDED_ENDURANCE_BIKE_METADATA,
  EXPANDED_ENDURANCE_OTHER_METADATA,
  EXPANDED_ENDURANCE_RUN_METADATA,
  EXPANDED_ENDURANCE_STRENGTH_METADATA,
  EXPANDED_ENDURANCE_SWIM_METADATA,
  ICONIC_ENDURANCE_METADATA,
  SYSTEM_TEMPLATES,
  type SystemTemplate,
} from "@repo/core";
import { type ActivityPlanPrintModel, buildActivityPlanPrintModel } from "@repo/core/activity-plan";

export type ActivityPlanCatalogEntry = {
  key: string;
  model: ActivityPlanPrintModel;
};

export type ActivityPlanCatalogSection = {
  entries: readonly ActivityPlanCatalogEntry[];
  key: string;
  title: string;
};

export type ActivityPlanCatalogPage = {
  entries:
    | readonly [ActivityPlanCatalogEntry]
    | readonly [ActivityPlanCatalogEntry, ActivityPlanCatalogEntry];
  pageNumber: number;
  sectionKey: string;
  sectionTitle: string;
};

export type ActivityPlanCatalogLayout = {
  contentsPages: readonly ActivityPlanCatalogContentsPage[];
  discoveryPages: readonly ActivityPlanCatalogDiscoveryPage[];
  planPages: readonly ActivityPlanCatalogPage[];
  pathways: readonly ActivityPlanCatalogPathwayPage[];
  sections: readonly ActivityPlanCatalogSection[];
};

export type ActivityPlanCatalogContentsPage = {
  columns: readonly [ActivityPlanCatalogSection, ActivityPlanCatalogSection?];
  key: string;
};

export type ActivityPlanCatalogDiscoveryEntry = {
  entry: ActivityPlanCatalogEntry;
  metadata: ActivityPlanPortfolioMetadata;
};

export type ActivityPlanCatalogDiscoveryPage = {
  entries: readonly ActivityPlanCatalogDiscoveryEntry[];
  key: string;
};

export type ActivityPlanCatalogPathwayFamily = {
  entries: readonly ActivityPlanCatalogDiscoveryEntry[];
  family: string;
  label: string;
};

export type ActivityPlanCatalogPathwayPage = {
  families: readonly [ActivityPlanCatalogPathwayFamily, ActivityPlanCatalogPathwayFamily];
  key: string;
  title: string;
};

/** Cover, publication information, finder, and the two reference pages. */
export const ACTIVITY_PLAN_CATALOG_BASE_FRONT_MATTER_PAGES = 5;
export const ACTIVITY_PLAN_CATALOG_WORKSHEET_PAGE_COUNT = 4;
export const ACTIVITY_PLAN_CATALOG_INTERIOR_MARGINS = {
  binding: 48,
  outside: 30,
} as const;
export const ACTIVITY_PLAN_CATALOG_PAGE_SIZE = {
  height: 810,
  width: 630,
} as const;
export const ACTIVITY_PLAN_CATALOG_PRINT_GEOMETRY = {
  bleedPoints: 9,
  pageHeight: ACTIVITY_PLAN_CATALOG_PAGE_SIZE.height,
  pageWidth: ACTIVITY_PLAN_CATALOG_PAGE_SIZE.width,
  trimHeight: 792,
  trimWidth: 612,
} as const;
const ACTIVITY_PLAN_CATALOG_CONTENTS_COLUMN_ROWS = 48;
const ACTIVITY_PLAN_CATALOG_DISCOVERY_PAGE_ROWS = 42;
export const ACTIVITY_PLAN_CATALOG_TWO_UP_GEOMETRY = {
  firstContentBottom: 403,
  secondContentBottom: 768,
  secondContentTop: 437,
  slotGap: 10,
  slotHeight: 355,
  slotPadding: 12,
} as const;

const MULTISPORT_TEMPLATE_IDS = new Set([
  "73d53dd1-f8b8-4d7f-9ba7-dfa4de116201",
  "73d53dd1-f8b8-4d7f-9ba7-dfa4de116202",
  "73d53dd1-f8b8-4d7f-9ba7-dfa4de116203",
  "73d53dd1-f8b8-4d7f-9ba7-dfa4de116204",
  "73d53dd1-f8b8-4d7f-9ba7-dfa4de116205",
  "73d53dd1-f8b8-4d7f-9ba7-dfa4de116206",
]);

const CATALOG_SECTIONS = [
  { key: "bike", title: "Cycling" },
  { key: "run", title: "Running" },
  { key: "swim", title: "Swimming" },
  { key: "strength", title: "Strength" },
  { key: "other", title: "Cross-training & recovery" },
  { key: "multisport", title: "Multisport programmes" },
] as const;

const DIFFICULTY_ORDER: readonly ActivityPlanDifficulty[] = [
  "foundation",
  "development",
  "advanced",
  "race-specific",
];

const PATHWAY_DEFINITIONS = [
  {
    families: [
      ["bike:aerobic-durability", "Bike aerobic durability"],
      ["bike:threshold-power", "Bike threshold power"],
    ],
    key: "bike-pathways",
    title: "Guided pathways · Cycling",
  },
  {
    families: [
      ["run:aerobic-long-run", "Run aerobic long run"],
      ["run:stride-speed", "Run stride speed"],
    ],
    key: "run-pathways",
    title: "Guided pathways · Running",
  },
  {
    families: [
      ["swim:aerobic-continuity", "Swim aerobic continuity"],
      ["swim:css-threshold", "Swim CSS threshold"],
    ],
    key: "swim-pathways",
    title: "Guided pathways · Swimming",
  },
  {
    families: [
      ["strength:movement-capacity", "Strength movement capacity"],
      ["other:mobility-reset", "Mobility reset"],
    ],
    key: "capacity-pathways",
    title: "Guided pathways · Capacity & reset",
  },
] as const;

export const ACTIVITY_PLAN_PORTFOLIO_METADATA: readonly ActivityPlanPortfolioMetadata[] = [
  ...EXPANDED_ENDURANCE_BIKE_METADATA,
  ...EXPANDED_ENDURANCE_RUN_METADATA,
  ...EXPANDED_ENDURANCE_SWIM_METADATA,
  ...EXPANDED_ENDURANCE_STRENGTH_METADATA,
  ...EXPANDED_ENDURANCE_OTHER_METADATA,
  ...ICONIC_ENDURANCE_METADATA,
];

function wrappedLines(value: string | null, charactersPerLine: number): number {
  if (!value) return 0;
  return value
    .split("\n")
    .reduce((total, line) => total + Math.max(1, Math.ceil(line.length / charactersPerLine)), 0);
}

/**
 * Conservative height budget for the fixed half-page catalog card. The exporter also preflights
 * the rendered PDF boundaries, so a continuation or slot crossing aborts before overwrite.
 */
export function estimateActivityPlanTwoUpHeight(model: ActivityPlanPrintModel): number {
  let height = 49;
  height += wrappedLines(model.title, 34) * 16;
  height += wrappedLines(model.description, 82) * 11;
  height += model.intensityProfile.length > 0 ? 70 : 0;

  for (const section of model.sections) {
    const sectionHeading = [section.name, section.notes].filter(Boolean).join(" — ");
    height += sectionHeading ? wrappedLines(sectionHeading, 78) * 12 : 4;
    for (const group of section.groups) {
      const groupHeading = [
        group.repetitions > 1 ? `${group.repetitions}×` : null,
        group.name,
        group.notes,
      ]
        .filter(Boolean)
        .join(" — ");
      height += groupHeading ? wrappedLines(groupHeading, 78) * 10 : 2;
      for (const step of group.steps) {
        const redundantStepName =
          step.name &&
          group.name &&
          step.name.trim().toLowerCase() === group.name.trim().toLowerCase();
        const instruction = [
          redundantStepName ? null : step.name,
          step.instruction,
          step.description,
          step.notes,
        ]
          .filter(Boolean)
          .join(" — ");
        height += wrappedLines(instruction, 74) * 11 + 3;
      }
    }
    height += 6;
  }

  height += wrappedLines(model.notes, 91) * 9;
  return height;
}

export function isActivityPlanTwoUpEligible(model: ActivityPlanPrintModel): boolean {
  return estimateActivityPlanTwoUpHeight(model) <= 300;
}

export function buildActivityPlanCatalogModels(
  templates: readonly SystemTemplate[] = SYSTEM_TEMPLATES,
): ActivityPlanCatalogEntry[] {
  return templates.map((template) => {
    const model = buildActivityPlanPrintModel({
      description: template.description,
      format: "full-page",
      notes: template.notes,
      personalizeTargets: false,
      structure: template.structure,
      title: template.name,
    });
    if (!model) throw new Error(`Unable to render system activity plan: ${template.name}`);
    return { key: template.id, model };
  });
}

function getCatalogSectionKey(entry: ActivityPlanCatalogEntry): string {
  return MULTISPORT_TEMPLATE_IDS.has(entry.key) ? "multisport" : entry.model.activityCategory;
}

export function buildActivityPlanCatalogLayout(
  entries: readonly ActivityPlanCatalogEntry[],
  metadata: readonly ActivityPlanPortfolioMetadata[] = ACTIVITY_PLAN_PORTFOLIO_METADATA,
): ActivityPlanCatalogLayout {
  const sections = CATALOG_SECTIONS.map(({ key, title }) => ({
    entries: entries.filter((entry) => getCatalogSectionKey(entry) === key),
    key,
    title,
  })).filter((section) => section.entries.length > 0);

  const entryById = new Map(entries.map((entry) => [entry.key, entry]));
  const metadataById = new Map(metadata.map((item) => [item.templateId, item]));
  const discoveryEntries = metadata
    .map((item) => {
      const entry = entryById.get(item.templateId);
      return entry ? { entry, metadata: item } : null;
    })
    .filter((item): item is ActivityPlanCatalogDiscoveryEntry => item !== null)
    .sort((left, right) => left.entry.model.title.localeCompare(right.entry.model.title));
  const discoveryPages: ActivityPlanCatalogDiscoveryPage[] = [];
  for (
    let index = 0;
    index < discoveryEntries.length;
    index += ACTIVITY_PLAN_CATALOG_DISCOVERY_PAGE_ROWS
  ) {
    discoveryPages.push({
      entries: discoveryEntries.slice(index, index + ACTIVITY_PLAN_CATALOG_DISCOVERY_PAGE_ROWS),
      key: `discovery-${discoveryPages.length + 1}`,
    });
  }

  const contentsColumns: ActivityPlanCatalogSection[] = [];
  for (const section of sections) {
    let entries: ActivityPlanCatalogEntry[] = [];
    let usedRows = 2;
    let continuation = 0;
    for (const entry of section.entries) {
      const entryRows = Math.max(1, Math.ceil(entry.model.title.length / 42));
      if (entries.length > 0 && usedRows + entryRows > ACTIVITY_PLAN_CATALOG_CONTENTS_COLUMN_ROWS) {
        contentsColumns.push({
          entries,
          key: `${section.key}-${continuation}`,
          title: continuation === 0 ? section.title : `${section.title} continued`,
        });
        continuation += 1;
        entries = [];
        usedRows = 2;
      }
      entries.push(entry);
      usedRows += entryRows;
    }
    if (entries.length > 0) {
      contentsColumns.push({
        entries,
        key: `${section.key}-${continuation}`,
        title: continuation === 0 ? section.title : `${section.title} continued`,
      });
    }
  }
  const contentsPages: ActivityPlanCatalogContentsPage[] = [];
  for (let index = 0; index < contentsColumns.length; index += 2) {
    const first = contentsColumns[index];
    if (!first) break;
    const second = contentsColumns[index + 1];
    contentsPages.push({
      columns: second ? [first, second] : [first],
      key: `contents-${contentsPages.length + 1}`,
    });
  }

  const pathwayFamily = (family: string, label: string): ActivityPlanCatalogPathwayFamily => {
    const familyEntries = DIFFICULTY_ORDER.map((difficulty) => {
      const item = metadata.find(
        (candidate) => candidate.family === family && candidate.difficulty === difficulty,
      );
      const entry = item ? entryById.get(item.templateId) : undefined;
      return item && entry ? { entry, metadata: item } : null;
    }).filter((item): item is ActivityPlanCatalogDiscoveryEntry => item !== null);
    if (familyEntries.length !== DIFFICULTY_ORDER.length) {
      throw new Error(`Catalog pathway ${family} does not have four authoritative levels`);
    }
    return { entries: familyEntries, family, label };
  };
  const pathways: ActivityPlanCatalogPathwayPage[] =
    metadata.length === 0
      ? []
      : PATHWAY_DEFINITIONS.map(({ families, key, title }) => {
          const [firstFamily, secondFamily] = families;
          if (!firstFamily || !secondFamily)
            throw new Error(`Catalog pathway page ${key} is incomplete`);
          return {
            families: [
              pathwayFamily(firstFamily[0], firstFamily[1]),
              pathwayFamily(secondFamily[0], secondFamily[1]),
            ],
            key,
            title,
          };
        });

  const planPages: ActivityPlanCatalogPage[] = [];
  let pageNumber =
    ACTIVITY_PLAN_CATALOG_BASE_FRONT_MATTER_PAGES +
    discoveryPages.length +
    pathways.length +
    contentsPages.length +
    1;
  for (const section of sections) {
    const remaining = [...section.entries];
    while (remaining.length > 0) {
      const first = remaining.shift();
      if (!first) break;
      const nextEligibleIndex = isActivityPlanTwoUpEligible(first.model)
        ? remaining.findIndex((entry) => isActivityPlanTwoUpEligible(entry.model))
        : -1;
      const second = nextEligibleIndex >= 0 ? remaining.splice(nextEligibleIndex, 1)[0] : undefined;
      const pair = second ? ([first, second] as const) : ([first] as const);
      planPages.push({
        entries: pair,
        pageNumber,
        sectionKey: section.key,
        sectionTitle: section.title,
      });
      pageNumber += 1;
    }
  }

  // Metadata is optional for catalog inclusion, but authoritative metadata must resolve uniquely.
  if (metadataById.size !== metadata.length)
    throw new Error("Catalog metadata contains duplicate template IDs");
  return { contentsPages, discoveryPages, planPages, pathways, sections };
}

export function assertActivityPlanCatalogLayout(
  layout: ActivityPlanCatalogLayout,
  expectedEntries: readonly ActivityPlanCatalogEntry[],
): void {
  const placed = layout.planPages.flatMap((page) => page.entries);
  if (placed.length !== expectedEntries.length) {
    throw new Error(`Catalog placed ${placed.length} of ${expectedEntries.length} activity plans`);
  }
  if (new Set(placed.map((entry) => entry.key)).size !== placed.length) {
    throw new Error("Catalog contains a duplicate activity plan");
  }
  if (placed.some((entry) => !expectedEntries.some((expected) => expected.key === entry.key))) {
    throw new Error("Catalog contains an unexpected activity plan");
  }
  for (const page of layout.planPages) {
    if (page.entries.length < 1 || page.entries.length > 2) {
      throw new Error(`Catalog page ${page.pageNumber} has an invalid activity count`);
    }
    if (
      page.entries.length === 2 &&
      page.entries.some((entry) => !isActivityPlanTwoUpEligible(entry.model))
    ) {
      throw new Error(`Catalog page ${page.pageNumber} contains an unsafe two-up activity`);
    }
  }
}

export function getActivityPlanCatalogContentPageCount(layout: ActivityPlanCatalogLayout): number {
  return (
    ACTIVITY_PLAN_CATALOG_BASE_FRONT_MATTER_PAGES +
    layout.discoveryPages.length +
    layout.pathways.length +
    layout.contentsPages.length +
    layout.planPages.length +
    ACTIVITY_PLAN_CATALOG_WORKSHEET_PAGE_COUNT
  );
}

export function activityPlanCatalogNeedsBlankBeforeBackCover(
  layout: ActivityPlanCatalogLayout,
): boolean {
  return getActivityPlanCatalogContentPageCount(layout) % 2 === 0;
}

/** The first worksheet always follows every rendered front-matter and plan page. */
export function getActivityPlanCatalogWorksheetStartPage(
  layout: ActivityPlanCatalogLayout,
): number {
  return (
    ACTIVITY_PLAN_CATALOG_BASE_FRONT_MATTER_PAGES +
    layout.discoveryPages.length +
    layout.pathways.length +
    layout.contentsPages.length +
    layout.planPages.length +
    1
  );
}

/** Returns physical-page margins, putting the wider margin at the duplex binding edge. */
export function getActivityPlanCatalogInteriorMargins(pageNumber: number): {
  left: number;
  right: number;
} {
  return pageNumber % 2 === 1
    ? {
        left: ACTIVITY_PLAN_CATALOG_INTERIOR_MARGINS.binding,
        right: ACTIVITY_PLAN_CATALOG_INTERIOR_MARGINS.outside,
      }
    : {
        left: ACTIVITY_PLAN_CATALOG_INTERIOR_MARGINS.outside,
        right: ACTIVITY_PLAN_CATALOG_INTERIOR_MARGINS.binding,
      };
}
