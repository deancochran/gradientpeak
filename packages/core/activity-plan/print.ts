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
  /** The authored execution duration, kept separate so renderers need not parse instruction text. */
  durationLabel?: string;
  id: string;
  /** Backward-compatible compact representation for existing print consumers. */
  instruction: string;
  name: string | null;
  instructions: string | null;
  /** Ordered authored targets; an empty list means no target was authored. */
  targetLabels?: readonly string[];
};
export type ActivityPlanPrintGroup = {
  id: string;
  repetitions: number;
  steps: readonly ActivityPlanPrintStep[];
};
export type ActivityPlanPrintSection = {
  groups: readonly ActivityPlanPrintGroup[];
  id: string;
  name: string | null;
};
export type ActivityPlanPrintProfileBar = {
  color: string;
  duration: string;
  /** Exact timed duration for time-proportional renderers; null for non-timed work. */
  durationSeconds?: number | null;
  heightPercent: number;
  id: string;
  label: string;
  role: "activity";
  weight: number;
};
export type ActivityPlanPrintModel = {
  activityCategory: CanonicalActivityCategory;
  description: string | null;
  format: ActivityPlanPrintFormat;
  intensityProfile: readonly ActivityPlanPrintProfileBar[];
  intensityReferences: readonly string[];
  notes: null;
  sections: readonly ActivityPlanPrintSection[];
  title: string;
  totals: readonly string[];
};
export function getActivityPlanBikeCueLength(
  model: Pick<ActivityPlanPrintModel, "sections">,
): ActivityPlanBikeCueLength {
  return model.sections.reduce(
    (total, section) =>
      total + section.groups.reduce((count, group) => count + group.steps.length, 0),
    0,
  ) <= 5
    ? "short"
    : "long";
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
export function getActivityPlanPrintFormats(
  activityCategory: CanonicalActivityCategory,
): readonly ActivityPlanPrintFormat[] {
  if (activityCategory === "swim") return ["full-page", "swim-deck-card"];
  if (activityCategory === "bike") return ["full-page", "bike-cue-strip"];
  return ["full-page"];
}
export function getActivityPlanPrintFormatLabel(format: ActivityPlanPrintFormat): string {
  return format === "full-page"
    ? "Full activity plan"
    : format === "swim-deck-card"
      ? "Swim deck card"
      : "Bike cue strip";
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
  hasOpenEndedWork: boolean;
  repetitionCount: number;
  restSeconds: number;
  timeSeconds: number;
}): string[] {
  const totals: string[] = [];
  if (input.distanceMeters)
    totals.push(
      `${input.hasOpenEndedWork ? "Distance subtotal" : "Distance"}: ${
        input.distanceMeters >= 1_000
          ? `${Math.round((input.distanceMeters / 1_000) * 100) / 100} km`
          : `${input.distanceMeters} m`
      }`,
    );
  if (input.timeSeconds) {
    const duration = formatActivityPlanPrintDuration({ type: "time", seconds: input.timeSeconds });
    totals.push(
      `${input.restSeconds ? (input.hasOpenEndedWork ? "Active timed subtotal" : "Active time") : input.hasOpenEndedWork ? "Timed subtotal" : "Time"}: ${duration}`,
    );
  }
  if (input.restSeconds)
    totals.push(
      `Rest${input.hasOpenEndedWork ? " subtotal" : ""}: ${formatActivityPlanPrintDuration({ type: "time", seconds: input.restSeconds })}`,
    );
  if (input.repetitionCount)
    totals.push(
      `${input.hasOpenEndedWork ? "Repetitions subtotal" : "Repetitions"}: ${input.repetitionCount} reps`,
    );
  if (input.hasOpenEndedWork) totals.push("Plus open-ended work");
  return totals;
}
/** Builds V5 step/repeat print content without reconstructing removed segment or interval labels. */
export function buildActivityPlanPrintModel(input: {
  description?: string | null;
  format: ActivityPlanPrintFormat;
  notes?: never;
  performanceTargets?: AthletePerformanceTargetFacts | null;
  personalizeTargets?: boolean;
  structure: unknown;
  title: string;
}): ActivityPlanPrintModel | null {
  const resolution = resolveActivityPlanSessionFlow({
    structure: input.structure,
    ...(input.personalizeTargets !== false && input.performanceTargets
      ? { performanceTargets: input.performanceTargets }
      : {}),
    ...(input.personalizeTargets === undefined ? {} : { personalize: input.personalizeTargets }),
  });
  const structure = resolution.structure;
  if (
    !structure ||
    !getActivityPlanPrintFormats(structure.activity_category).includes(input.format)
  )
    return null;
  const intensityReferences = new Set<string>();
  let distanceMeters = 0;
  let hasOpenEndedWork = false;
  let repetitionCount = 0;
  let restSeconds = 0;
  let timeSeconds = 0;
  const groups = structure.items.map((item) => ({
    id: item.id,
    repetitions: item.type === "repeat" ? item.count : 1,
    steps: (item.type === "step" ? [item] : item.steps).map((step) => {
      const labels = getActivityPlanSessionFlowTargetPresentations(resolution, step.id).map(
        (target) => target.label,
      );
      labels.forEach((label) => {
        intensityReferences.add(label);
      });
      const count = item.type === "repeat" ? item.count : 1;
      if (step.duration.type === "time" && step.targets[0]?.type === "rest")
        restSeconds += step.duration.seconds * count;
      else if (step.duration.type === "time") timeSeconds += step.duration.seconds * count;
      else if (step.duration.type === "distance") distanceMeters += step.duration.meters * count;
      else if (step.duration.type === "repetitions") repetitionCount += step.duration.count * count;
      else hasOpenEndedWork = true;
      const duration = formatActivityPlanPrintDuration(step.duration);
      return {
        id: step.id,
        name: step.name ?? null,
        instructions: step.instructions ?? null,
        instruction: labels.length ? `${duration} at ${labels.join(" · ")}` : duration,
        durationLabel: duration,
        targetLabels: labels,
      };
    }),
  }));
  const presentation = deriveActivityPlanPresentation(structure);
  const intensityProfile =
    presentation?.occurrences.map((occurrence) => {
      const intensity = occurrence.visualIntensity ?? 0;
      return {
        color:
          occurrence.visualIntensity === null
            ? "#cbd5e1"
            : INTENSITY_ZONES[getIntensityZone(intensity * 100)].color,
        duration: formatActivityPlanPrintDuration(occurrence.duration),
        durationSeconds: occurrence.duration.type === "time" ? occurrence.duration.seconds : null,
        heightPercent: occurrence.visualIntensity === null ? 18 : Math.round(24 + intensity * 76),
        id: occurrence.occurrenceId,
        label: occurrence.intensityLabel ?? "Intensity unavailable",
        role: "activity" as const,
        weight: occurrenceWeight(occurrence.duration),
      };
    }) ?? [];
  return {
    activityCategory: structure.activity_category,
    description: input.description?.trim() || null,
    format: input.format,
    intensityProfile,
    intensityReferences: [...intensityReferences],
    notes: null,
    sections: [{ id: "blocks", name: null, groups }],
    title: input.title.trim() || "Activity plan",
    totals: printTotals({
      distanceMeters,
      hasOpenEndedWork,
      repetitionCount,
      restSeconds,
      timeSeconds,
    }),
  };
}
