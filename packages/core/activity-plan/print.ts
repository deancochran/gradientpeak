import { getIntensityZone, INTENSITY_ZONES } from "../constants";
import type { AthletePerformanceTargetFacts } from "../performance-model";
import type { CanonicalActivityCategory } from "../schemas/activity-category";
import { deriveActivityPlanPresentation } from "./presentation";
import {
  getActivityPlanSessionFlowTargetPresentations,
  resolveActivityPlanSessionFlow,
} from "./session-flow-personalization";
import type { ActivityPlanDuration } from "./structure-schema";

export type ActivityPlanPrintFormat = "full-page" | "swim-deck-card" | "bike-cue-strip";
export type ActivityPlanBikeCueLength = "short" | "long";

export type ActivityPlanPrintStep = {
  description: string | null;
  id: string;
  instruction: string;
  name: string | null;
  notes: string | null;
};

export type ActivityPlanPrintGroup = {
  id: string;
  name: string | null;
  notes: string | null;
  repetitions: number;
  steps: readonly ActivityPlanPrintStep[];
};

export type ActivityPlanPrintSection = {
  groups: readonly ActivityPlanPrintGroup[];
  id: string;
  name: string | null;
  notes: string | null;
};

export type ActivityPlanPrintProfileBar = {
  color: string;
  duration: string;
  heightPercent: number;
  id: string;
  label: string;
  role: "activity" | "rest";
  weight: number;
};

function formatProfileIntensityLabel(label: string | null, role: "activity" | "rest"): string {
  if (!label) return role === "rest" ? "Recovery" : "Intensity unavailable";
  const match = /^(RPE|%FTP|%MaxHR|%ThresholdHR)\s+(.+)$/u.exec(label);
  if (!match) return label;
  const [, type, intensity] = match;
  switch (type) {
    case "RPE":
      return `${intensity} RPE`;
    case "%FTP":
      return `${intensity}% FTP`;
    case "%MaxHR":
      return `${intensity}% Max HR`;
    case "%ThresholdHR":
      return `${intensity}% Threshold HR`;
    default:
      return label;
  }
}

export type ActivityPlanPrintModel = {
  activityCategory: CanonicalActivityCategory;
  description: string | null;
  format: ActivityPlanPrintFormat;
  intensityProfile: readonly ActivityPlanPrintProfileBar[];
  intensityReferences: readonly string[];
  notes: string | null;
  sections: readonly ActivityPlanPrintSection[];
  title: string;
  totals: readonly string[];
};

export function getActivityPlanBikeCueLength(
  model: Pick<ActivityPlanPrintModel, "sections">,
): ActivityPlanBikeCueLength {
  const stepCount = model.sections.reduce(
    (sectionTotal, section) =>
      sectionTotal +
      section.groups.reduce((groupTotal, group) => groupTotal + group.steps.length, 0),
    0,
  );
  return stepCount <= 5 ? "short" : "long";
}

function normalizeLabel(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function labelsMatch(left: string | null | undefined, right: string | null | undefined): boolean {
  return Boolean(left && right && normalizeLabel(left) === normalizeLabel(right));
}

function isGenericSectionLabel(
  label: string,
  activityCategory: CanonicalActivityCategory,
): boolean {
  const normalized = normalizeLabel(label);
  return normalized === "activity" || normalized === `${activityCategory} activity`;
}

function occurrenceWeight(duration: ActivityPlanDuration): number {
  switch (duration.type) {
    case "time":
      return Math.max(0.25, Math.min(8, duration.seconds / 60));
    case "distance":
      return Math.max(0.25, Math.min(8, duration.meters / 100));
    case "repetitions":
      return Math.max(0.25, Math.min(8, duration.count / 5));
    case "untilFinished":
      return 1;
  }
}

function buildIntensityProfile(structure: unknown): readonly ActivityPlanPrintProfileBar[] {
  const presentation = deriveActivityPlanPresentation(structure);
  if (!presentation) return [];
  return presentation.occurrences.map((occurrence) => {
    const isRecovery = occurrence.role === "rest" || occurrence.visualIntensity === null;
    const intensity = occurrence.visualIntensity ?? 0;
    return {
      color: isRecovery ? "#cbd5e1" : INTENSITY_ZONES[getIntensityZone(intensity * 100)].color,
      duration: formatActivityPlanPrintDuration(occurrence.duration),
      heightPercent: isRecovery ? 18 : Math.round(24 + intensity * 76),
      id: occurrence.occurrenceId,
      label: formatProfileIntensityLabel(occurrence.intensityLabel, occurrence.role),
      role: occurrence.role,
      weight: occurrenceWeight(occurrence.duration),
    };
  });
}

export function getActivityPlanPrintFormats(
  activityCategory: CanonicalActivityCategory,
): readonly ActivityPlanPrintFormat[] {
  if (activityCategory === "swim") return ["full-page", "swim-deck-card"];
  if (activityCategory === "bike") return ["full-page", "bike-cue-strip"];
  return ["full-page"];
}

export function getActivityPlanPrintFormatLabel(format: ActivityPlanPrintFormat): string {
  switch (format) {
    case "full-page":
      return "Full workout";
    case "swim-deck-card":
      return "Swim deck card";
    case "bike-cue-strip":
      return "Bike cue strip";
  }
}

export function formatActivityPlanPrintDuration(duration: ActivityPlanDuration): string {
  switch (duration.type) {
    case "time": {
      const hours = Math.floor(duration.seconds / 3_600);
      const minutes = Math.floor((duration.seconds % 3_600) / 60);
      const seconds = duration.seconds % 60;
      return [
        hours ? `${hours}h` : null,
        minutes ? `${minutes}m` : null,
        seconds ? `${seconds}s` : null,
      ]
        .filter(Boolean)
        .join(" ");
    }
    case "distance":
      return duration.meters >= 1_000
        ? `${Math.round((duration.meters / 1_000) * 100) / 100} km`
        : `${duration.meters} m`;
    case "repetitions":
      return `${duration.count} reps`;
    case "untilFinished":
      return "Until finished";
  }
}

function printTotals(input: {
  distanceMeters: number;
  repetitionCount: number;
  timeSeconds: number;
}) {
  const totals: string[] = [];
  if (input.distanceMeters > 0) {
    totals.push(
      input.distanceMeters >= 1_000
        ? `${Math.round((input.distanceMeters / 1_000) * 100) / 100} km`
        : `${input.distanceMeters} m`,
    );
  }
  if (input.timeSeconds > 0) {
    totals.push(formatActivityPlanPrintDuration({ type: "time", seconds: input.timeSeconds }));
  }
  if (input.repetitionCount > 0) totals.push(`${input.repetitionCount} reps`);
  return totals;
}

export function buildActivityPlanPrintModel(input: {
  description?: string | null;
  format: ActivityPlanPrintFormat;
  notes?: string | null;
  performanceTargets?: AthletePerformanceTargetFacts | null;
  personalizeTargets: boolean;
  structure: unknown;
  title: string;
}): ActivityPlanPrintModel | null {
  const resolution = resolveActivityPlanSessionFlow({
    structure: input.structure,
    ...(input.performanceTargets ? { performanceTargets: input.performanceTargets } : {}),
    personalize: input.personalizeTargets,
  });
  const structure = resolution.structure;
  const authoredStructure = resolution.authoredStructure;
  if (
    !structure ||
    !authoredStructure ||
    !getActivityPlanPrintFormats(structure.activity_category).includes(input.format)
  ) {
    return null;
  }

  const intensityReferences = new Set<string>();
  let distanceMeters = 0;
  let repetitionCount = 0;
  let timeSeconds = 0;
  const sections: ActivityPlanPrintSection[] = structure.segments.map((segment) => {
    if (segment.role === "rest") {
      timeSeconds += segment.duration.seconds;
      return {
        id: segment.id,
        name: null,
        notes: segment.notes ?? null,
        groups: [
          {
            id: segment.id,
            name: null,
            notes: null,
            repetitions: 1,
            steps: [
              {
                id: segment.id,
                name: labelsMatch(segment.name, input.title) ? null : segment.name,
                instruction: formatActivityPlanPrintDuration(segment.duration),
                description: null,
                notes: null,
              },
            ],
          },
        ],
      };
    }

    const sectionName =
      labelsMatch(segment.name, input.title) ||
      isGenericSectionLabel(segment.name, structure.activity_category)
        ? null
        : segment.name;
    const groups = segment.intervals.map((interval) => {
      const steps = interval.steps.map((step) => {
        const targetLabels = getActivityPlanSessionFlowTargetPresentations(resolution, step.id).map(
          (target) => target.label,
        );
        for (const target of targetLabels) intensityReferences.add(target);
        const multiplier = interval.repetitions;
        switch (step.duration.type) {
          case "time":
            timeSeconds += step.duration.seconds * multiplier;
            break;
          case "distance":
            distanceMeters += step.duration.meters * multiplier;
            break;
          case "repetitions":
            repetitionCount += step.duration.count * multiplier;
            break;
          case "untilFinished":
            break;
        }
        const duration = formatActivityPlanPrintDuration(step.duration);
        return {
          id: step.id,
          name: labelsMatch(step.name, input.title) ? null : step.name,
          instruction:
            targetLabels.length > 0 ? `${duration} at ${targetLabels.join(" · ")}` : duration,
          description: step.description ?? null,
          notes: step.notes ?? null,
        };
      });
      const onlyStepName = steps.length === 1 ? steps[0]?.name : null;
      return {
        id: interval.id,
        name:
          /^interval\s+\d+$/iu.test(interval.name.trim()) ||
          labelsMatch(interval.name, input.title) ||
          labelsMatch(interval.name, sectionName) ||
          labelsMatch(interval.name, onlyStepName)
            ? null
            : interval.name,
        notes: interval.notes ?? null,
        repetitions: interval.repetitions,
        steps,
      };
    });
    return { id: segment.id, name: sectionName, notes: segment.notes ?? null, groups };
  });

  return {
    activityCategory: structure.activity_category,
    description: input.description?.trim() || null,
    format: input.format,
    intensityProfile: buildIntensityProfile(authoredStructure),
    intensityReferences: [...intensityReferences],
    notes: input.notes?.trim() || null,
    sections,
    title: input.title.trim() || "Activity plan",
    totals: printTotals({ distanceMeters, repetitionCount, timeSeconds }),
  };
}
