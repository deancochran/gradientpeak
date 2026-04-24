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
  sportMix: Record<string, number>;
  phase: TrainingPlanVisualPhase;
  isGoalSegment?: boolean;
};

export type TrainingPlanVisualModel = {
  labels: string[];
  planType: "periodized" | "maintenance" | "template" | "legacy";
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

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readStringArray(value: unknown): string[] {
  if (typeof value === "string" && value.trim().length > 0) {
    return [value.trim()];
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function clampUnit(value: number) {
  return Math.max(0, Math.min(1, value));
}

function dateDiffInWeeks(startDate: string | null, endDate: string | null): number | null {
  if (!startDate || !endDate) {
    return null;
  }

  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return null;
  }

  return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000)));
}

function midpoint(range: unknown): number | null {
  const record = asRecord(range);
  if (!record) {
    return null;
  }

  const min = readNumber(record.min);
  const max = readNumber(record.max);
  if (min === null && max === null) {
    return null;
  }

  return ((min ?? max ?? 0) + (max ?? min ?? 0)) / 2;
}

function getLegacyWeekCount(plan: UnknownRecord, structure: UnknownRecord | null): number | null {
  const durationWeeks = asRecord(plan.durationWeeks) ?? asRecord(structure?.durationWeeks);
  const recommended = readNumber(durationWeeks?.recommended);
  const min = readNumber(durationWeeks?.min);
  const direct =
    recommended ?? min ?? readNumber(structure?.duration_weeks) ?? readNumber(plan.duration_weeks);
  if (direct !== null && direct > 0) {
    return direct;
  }

  const sessions = Array.isArray(structure?.sessions) ? structure.sessions : [];
  const maxOffset = sessions.reduce((max, session) => {
    const record = asRecord(session);
    const offset = readNumber(record?.offset_days) ?? readNumber(record?.day_offset);
    return offset !== null ? Math.max(max, offset) : max;
  }, 0);

  return maxOffset > 0 ? Math.ceil((maxOffset + 1) / 7) : null;
}

function getSportMix(plan: UnknownRecord, structure: UnknownRecord | null): Record<string, number> {
  const distribution =
    asRecord(plan.activity_distribution) ?? asRecord(structure?.activity_distribution);
  if (distribution) {
    const normalizedEntries = Object.entries(distribution)
      .map(([key, value]) => {
        const record = asRecord(value);
        const target = readNumber(record?.target_percentage);
        return target !== null ? [key, clampUnit(target)] : null;
      })
      .filter((entry): entry is [string, number] => Boolean(entry));

    if (normalizedEntries.length > 0) {
      const total = normalizedEntries.reduce((sum, [, value]) => sum + value, 0) || 1;
      return Object.fromEntries(normalizedEntries.map(([key, value]) => [key, value / total]));
    }
  }

  const sports = readStringArray(plan.sport ?? structure?.sport);
  if (sports.length > 0) {
    const weight = 1 / sports.length;
    return Object.fromEntries(sports.map((sport) => [sport, weight]));
  }

  return { mixed: 1 };
}

function mapPhase(phase: string | null): TrainingPlanVisualPhase {
  switch (phase) {
    case "base":
      return "foundation";
    case "build":
      return "build";
    case "peak":
      return "peak";
    case "taper":
    case "transition":
    case "recovery":
      return "recover";
    case "maintenance":
      return "maintain";
    default:
      return "specific";
  }
}

function phaseLabel(phase: TrainingPlanVisualPhase): string {
  switch (phase) {
    case "foundation":
      return "Foundation";
    case "build":
      return "Build";
    case "specific":
      return "Specific";
    case "peak":
      return "Peak";
    case "recover":
      return "Recover";
    case "maintain":
      return "Maintain";
  }
}

function inferLegacyPhase(progress: number, totalSegments: number): TrainingPlanVisualPhase {
  if (totalSegments <= 4) {
    return progress >= 0.85 ? "recover" : progress >= 0.6 ? "specific" : "build";
  }

  if (progress < 0.32) return "foundation";
  if (progress < 0.68) return "build";
  if (progress < 0.88) return "specific";
  return "recover";
}

function buildLegacyModel(
  plan: UnknownRecord,
  structure: UnknownRecord | null,
  totalSegments: number,
): TrainingPlanVisualModel {
  const weekCount = getLegacyWeekCount(plan, structure) ?? totalSegments;
  const sportMix = getSportMix(plan, structure);
  const targetDate = readText(asRecord(structure?.periodization_template)?.target_date);
  const weeklyTssMidpoint =
    midpoint(asRecord(structure?.target_weekly_tss_range)) ??
    ((readNumber(structure?.target_weekly_tss_min) ?? readNumber(plan.target_weekly_tss_min) ?? 0) +
      (readNumber(structure?.target_weekly_tss_max) ??
        readNumber(plan.target_weekly_tss_max) ??
        0)) /
      2;
  const baseLoad = weeklyTssMidpoint > 0 ? 0.4 : 0.34;
  const restDays = readNumber(structure?.min_rest_days_per_week) ?? 1;
  const cycleLength = weekCount >= 10 ? 4 : weekCount >= 6 ? 3 : 2;

  const segments: TrainingPlanVisualSegment[] = Array.from(
    { length: totalSegments },
    (_, index) => {
      const progress = totalSegments === 1 ? 1 : index / (totalSegments - 1);
      const phase = inferLegacyPhase(progress, totalSegments);
      let load = baseLoad + progress * 0.38;
      if ((index + 1) % cycleLength === 0) {
        load *= 0.74;
      }
      if (index === totalSegments - 1) {
        load *= 0.68;
      }
      if (index === totalSegments - 2) {
        load = Math.max(load, 0.82);
      }

      const relativeRecovery = phase === "recover" ? 0.85 : clampUnit(restDays / 4.5);
      const relativeSpecificity =
        phase === "specific" || phase === "peak" ? 0.8 : phase === "build" ? 0.55 : 0.25;

      return {
        index,
        isGoalSegment: Boolean(targetDate) && index >= totalSegments - 2,
        phase,
        relativeLoad: clampUnit(load),
        relativeRecovery,
        relativeSpecificity,
        sportMix,
      };
    },
  );

  return {
    labels: Array.from(new Set(segments.map((segment) => phaseLabel(segment.phase)))),
    planType: readText(plan.plan_type) === "maintenance" ? "maintenance" : "legacy",
    segments,
    totalSegments,
  };
}

function buildPeriodizedModel(
  plan: UnknownRecord,
  totalSegments: number,
): TrainingPlanVisualModel | null {
  const blocks = Array.isArray(plan.blocks)
    ? plan.blocks.map(asRecord).filter((block): block is UnknownRecord => block !== null)
    : [];
  if (blocks.length === 0) {
    return null;
  }

  const sportMix = getSportMix(plan, null);
  const weightedBlocks = blocks.map((block, index) => {
    const startDate = readText(block.start_date);
    const endDate = readText(block.end_date);
    const weeks = dateDiffInWeeks(startDate, endDate) ?? 1;
    const load = midpoint(block.target_weekly_tss_range) ?? 0;
    return {
      index,
      load,
      phase: mapPhase(readText(block.phase)),
      specific:
        block.phase === "peak" || block.phase === "build"
          ? 0.75
          : block.phase === "base"
            ? 0.3
            : 0.5,
      weeks,
    };
  });

  const totalWeeks = weightedBlocks.reduce((sum, block) => sum + block.weeks, 0) || 1;
  const maxLoad = Math.max(...weightedBlocks.map((block) => block.load), 1);
  const labels = Array.from(new Set(weightedBlocks.map((block) => phaseLabel(block.phase))));

  const segments: TrainingPlanVisualSegment[] = Array.from(
    { length: totalSegments },
    (_, index) => {
      const positionWeek = ((index + 0.5) / totalSegments) * totalWeeks;
      let accumulatedWeeks = 0;
      const block =
        weightedBlocks.find((candidate) => {
          accumulatedWeeks += candidate.weeks;
          return positionWeek <= accumulatedWeeks;
        }) ?? weightedBlocks[weightedBlocks.length - 1]!;

      const relativeLoad = clampUnit(block.load <= 0 ? 0.35 : 0.28 + (block.load / maxLoad) * 0.62);
      const relativeRecovery =
        block.phase === "recover" ? 0.9 : block.phase === "maintain" ? 0.45 : 0.2;

      return {
        index,
        isGoalSegment: block.phase === "peak" && index >= totalSegments - 2,
        phase: block.phase,
        relativeLoad,
        relativeRecovery,
        relativeSpecificity: block.specific,
        sportMix,
      };
    },
  );

  return {
    labels,
    planType: readText(plan.plan_type) === "maintenance" ? "maintenance" : "periodized",
    segments,
    totalSegments,
  };
}

export function deriveTrainingPlanVisual(
  plan: unknown,
  options?: { compact?: boolean },
): TrainingPlanVisualModel {
  const record = asRecord(plan) ?? {};
  const structure = asRecord(record.structure);
  const weekCount = getLegacyWeekCount(record, structure);
  const totalSegments = Math.max(1, weekCount ?? (options?.compact ? 8 : 10));
  const periodizedModel = buildPeriodizedModel(record, totalSegments);
  if (periodizedModel) {
    return periodizedModel;
  }

  return buildLegacyModel(record, structure, totalSegments);
}

export function deriveTrainingPlanSummaryMetrics(plan: unknown) {
  const record = asRecord(plan) ?? {};
  const structure = asRecord(record.structure);
  const durationRecord = asRecord(record.durationWeeks) ?? asRecord(structure?.durationWeeks);
  const durationWeeks =
    readNumber(durationRecord?.recommended) ??
    readNumber(durationRecord?.min) ??
    readNumber(structure?.duration_weeks) ??
    getLegacyWeekCount(record, structure);
  const sessionsPerWeek =
    readNumber(record.sessions_per_week_target) ??
    readNumber(record.sessionsPerWeek) ??
    readNumber(structure?.target_activities_per_week);
  const sports = readStringArray(record.sport ?? structure?.sport);
  const experienceLevels = readStringArray(record.experienceLevel ?? structure?.experienceLevel);

  return {
    durationLabel:
      durationWeeks !== null && durationWeeks > 0
        ? `${durationWeeks} week${durationWeeks === 1 ? "" : "s"}`
        : "--",
    experienceLabel: experienceLevels[0] ?? "All levels",
    sportLabel: sports.length > 0 ? sports.slice(0, 2).join(" / ") : "Mixed",
    sessionsLabel:
      sessionsPerWeek !== null && sessionsPerWeek > 0 ? `${sessionsPerWeek}/week` : "--",
  };
}
