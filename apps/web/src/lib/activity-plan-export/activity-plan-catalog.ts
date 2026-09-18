import {
  ALL_SAMPLE_PLANS,
  deriveTrainingPlanScheduleVisual,
  SYSTEM_TEMPLATES,
  type SystemTemplate,
  type SystemTrainingPlanTemplate,
  type TrainingPlanScheduleVisualModel,
} from "@repo/core";
import { type ActivityPlanPrintModel, buildActivityPlanPrintModel } from "@repo/core/activity-plan";

export type ActivityPlanCatalogEntry = {
  adaptation: ActivityPlanCatalogAdaptation | null;
  key: string;
  model: ActivityPlanPrintModel;
};

export type ActivityPlanCatalogAdaptation = {
  allowedStates: readonly string[] | null;
  controls: readonly string[];
};

type ActivityPlanCatalogAdaptationControl = NonNullable<
  SystemTemplate["adaptation"]
>["controls"][number];

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
  finderSections: readonly ActivityPlanCatalogFinderSection[];
  planPages: readonly ActivityPlanCatalogPage[];
  sections: readonly ActivityPlanCatalogSection[];
  trainingPlanSection: ActivityPlanCatalogTrainingPlanSection | null;
};

export type ActivityPlanCatalogContentsPage = {
  columns: readonly [ActivityPlanCatalogSection, ActivityPlanCatalogSection?];
  key: string;
};

export type ActivityPlanCatalogFinderSection = {
  entryCount: number;
  endPageNumber: number;
  firstEntryKey: string;
  key: string;
  startPageNumber: number;
  title: string;
};

export type ActivityPlanCatalogTrainingSession = {
  activityPageNumber: number;
  activityPlanId: string;
  activityTitle: string;
  dayIndex: number;
  key: string;
  targetCommonLoad: number | null;
  targetDurationMinutes: number | null;
  title: string;
  trainingIntent: string;
  importance: "key" | "normal" | "support";
  weekIndex: number;
};

export type ActivityPlanCatalogTrainingWeek = {
  sessions: readonly ActivityPlanCatalogTrainingSession[];
  weekIndex: number;
};

export type ActivityPlanCatalogTrainingPlan = {
  activityCategories: readonly string[];
  description: string;
  experienceLevels: readonly string[];
  id: string;
  name: string;
  overviewPageNumber: number;
  schedulePageNumber: number;
  scheduleVisual: TrainingPlanScheduleVisualModel;
  sessionsPerWeekTarget: number;
  weeks: readonly ActivityPlanCatalogTrainingWeek[];
};

export type ActivityPlanCatalogTrainingPlanSection = {
  alignmentBlankPageNumber?: number;
  openerPageNumber: number;
  plans: readonly ActivityPlanCatalogTrainingPlan[];
};

/** Cover, publication information, finder, and the two reference pages. */
export const ACTIVITY_PLAN_CATALOG_BASE_FRONT_MATTER_PAGES = 5;
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
  let height = 23;
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

function isActivityPlanCatalogEntryTwoUpEligible(entry: ActivityPlanCatalogEntry): boolean {
  return entry.adaptation === null && isActivityPlanTwoUpEligible(entry.model);
}

function formatAuthoredDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  return [hours ? `${hours}h` : null, minutes ? `${minutes}m` : null].filter(Boolean).join(" ");
}

function buildActivityPlanCatalogAdaptation(
  template: SystemTemplate,
): ActivityPlanCatalogAdaptation | null {
  const adaptation = template.adaptation;
  if (!adaptation) return null;
  const formatValue = (control: ActivityPlanCatalogAdaptationControl, value: number): string => {
    if (control.kind === "interval_repetitions") return `${value} reps`;
    if (control.kind === "target_intensity") {
      const target = control.targets.find((candidate) => candidate.type === "target_intensity");
      return target ? `${value} ${target.targetType}` : String(value);
    }
    const target = control.targets.find(
      (candidate) => candidate.type === "step_quantity" || candidate.type === "recovery_step",
    );
    const quantityType = target?.quantityType ?? "time";
    if (quantityType === "time") return formatAuthoredDuration(value);
    if (quantityType === "distance") return value >= 1_000 ? `${value / 1_000} km` : `${value} m`;
    return `${value} reps`;
  };
  const controls = adaptation.controls.map(
    (control) =>
      `${control.label}: default ${formatValue(control, control.range.default)}; range ${formatValue(control, control.range.minimum)}-${formatValue(control, control.range.maximum)}`,
  );
  const allowedStates = adaptation.allowedStates?.map((state) => {
    const values = adaptation.controls
      .map((control) => {
        const value = state.values[control.key];
        return value === undefined ? null : `${control.label} ${formatValue(control, value)}`;
      })
      .filter((value): value is string => value !== null);
    return `${state.label}: ${values.join(", ")}`;
  });
  return { allowedStates: allowedStates ?? null, controls };
}

export function buildActivityPlanCatalogModels(
  templates: readonly SystemTemplate[] = SYSTEM_TEMPLATES,
): ActivityPlanCatalogEntry[] {
  return templates.map((template) => {
    const model = buildActivityPlanPrintModel({
      format: "full-page",
      ...(template.description === undefined ? {} : { description: template.description }),
      ...(template.notes === undefined ? {} : { notes: template.notes }),
      personalizeTargets: false,
      structure: template.structure,
      title: template.name,
    });
    if (!model) throw new Error(`Unable to render system activity plan: ${template.name}`);
    return { adaptation: buildActivityPlanCatalogAdaptation(template), key: template.id, model };
  });
}

function getCatalogSectionKey(entry: ActivityPlanCatalogEntry): string {
  return MULTISPORT_TEMPLATE_IDS.has(entry.key) ? "multisport" : entry.model.activityCategory;
}

export function buildActivityPlanCatalogLayout(
  entries: readonly ActivityPlanCatalogEntry[],
  trainingPlans: readonly SystemTrainingPlanTemplate[] = ALL_SAMPLE_PLANS,
): ActivityPlanCatalogLayout {
  const sections = CATALOG_SECTIONS.map(({ key, title }) => ({
    entries: entries.filter((entry) => getCatalogSectionKey(entry) === key),
    key,
    title,
  })).filter((section) => section.entries.length > 0);

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

  const planPages: ActivityPlanCatalogPage[] = [];
  let pageNumber = ACTIVITY_PLAN_CATALOG_BASE_FRONT_MATTER_PAGES + contentsPages.length + 1;
  for (const section of sections) {
    const remaining = [...section.entries];
    while (remaining.length > 0) {
      const first = remaining.shift();
      if (!first) break;
      const nextEligibleIndex = isActivityPlanCatalogEntryTwoUpEligible(first)
        ? remaining.findIndex(isActivityPlanCatalogEntryTwoUpEligible)
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

  const activityPageNumbers = new Map(
    planPages.flatMap((page) => page.entries.map((entry) => [entry.key, page.pageNumber])),
  );
  const activityTitles = new Map(entries.map((entry) => [entry.key, entry.model.title]));
  const finderSections = sections.map((section) => {
    const pageNumbers = planPages
      .filter((page) => page.sectionKey === section.key)
      .map((page) => page.pageNumber);
    const firstEntry = section.entries[0];
    const startPageNumber = pageNumbers[0];
    const endPageNumber = pageNumbers.at(-1);
    if (!firstEntry || !startPageNumber || !endPageNumber) {
      throw new Error(`Catalog section ${section.title} has no rendered activity page`);
    }
    return {
      entryCount: section.entries.length,
      endPageNumber,
      firstEntryKey: firstEntry.key,
      key: section.key,
      startPageNumber,
      title: section.title,
    };
  });
  const nextPageNumber = pageNumber;
  const alignmentBlankPageNumber =
    trainingPlans.length > 0 && nextPageNumber % 2 === 0 ? nextPageNumber : undefined;
  const openerPageNumber = nextPageNumber + (alignmentBlankPageNumber ? 1 : 0);
  const trainingPlanSection =
    trainingPlans.length === 0
      ? null
      : {
          ...(alignmentBlankPageNumber ? { alignmentBlankPageNumber } : {}),
          openerPageNumber,
          plans: trainingPlans.map((plan, index) => {
            const scheduleVisual = deriveTrainingPlanScheduleVisual({ structure: plan.structure });
            if (!scheduleVisual) {
              throw new Error(`Unable to visualize system training plan: ${plan.name}`);
            }
            const weeks: ActivityPlanCatalogTrainingWeek[] = Array.from(
              { length: scheduleVisual.totalWeeks },
              (_, weekIndex) => ({
                weekIndex,
                sessions: plan.structure.sessions
                  .filter(
                    (session) =>
                      Math.floor(session.offset_days / 7) === weekIndex &&
                      session.activity_plan_id !== null,
                  )
                  .map((session, sessionIndex) => {
                    const activityPlanId = session.activity_plan_id;
                    if (activityPlanId === null) {
                      throw new Error(
                        `Training plan ${plan.name} has an automatic session that cannot be exported as a fixed activity.`,
                      );
                    }
                    const activityPageNumber = activityPageNumbers.get(activityPlanId);
                    const activityTitle = activityTitles.get(activityPlanId);
                    if (!activityPageNumber || !activityTitle) {
                      throw new Error(
                        `Training plan ${plan.name} references an activity missing from the catalog: ${activityPlanId}`,
                      );
                    }
                    return {
                      activityPageNumber,
                      activityPlanId,
                      activityTitle,
                      dayIndex: session.offset_days % 7,
                      key: `${session.offset_days}-${activityPlanId}-${sessionIndex}`,
                      targetCommonLoad: session.demand.target_common_load,
                      targetDurationMinutes: session.demand.target_duration_minutes,
                      title: session.event_overrides?.title ?? activityTitle,
                      trainingIntent: session.demand.training_intent,
                      importance: session.demand.importance,
                      weekIndex,
                    };
                  }),
              }),
            );
            return {
              activityCategories: plan.structure.activity_category ?? [],
              description: plan.description,
              experienceLevels: plan.structure.experienceLevel ?? [],
              id: plan.id,
              name: plan.name,
              overviewPageNumber: openerPageNumber + 1 + index * 2,
              schedulePageNumber: openerPageNumber + 2 + index * 2,
              scheduleVisual,
              sessionsPerWeekTarget: plan.sessions_per_week_target,
              weeks,
            };
          }),
        };

  return { contentsPages, finderSections, planPages, sections, trainingPlanSection };
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
      page.entries.some((entry) => !isActivityPlanCatalogEntryTwoUpEligible(entry))
    ) {
      throw new Error(`Catalog page ${page.pageNumber} contains an unsafe two-up activity`);
    }
  }
}

export function getActivityPlanCatalogContentPageCount(layout: ActivityPlanCatalogLayout): number {
  const finalTrainingPlanPage = layout.trainingPlanSection?.plans.at(-1)?.schedulePageNumber;
  if (finalTrainingPlanPage) return finalTrainingPlanPage;
  return (
    layout.planPages.at(-1)?.pageNumber ??
    ACTIVITY_PLAN_CATALOG_BASE_FRONT_MATTER_PAGES + layout.contentsPages.length
  );
}

export function activityPlanCatalogNeedsBlankBeforeBackCover(
  layout: ActivityPlanCatalogLayout,
): boolean {
  return getActivityPlanCatalogContentPageCount(layout) % 2 === 0;
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
