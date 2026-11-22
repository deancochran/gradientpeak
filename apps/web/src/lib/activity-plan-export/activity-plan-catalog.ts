import {
  ALL_SAMPLE_PLANS,
  deriveTrainingPlanScheduleVisual,
  SYSTEM_TEMPLATES,
  type SystemTemplate,
  type SystemTrainingPlanTemplate,
  type TrainingPlanScheduleVisualModel,
} from "@repo/core";

/** Publisher-only exclusions for active templates omitted from the catalogue. */
export const PUBLISHER_EXCLUDED_TEMPLATE_IDS = new Set([
  "6a9b0c1d-2e3f-4a5b-ac7d-8e9f0a1b2c3d", // CrossFit WOD
  "1f6ea8cb-5df9-42cb-9f04-3ca5a8a6d6d1", // Other Race Simulation
]);

import {
  type ActivityPlanPrintGroup,
  type ActivityPlanPrintModel,
  buildActivityPlanPrintModel,
} from "@repo/core/activity-plan";

type CatalogInstructionStep = {
  activityCategory: string;
  instructions: string | null;
  name: string | null;
};

function normalizedCatalogLabel(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/gu, " ");
}

/** Removes only observed V5 migration wrappers from athlete-facing catalog cues. */
export function formatActivityPlanCatalogInstruction(step: CatalogInstructionStep): string | null {
  const source = step.instructions?.trim();
  if (!source) return null;
  const paragraphs = source.split("\n\n");
  const result: string[] = [];
  for (let index = 0; index < paragraphs.length; index += 1) {
    const paragraph = paragraphs[index];
    if (paragraph === undefined) continue;
    if (index === 0 && paragraph.startsWith("Notes:\n")) {
      const cue = paragraph.slice("Notes:\n".length).trim();
      if (cue) result.push(cue);
      continue;
    }
    if (paragraph === `Block context:\nSegment: ${step.activityCategory} activity`) continue;
    if (paragraph.startsWith("Interval:\n")) {
      const interval = paragraph.slice("Interval:\n".length).trim();
      // Generated ordinal names carry no coaching information.
      if (/^Interval \d+$/u.test(interval)) continue;
      if (step.name && normalizedCatalogLabel(interval) === normalizedCatalogLabel(step.name))
        continue;
    }
    result.push(paragraph);
  }
  const formatted = result.join("\n\n").trim();
  return formatted || null;
}

export function formatActivityPlanCatalogTotal(total: string): string {
  const timed = /^(Time|Timed subtotal): (?:(\d+)h ?)?(?:(\d+)m ?)?(?:(\d+)s)?$/u.exec(total);
  if (timed) {
    const minutes = Number(timed[2] ?? 0) * 60 + Number(timed[3] ?? 0);
    const seconds = Number(timed[4] ?? 0);
    const prefix = timed[1] === "Timed subtotal" ? "Timed: " : "";
    return `${prefix}${minutes ? `${minutes} min` : ""}${minutes && seconds ? " " : ""}${seconds ? `${seconds} sec` : ""}`;
  }
  return total
    .replace(/^Time: /u, "")
    .replace(/^Timed subtotal: /u, "Timed: ")
    .replace(/(\d+)m\b/gu, "$1 min")
    .replace(/(\d+)s\b/gu, "$1 sec");
}

/** Time labels from the print model have no space before m/s; distances do. */
export function formatActivityPlanCatalogDuration(duration: string): string {
  return duration.replace(/(\d+)m\b/gu, "$1 min").replace(/(\d+)s\b/gu, "$1 sec");
}

export function getActivityPlanCatalogTimedProfileWidths(
  bars: readonly { durationSeconds?: number | null }[],
): readonly number[] | null {
  if (
    bars.length === 0 ||
    bars.some((bar) => bar.durationSeconds == null || bar.durationSeconds <= 0)
  )
    return null;
  const totalSeconds = bars.reduce((total, bar) => total + (bar.durationSeconds ?? 0), 0);
  if (totalSeconds <= 0) return null;
  return bars.map((bar) => ((bar.durationSeconds ?? 0) / totalSeconds) * 100);
}

export type ActivityPlanCatalogEntry = {
  key: string;
  model: ActivityPlanPrintModel;
};

export function buildPublisherActivityPlanCatalogModels(): ActivityPlanCatalogEntry[] {
  return buildActivityPlanCatalogModels(
    SYSTEM_TEMPLATES.filter((template) => !PUBLISHER_EXCLUDED_TEMPLATE_IDS.has(template.id)),
  );
}

export type ActivityPlanCatalogSection = {
  entries: readonly ActivityPlanCatalogEntry[];
  key: string;
  title: string;
};

export type ActivityPlanCatalogPage = {
  entries: readonly [ActivityPlanCatalogFragment];
  pageNumber: number;
  sectionKey: string;
  sectionTitle: string;
};

/** A renderable portion of one canonical catalog entry. */
export type ActivityPlanCatalogFragment = {
  continuedGroupIds: readonly string[];
  continuesAfterGroupIds: readonly string[];
  entry: ActivityPlanCatalogEntry;
  key: string;
  model: ActivityPlanPrintModel;
  partCount: number;
  partIndex: number;
  showContext: boolean;
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
  schedulePageNumbers: readonly number[];
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
  /** Mixam's 0.6 in wire-o gutter plus the 0.125 in bleed. */
  binding: 52.2,
  /** Mixam's 0.25 in quiet area plus the 0.125 in bleed. */
  outside: 27,
} as const;
export const ACTIVITY_PLAN_CATALOG_PAGE_SIZE = {
  height: 613.275591,
  width: 437.527559,
} as const;
export const ACTIVITY_PLAN_CATALOG_PRINT_GEOMETRY = {
  bleedPoints: 9,
  pageHeight: ACTIVITY_PLAN_CATALOG_PAGE_SIZE.height,
  pageWidth: ACTIVITY_PLAN_CATALOG_PAGE_SIZE.width,
  trimHeight: 595.275591,
  trimWidth: 419.527559,
} as const;
const ACTIVITY_PLAN_CATALOG_CONTENTS_COLUMN_ROWS = 24;
// A week can contain several long authored titles; one week per A5 schedule
// page preserves the 8 pt minimum rather than relying on renderer overflow.
const TRAINING_SCHEDULE_WEEKS_PER_PAGE = 1;

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

function fragmentModel(
  entry: ActivityPlanCatalogEntry,
  groups: readonly ActivityPlanPrintGroup[],
  includeNotes: boolean,
): ActivityPlanPrintModel {
  const firstSection = entry.model.sections[0];
  if (!firstSection)
    throw new Error(`Catalog entry has no printable section: ${entry.model.title}`);
  return {
    ...entry.model,
    notes: includeNotes ? entry.model.notes : null,
    sections: [{ ...firstSection, groups }],
  };
}

type FlattenedStep = { group: ActivityPlanPrintGroup; groupStepIndex: number };

function createFragment(
  entry: ActivityPlanCatalogEntry,
  steps: readonly FlattenedStep[],
  start: number,
  end: number,
): ActivityPlanCatalogFragment {
  const selected = steps.slice(start, end);
  const groups = selected.reduce<ActivityPlanPrintGroup[]>((result, item) => {
    const step = item.group.steps[item.groupStepIndex];
    if (!step) throw new Error(`Missing catalog step in ${entry.model.title}`);
    const previous = result.at(-1);
    if (previous?.id === item.group.id) {
      previous.steps = [...previous.steps, step];
    } else {
      result.push({ ...item.group, steps: [step] });
    }
    return result;
  }, []);
  const first = selected[0];
  const last = selected.at(-1);
  if (!first || !last) throw new Error(`Catalog fragment has no steps: ${entry.model.title}`);
  return {
    continuedGroupIds: first.groupStepIndex > 0 ? [first.group.id] : [],
    continuesAfterGroupIds:
      last.groupStepIndex < last.group.steps.length - 1 ? [last.group.id] : [],
    entry,
    key: `${entry.key}-steps-${start}-${end}`,
    model: fragmentModel(entry, groups, end === steps.length),
    partCount: 0,
    partIndex: 0,
    showContext: start === 0,
  };
}

export type ActivityPlanCatalogFragmentFits = (
  fragment: ActivityPlanCatalogFragment,
) => Promise<boolean>;

export type ActivityPlanCatalogFragmentMeasurementOptions = {
  /**
   * Keep complete authored groups together when they fit. This is useful for
   * large-format reading editions: a repeat label must not be separated from
   * the recovery that completes its motif. Oversized groups still fall back to
   * the existing step-level continuation behaviour.
   */
  preferWholeGroups?: boolean;
};

/** Uses the caller's rendered-page measurement; no text-height estimate participates in pagination. */
export async function measureActivityPlanCatalogFragments(
  entry: ActivityPlanCatalogEntry,
  fits: ActivityPlanCatalogFragmentFits,
  options: ActivityPlanCatalogFragmentMeasurementOptions = {},
): Promise<readonly ActivityPlanCatalogFragment[]> {
  const steps = entry.model.sections.flatMap((section) =>
    section.groups.flatMap((group) =>
      group.steps.map((_, groupStepIndex) => ({ group, groupStepIndex })),
    ),
  );
  if (!steps.length) throw new Error(`Catalog entry has no printable steps: ${entry.model.title}`);
  if (await fits(createFragment(entry, steps, 0, steps.length))) {
    return [
      {
        ...createFragment(entry, steps, 0, steps.length),
        key: `${entry.key}-part-1`,
        partCount: 1,
      },
    ];
  }
  const fragments: ActivityPlanCatalogFragment[] = [];
  let start = 0;
  while (start < steps.length) {
    let best = 0;
    const groupEnds = options.preferWholeGroups
      ? Array.from(
          new Set(
            steps
              .map((step, index) =>
                index === steps.length - 1 || steps[index + 1]?.group.id !== step.group.id
                  ? index + 1
                  : null,
              )
              .filter((end): end is number => end !== null && end > start),
          ),
        )
      : [];
    const candidateEnds = groupEnds.length
      ? [...groupEnds].sort((left, right) => right - left)
      : Array.from({ length: steps.length - start }, (_, index) => steps.length - index);
    // Continuation notices disappear at group boundaries, so rendered fit is
    // not necessarily monotonic. Try longest first rather than binary search.
    for (const end of candidateEnds) {
      if (await fits(createFragment(entry, steps, start, end))) {
        best = end;
        break;
      }
    }
    // A single oversized group remains printable using the established
    // step-level continuation semantics rather than omitting any content.
    if (best === 0 && groupEnds.length) {
      for (let end = steps.length; end > start; end -= 1) {
        if (await fits(createFragment(entry, steps, start, end))) {
          best = end;
          break;
        }
      }
    }
    if (best === 0) {
      const step = steps[start];
      throw new Error(`Catalog step cannot fit on A5: ${entry.model.title} / ${step?.group.id}`);
    }
    fragments.push(createFragment(entry, steps, start, best));
    start = best;
  }
  return fragments.map((fragment, partIndex) => ({
    ...fragment,
    key: `${entry.key}-part-${partIndex + 1}`,
    partCount: fragments.length,
    partIndex,
  }));
}

export function buildActivityPlanCatalogModels(
  templates: readonly SystemTemplate[] = SYSTEM_TEMPLATES,
): ActivityPlanCatalogEntry[] {
  return templates.map((template) => {
    const model = buildActivityPlanPrintModel({
      format: "full-page",
      ...(template.description === undefined ? {} : { description: template.description }),
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
  trainingPlans: readonly SystemTrainingPlanTemplate[] = ALL_SAMPLE_PLANS,
  measuredFragments: ReadonlyMap<string, readonly ActivityPlanCatalogFragment[]> = new Map(),
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
    for (const entry of section.entries) {
      const allSteps = entry.model.sections.flatMap((section) =>
        section.groups.flatMap((group) =>
          group.steps.map((_, groupStepIndex) => ({ group, groupStepIndex })),
        ),
      );
      const fragments = measuredFragments.get(entry.key) ?? [
        {
          ...createFragment(entry, allSteps, 0, allSteps.length),
          key: `${entry.key}-part-1`,
          partCount: 1,
        },
      ];
      for (const first of fragments) {
        planPages.push({
          entries: [first],
          pageNumber,
          sectionKey: section.key,
          sectionTitle: section.title,
        });
        pageNumber += 1;
      }
    }
  }

  const activityPageNumbers = new Map(
    planPages.flatMap((page) =>
      page.entries
        .filter((fragment) => fragment.partIndex === 0)
        .map((fragment) => [fragment.entry.key, page.pageNumber]),
    ),
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
  const trainingPlanSection: ActivityPlanCatalogTrainingPlanSection | null =
    trainingPlans.length === 0
      ? null
      : {
          ...(alignmentBlankPageNumber ? { alignmentBlankPageNumber } : {}),
          openerPageNumber,
          plans: trainingPlans.map((plan) => {
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
              overviewPageNumber: 0,
              schedulePageNumbers: [],
              scheduleVisual,
              sessionsPerWeekTarget: plan.sessions_per_week_target,
              weeks,
            };
          }),
        };

  if (trainingPlanSection) {
    let trainingPageNumber = openerPageNumber + 1;
    trainingPlanSection.plans.forEach((plan) => {
      plan.overviewPageNumber = trainingPageNumber;
      trainingPageNumber += 1;
      const schedulePageCount = Math.max(
        1,
        Math.ceil(plan.weeks.length / TRAINING_SCHEDULE_WEEKS_PER_PAGE),
      );
      plan.schedulePageNumbers = Array.from(
        { length: schedulePageCount },
        (_, index) => trainingPageNumber + index,
      );
      trainingPageNumber += schedulePageCount;
    });
  }

  return { contentsPages, finderSections, planPages, sections, trainingPlanSection };
}

export function assertActivityPlanCatalogLayout(
  layout: ActivityPlanCatalogLayout,
  expectedEntries: readonly ActivityPlanCatalogEntry[],
): void {
  const fragments = layout.planPages.flatMap((page) => page.entries);
  const sourceKeys = new Set(fragments.map((fragment) => fragment.entry.key));
  if (
    sourceKeys.size !== expectedEntries.length ||
    expectedEntries.some((entry) => !sourceKeys.has(entry.key))
  ) {
    throw new Error(
      `Catalog placed ${sourceKeys.size} of ${expectedEntries.length} activity plans`,
    );
  }
  if (
    fragments.some(
      (fragment) => !expectedEntries.some((expected) => expected.key === fragment.entry.key),
    )
  ) {
    throw new Error("Catalog contains an unexpected activity plan");
  }
  for (const entry of expectedEntries) {
    const expectedSteps = entry.model.sections.flatMap((section) =>
      section.groups.flatMap((group) => group.steps.map((step) => step.id)),
    );
    const entryFragments = fragments
      .filter((fragment) => fragment.entry.key === entry.key)
      .sort((left, right) => left.partIndex - right.partIndex);
    if (
      entryFragments.length === 0 ||
      entryFragments.some(
        (fragment, index) =>
          fragment.partIndex !== index || fragment.partCount !== entryFragments.length,
      ) ||
      entryFragments
        .flatMap((fragment) =>
          fragment.model.sections.flatMap((section) =>
            section.groups.flatMap((group) => group.steps.map((step) => step.id)),
          ),
        )
        .join("\u0000") !== expectedSteps.join("\u0000")
    ) {
      throw new Error(
        `Catalog continuation lost, reordered, or duplicated steps for ${entry.model.title}`,
      );
    }
  }
  for (const page of layout.planPages) {
    if (page.entries.length !== 1)
      throw new Error(`Catalog page ${page.pageNumber} is not full-page`);
  }
}

export function getActivityPlanCatalogContentPageCount(layout: ActivityPlanCatalogLayout): number {
  const finalTrainingPlanPage = layout.trainingPlanSection?.plans
    .at(-1)
    ?.schedulePageNumbers.at(-1);
  if (finalTrainingPlanPage) return finalTrainingPlanPage;
  return (
    layout.planPages.at(-1)?.pageNumber ??
    ACTIVITY_PLAN_CATALOG_BASE_FRONT_MATTER_PAGES + layout.contentsPages.length
  );
}

export function activityPlanCatalogNeedsBlankBeforeBackCover(
  layout: ActivityPlanCatalogLayout,
): boolean {
  // Align the separate inside-back-cover leaf to an odd physical page.
  return getActivityPlanCatalogContentPageCount(layout) % 2 === 1;
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
