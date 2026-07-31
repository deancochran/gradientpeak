import { canonicalTrainingPlanStructureSchema } from "@repo/core";

export type TrainingPlanVisualPhase =
  | "foundation"
  | "build"
  | "specific"
  | "peak"
  | "recover"
  | "maintain";

export type TrainingPlanVisualSegment = {
  index: number;
  relativeLoad: number;
  relativeRecovery: number;
  relativeSpecificity: number;
  activityCategoryMix: Record<string, number>;
  phase: TrainingPlanVisualPhase;
  isGoalSegment?: boolean;
};

export type TrainingPlanVisualModel = {
  labels: string[];
  planType: "template";
  totalSegments: number;
  segments: TrainingPlanVisualSegment[];
};

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as UnknownRecord;
}

function clampUnit(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function deriveTrainingPlanVisual(plan: unknown): TrainingPlanVisualModel | null {
  const parsed = canonicalTrainingPlanStructureSchema.safeParse(asRecord(plan)?.structure);
  if (!parsed.success) {
    return null;
  }

  const structure = parsed.data;
  const totalSegments = Math.max(
    1,
    structure.durationWeeks?.recommended ??
      Math.ceil((Math.max(...structure.sessions.map((session) => session.offset_days)) + 1) / 7),
  );
  const activityCategories = structure.activity_category ?? ["mixed"];
  const activityCategoryMix = Object.fromEntries(
    activityCategories.map((activityCategory) => [activityCategory, 1 / activityCategories.length]),
  );
  const sessionsBySegment = Array.from({ length: totalSegments }, () => 0);
  structure.sessions.forEach((session) => {
    const segment = Math.min(totalSegments - 1, Math.floor(session.offset_days / 7));
    sessionsBySegment[segment] = (sessionsBySegment[segment] ?? 0) + 1;
  });
  const maxSessions = Math.max(...sessionsBySegment, 1);

  return {
    labels: ["Structured"],
    planType: "template",
    segments: sessionsBySegment.map((sessionCount, index) => ({
      index,
      phase: "specific",
      relativeLoad: clampUnit(sessionCount / maxSessions),
      relativeRecovery: sessionCount === 0 ? 1 : 0,
      relativeSpecificity: 0.5,
      activityCategoryMix,
    })),
    totalSegments,
  };
}

export function deriveTrainingPlanSummaryMetrics(plan: unknown) {
  const structure = canonicalTrainingPlanStructureSchema.safeParse(asRecord(plan)?.structure);
  if (!structure.success) {
    return {
      durationLabel: "--",
      experienceLabel: "All levels",
      activityCategoryLabel: "Mixed",
      sessionsLabel: "--",
    };
  }

  const durationWeeks = structure.data.durationWeeks?.recommended ?? null;
  const sessionsPerWeek = durationWeeks ? structure.data.sessions.length / durationWeeks : null;
  const activityCategories = structure.data.activity_category ?? [];
  const experienceLevels = structure.data.experienceLevel ?? [];

  return {
    durationLabel:
      durationWeeks !== null && durationWeeks > 0
        ? `${durationWeeks} week${durationWeeks === 1 ? "" : "s"}`
        : "--",
    experienceLabel: experienceLevels[0] ?? "All levels",
    activityCategoryLabel:
      activityCategories.length > 0 ? activityCategories.slice(0, 2).join(" / ") : "Mixed",
    sessionsLabel:
      sessionsPerWeek !== null && sessionsPerWeek > 0 ? `${sessionsPerWeek}/week` : "--",
  };
}
