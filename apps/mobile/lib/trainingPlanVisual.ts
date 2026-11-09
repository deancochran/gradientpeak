import { canonicalTrainingPlanStructureSchema } from "@repo/core";

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as UnknownRecord;
}

function asPositiveNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function asStringArray(value: unknown) {
  if (typeof value === "string" && value.length > 0) return [value];
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : [];
}

export function deriveTrainingPlanSummaryMetrics(plan: unknown) {
  const planRecord = asRecord(plan);
  const sessionsPerWeekTarget = asPositiveNumber(planRecord?.sessions_per_week_target);
  const nestedStructure = canonicalTrainingPlanStructureSchema.safeParse(planRecord?.structure);
  const flattenedStructure = nestedStructure.success
    ? nestedStructure
    : canonicalTrainingPlanStructureSchema.safeParse({
        version: 1,
        activity_category: asStringArray(planRecord?.activity_category),
        experienceLevel: asStringArray(planRecord?.experienceLevel),
        durationWeeks:
          asRecord(planRecord?.durationWeeks) ??
          (asPositiveNumber(planRecord?.durationWeeks) === null
            ? undefined
            : { recommended: asPositiveNumber(planRecord?.durationWeeks) }),
        sessions: Array.isArray(planRecord?.sessions) ? planRecord.sessions : undefined,
      });

  if (!flattenedStructure.success) {
    const flatDuration = asRecord(planRecord?.durationWeeks);
    const flatDurationWeeks =
      asPositiveNumber(flatDuration?.recommended) ?? asPositiveNumber(planRecord?.durationWeeks);
    const flatActivityCategories = asStringArray(planRecord?.activity_category);
    const flatExperienceLevels = asStringArray(planRecord?.experienceLevel);
    const flatSessionsPerWeek = asPositiveNumber(planRecord?.sessionsPerWeek);

    return {
      durationLabel:
        flatDurationWeeks === null
          ? "--"
          : `${flatDurationWeeks} week${flatDurationWeeks === 1 ? "" : "s"}`,
      experienceLabel: flatExperienceLevels[0] ?? "All levels",
      activityCategoryLabel:
        flatActivityCategories.length > 0
          ? flatActivityCategories.slice(0, 2).join(" / ")
          : "Mixed",
      sessionsLabel:
        sessionsPerWeekTarget === null
          ? flatSessionsPerWeek === null
            ? "--"
            : `Authored avg: ${flatSessionsPerWeek}/week`
          : `Target: ${sessionsPerWeekTarget}/week`,
    };
  }

  const durationWeeks = flattenedStructure.data.durationWeeks?.recommended ?? null;
  const sessionsPerWeek =
    asPositiveNumber(planRecord?.sessionsPerWeek) ??
    (durationWeeks ? flattenedStructure.data.sessions.length / durationWeeks : null);
  const activityCategories = flattenedStructure.data.activity_category ?? [];
  const experienceLevels = flattenedStructure.data.experienceLevel ?? [];

  return {
    durationLabel:
      durationWeeks !== null && durationWeeks > 0
        ? `${durationWeeks} week${durationWeeks === 1 ? "" : "s"}`
        : "--",
    experienceLabel: experienceLevels[0] ?? "All levels",
    activityCategoryLabel:
      activityCategories.length > 0 ? activityCategories.slice(0, 2).join(" / ") : "Mixed",
    sessionsLabel:
      sessionsPerWeekTarget !== null
        ? `Target: ${sessionsPerWeekTarget}/week`
        : sessionsPerWeek !== null && sessionsPerWeek > 0
          ? `Authored avg: ${sessionsPerWeek}/week`
          : "--",
  };
}
