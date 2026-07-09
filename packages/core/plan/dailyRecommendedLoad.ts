import { addDaysDateOnlyUtc, diffDateOnlyUtcDays } from "./dateOnlyUtc";

export type DailyRecommendedLoadActivityCategory = "run" | "bike" | "swim" | "strength" | "other";

export type DailyRecommendedLoadPrimaryFocus =
  | "rest"
  | "recovery"
  | "endurance"
  | "long_endurance"
  | "tempo"
  | "threshold"
  | "vo2"
  | "anaerobic"
  | "race_specific"
  | "strength_endurance"
  | "hypertrophy"
  | "max_strength"
  | "power"
  | "mobility"
  | "mixed_conditioning";

export type DailyRecommendedLoadWeekday =
  | number
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export interface DailyRecommendedLoadWeeklyTarget {
  weekIndex?: number;
  weekStartDate?: string;
  startDate?: string;
  endDate?: string;
  targetTss?: number | null;
  targetDurationMinutes?: number | null;
  targetFatigueCost?: number | null;
  targetStrengthSets?: number | null;
}

export interface DailyRecommendedLoadSession {
  date?: string | null;
  offsetDays?: number | null;
  estimatedTss?: number | null;
  estimatedDurationMinutes?: number | null;
  estimatedFatigueCost?: number | null;
  estimatedStrengthSets?: number | null;
  activityCategory?: DailyRecommendedLoadActivityCategory | null;
  primaryFocus?: DailyRecommendedLoadPrimaryFocus | null;
  intentType?: string | null;
}

export interface DailyRecommendedLoadActualOrScheduledPoint {
  date: string;
  tss?: number | null;
}

export interface DailyRecommendedLoadPoint {
  date: string;
  recommendedLoadTss: number;
  recommendedDurationMinutes: number;
  recommendedFatigueCost: number;
  recommendedStrengthSets: number;
  primaryFocus: DailyRecommendedLoadPrimaryFocus;
  activityCategory: DailyRecommendedLoadActivityCategory;
  scheduledLoadTss: number;
  completedLoadTss: number;
  loadDeltaTss: number;
  confidence: "low" | "medium" | "high";
  confidence_score?: number;
  reasonCodes: string[];
}

export interface BuildDailyRecommendedLoadInput {
  startDate: string;
  endDate: string;
  weeklyTargets: DailyRecommendedLoadWeeklyTarget[];
  sessions?: DailyRecommendedLoadSession[];
  preferredWeekdays?: DailyRecommendedLoadWeekday[] | null;
  hardRestDays?: DailyRecommendedLoadWeekday[] | null;
  scheduledLoads?: DailyRecommendedLoadActualOrScheduledPoint[] | null;
  completedLoads?: DailyRecommendedLoadActualOrScheduledPoint[] | null;
}

const WEEKDAY_TO_INDEX: Record<Exclude<DailyRecommendedLoadWeekday, number>, number> = {
  monday: 0,
  tuesday: 1,
  wednesday: 2,
  thursday: 3,
  friday: 4,
  saturday: 5,
  sunday: 6,
};

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

type DailyRecommendedLoadConfidenceBucket = DailyRecommendedLoadPoint["confidence"];

function confidenceBucketForScore(score: number): DailyRecommendedLoadConfidenceBucket {
  if (score >= 80) return "high";
  if (score >= 50) return "medium";
  return "low";
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function orderedReasonCodes(reasons: string[]): string[] {
  return [...new Set(reasons)];
}

function confidenceScoreForDay(input: {
  hasWeeklyTarget: boolean;
  weekTargetTss: number;
  isPartialWeek: boolean;
  hasSession: boolean;
  hasEstimatedSessionTss: boolean;
  hasExplicitSessionFocus: boolean;
  hasExplicitSessionCategory: boolean;
  hasPreferredWeekdays: boolean;
  usedDefaultWeekdayFallback: boolean;
  isHardRestDay: boolean;
  hasScheduledLoad: boolean;
  hasCompletedLoad: boolean;
  isRestDay: boolean;
}): number {
  let score = 20;
  if (input.hasWeeklyTarget) score += 25;
  if (input.weekTargetTss > 0) score += 10;
  if (input.hasSession) score += 20;
  if (input.hasEstimatedSessionTss) score += 10;
  if (input.hasExplicitSessionFocus) score += 5;
  if (input.hasExplicitSessionCategory) score += 5;
  if (input.hasPreferredWeekdays) score += 15;
  if (input.hasScheduledLoad) score += 5;
  if (input.hasCompletedLoad) score += 5;
  if (!input.hasWeeklyTarget) score -= 15;
  if (input.weekTargetTss <= 0) score -= 20;
  if (input.usedDefaultWeekdayFallback) score -= 10;
  if (input.isPartialWeek) score -= 5;
  if (input.isHardRestDay) score -= 5;
  if (input.isRestDay && !input.hasSession) score -= 5;
  return clamp(score, 0, 100);
}

function reasonCodesForDay(input: {
  hasWeeklyTarget: boolean;
  weekTargetTss: number;
  isPartialWeek: boolean;
  hasSession: boolean;
  hasEstimatedSessionTss: boolean;
  hasExplicitSessionFocus: boolean;
  hasExplicitSessionCategory: boolean;
  hasPreferredWeekdays: boolean;
  usedDefaultWeekdayFallback: boolean;
  isHardRestDay: boolean;
  hasScheduledLoad: boolean;
  hasCompletedLoad: boolean;
  isRestDay: boolean;
}): string[] {
  return orderedReasonCodes([
    "daily_recommended_load_v1",
    input.hasWeeklyTarget ? "source_weekly_target" : "source_missing_weekly_target",
    input.weekTargetTss <= 0 ? "target_zero_tss" : "target_positive_tss",
    ...(input.isPartialWeek ? ["partial_week_scaled"] : []),
    input.hasSession ? "source_planned_session" : "fallback_no_planned_session",
    ...(input.hasEstimatedSessionTss ? ["planned_session_estimated_tss"] : []),
    ...(input.hasExplicitSessionFocus ? ["planned_session_explicit_focus"] : []),
    ...(input.hasExplicitSessionCategory ? ["planned_session_explicit_activity"] : []),
    input.hasPreferredWeekdays
      ? "source_preferred_weekdays"
      : "fallback_missing_preferred_weekdays",
    ...(input.usedDefaultWeekdayFallback ? ["fallback_default_all_weekdays"] : []),
    ...(input.isHardRestDay ? ["hard_rest_day_applied"] : []),
    ...(input.hasScheduledLoad ? ["source_scheduled_load"] : []),
    ...(input.hasCompletedLoad ? ["source_completed_load"] : []),
    input.isRestDay ? "rest_day_allocation" : "weekly_target_daily_distribution",
  ]);
}

function toFinitePositive(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function normalizeWeekday(value: DailyRecommendedLoadWeekday): number | null {
  if (typeof value === "number") {
    return Number.isInteger(value) && value >= 0 && value <= 6 ? value : null;
  }
  return WEEKDAY_TO_INDEX[value] ?? null;
}

function normalizeWeekdaySet(
  values: DailyRecommendedLoadWeekday[] | null | undefined,
): Set<number> {
  const result = new Set<number>();
  for (const value of values ?? []) {
    const normalized = normalizeWeekday(value);
    if (normalized !== null) result.add(normalized);
  }
  return result;
}

function dateForSession(input: { session: DailyRecommendedLoadSession; startDate: string }) {
  if (input.session.date) return input.session.date;
  if (typeof input.session.offsetDays === "number" && Number.isFinite(input.session.offsetDays)) {
    return addDaysDateOnlyUtc(input.startDate, input.session.offsetDays);
  }
  return null;
}

function focusFromSession(session: DailyRecommendedLoadSession): DailyRecommendedLoadPrimaryFocus {
  if (session.primaryFocus) return session.primaryFocus;
  const intent = session.intentType?.toLowerCase() ?? "";
  if (intent.includes("recovery")) return "recovery";
  if (intent.includes("threshold")) return "threshold";
  if (intent.includes("tempo")) return "tempo";
  if (intent.includes("vo2")) return "vo2";
  if (intent.includes("strength")) return "strength_endurance";
  const tss = toFinitePositive(session.estimatedTss);
  if (tss >= 110) return "long_endurance";
  if (tss >= 75) return "threshold";
  if (tss >= 40) return "endurance";
  return "recovery";
}

function fallbackFocusForWeekday(
  weekday: number,
  activeWeekdays: number[],
): DailyRecommendedLoadPrimaryFocus {
  if (activeWeekdays.length === 0) return "rest";
  if (weekday === activeWeekdays[activeWeekdays.length - 1]) return "long_endurance";
  if (activeWeekdays.length >= 3 && weekday === activeWeekdays[1]) return "threshold";
  if (weekday === activeWeekdays[0]) return "endurance";
  return "recovery";
}

function weightForFocus(focus: DailyRecommendedLoadPrimaryFocus): number {
  switch (focus) {
    case "rest":
      return 0;
    case "recovery":
    case "mobility":
      return 0.45;
    case "endurance":
    case "strength_endurance":
      return 1;
    case "tempo":
    case "hypertrophy":
    case "mixed_conditioning":
      return 1.35;
    case "threshold":
    case "race_specific":
    case "max_strength":
      return 1.8;
    case "vo2":
    case "anaerobic":
    case "power":
      return 1.6;
    case "long_endurance":
      return 2.35;
  }
}

function buildLoadMap(points: DailyRecommendedLoadActualOrScheduledPoint[] | null | undefined) {
  const map = new Map<string, number>();
  for (const point of points ?? []) {
    map.set(point.date, round1((map.get(point.date) ?? 0) + toFinitePositive(point.tss)));
  }
  return map;
}

function findWeeklyTarget(input: {
  targetByWeekIndex: Map<number, DailyRecommendedLoadWeeklyTarget>;
  targetByStartDate: Map<string, DailyRecommendedLoadWeeklyTarget>;
  weekIndex: number;
  weekStartDate: string;
}) {
  return (
    input.targetByWeekIndex.get(input.weekIndex) ?? input.targetByStartDate.get(input.weekStartDate)
  );
}

function allocateTotal(total: number, weights: number[]): number[] {
  const weightTotal = weights.reduce((sum, weight) => sum + Math.max(0, weight), 0);
  if (total <= 0 || weightTotal <= 0) return weights.map(() => 0);

  const raw = weights.map((weight) => (total * Math.max(0, weight)) / weightTotal);
  const rounded = raw.map((value) => Math.floor(value));
  let remainder = Math.round(total - rounded.reduce((sum, value) => sum + value, 0));
  const order = raw
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index);
  for (const item of order) {
    if (remainder <= 0) break;
    rounded[item.index] = (rounded[item.index] ?? 0) + 1;
    remainder -= 1;
  }
  return rounded;
}

export function buildDailyRecommendedLoad(
  input: BuildDailyRecommendedLoadInput,
): DailyRecommendedLoadPoint[] {
  const dayCount = diffDateOnlyUtcDays(input.startDate, input.endDate) + 1;
  if (dayCount <= 0) return [];

  const preferredWeekdays = normalizeWeekdaySet(input.preferredWeekdays);
  const hardRestDays = normalizeWeekdaySet(input.hardRestDays);
  const scheduledByDate = buildLoadMap(input.scheduledLoads);
  const completedByDate = buildLoadMap(input.completedLoads);
  const sessionsByDate = new Map<string, DailyRecommendedLoadSession[]>();
  for (const session of input.sessions ?? []) {
    const date = dateForSession({ session, startDate: input.startDate });
    if (!date || date < input.startDate || date > input.endDate) continue;
    const sessions = sessionsByDate.get(date) ?? [];
    sessions.push(session);
    sessionsByDate.set(date, sessions);
  }

  const targetByWeekIndex = new Map<number, DailyRecommendedLoadWeeklyTarget>();
  const targetByStartDate = new Map<string, DailyRecommendedLoadWeeklyTarget>();
  for (const target of input.weeklyTargets) {
    if (typeof target.weekIndex === "number") targetByWeekIndex.set(target.weekIndex, target);
    const weekStartDate = target.weekStartDate ?? target.startDate;
    if (weekStartDate) targetByStartDate.set(weekStartDate, target);
  }

  const results: DailyRecommendedLoadPoint[] = [];
  const weekCount = Math.ceil(dayCount / 7);
  for (let weekIndex = 0; weekIndex < weekCount; weekIndex += 1) {
    const weekStartOffset = weekIndex * 7;
    const daysInWeek = Math.min(7, dayCount - weekStartOffset);
    const weekStartDate = addDaysDateOnlyUtc(input.startDate, weekStartOffset);
    const weeklyTarget = findWeeklyTarget({
      targetByWeekIndex,
      targetByStartDate,
      weekIndex,
      weekStartDate,
    });
    const partialWeekScale = daysInWeek / 7;
    const weekTargetTss = toFinitePositive(weeklyTarget?.targetTss) * partialWeekScale;
    const weekTargetDuration =
      toFinitePositive(weeklyTarget?.targetDurationMinutes) * partialWeekScale;
    const explicitWeekTargetFatigue = toFinitePositive(weeklyTarget?.targetFatigueCost);
    const weekTargetFatigue = explicitWeekTargetFatigue
      ? explicitWeekTargetFatigue * partialWeekScale
      : weekTargetTss;
    const weekTargetStrengthSets =
      toFinitePositive(weeklyTarget?.targetStrengthSets) * partialWeekScale;
    const candidateWeekdays = new Set<number>();
    for (let dayOffset = 0; dayOffset < daysInWeek; dayOffset += 1) {
      const date = addDaysDateOnlyUtc(weekStartDate, dayOffset);
      const weekday = dayOffset;
      if (sessionsByDate.has(date)) candidateWeekdays.add(weekday);
      if (preferredWeekdays.has(weekday) && !hardRestDays.has(weekday))
        candidateWeekdays.add(weekday);
    }
    const usedDefaultWeekdayFallback = candidateWeekdays.size === 0;
    if (candidateWeekdays.size === 0) {
      for (let dayOffset = 0; dayOffset < daysInWeek; dayOffset += 1) {
        if (!hardRestDays.has(dayOffset)) candidateWeekdays.add(dayOffset);
      }
    }
    const activeWeekdays = [...candidateWeekdays].sort((left, right) => left - right);

    const rows = Array.from({ length: daysInWeek }, (_, dayOffset) => {
      const date = addDaysDateOnlyUtc(weekStartDate, dayOffset);
      const sessions = sessionsByDate.get(date) ?? [];
      const hasSession = sessions.length > 0;
      const hasEstimatedSessionTss = sessions.some(
        (session) => toFinitePositive(session.estimatedTss) > 0,
      );
      const hasExplicitSessionFocus = sessions.some(
        (session) => session.primaryFocus !== undefined && session.primaryFocus !== null,
      );
      const hasExplicitSessionCategory = sessions.some(
        (session) => session.activityCategory !== undefined && session.activityCategory !== null,
      );
      const sessionFocuses = sessions
        .map(focusFromSession)
        .sort((left, right) => weightForFocus(right) - weightForFocus(left));
      const focus = hasSession
        ? (sessionFocuses[0] ?? "recovery")
        : activeWeekdays.includes(dayOffset)
          ? fallbackFocusForWeekday(dayOffset, activeWeekdays)
          : "rest";
      const estimatedSessionTss = sessions.reduce(
        (sum, session) => sum + toFinitePositive(session.estimatedTss),
        0,
      );
      const sessionWeightBoost =
        estimatedSessionTss > 0 ? Math.min(2.5, estimatedSessionTss / 55) : 1;
      const weight = focus === "rest" ? 0 : weightForFocus(focus) * sessionWeightBoost;
      const activityCategory =
        sessions.find((session) => session.activityCategory)?.activityCategory ??
        (focus.includes("strength") || ["hypertrophy", "max_strength", "power"].includes(focus)
          ? "strength"
          : "run");
      return {
        date,
        focus,
        activityCategory,
        weight,
        hasSession,
        hasEstimatedSessionTss,
        hasExplicitSessionFocus,
        hasExplicitSessionCategory,
        isHardRestDay: hardRestDays.has(dayOffset),
      };
    });

    const tss = allocateTotal(
      weekTargetTss,
      rows.map((row) => row.weight),
    );
    const duration = allocateTotal(
      weekTargetDuration,
      rows.map((row) => row.weight),
    );
    const fatigue = allocateTotal(
      weekTargetFatigue,
      rows.map((row) => row.weight),
    );
    const strengthSets = allocateTotal(
      weekTargetStrengthSets,
      rows.map((row) => row.weight),
    );
    rows.forEach((row, index) => {
      const recommendedLoadTss = round1(tss[index] ?? 0);
      const completedLoadTss = round1(completedByDate.get(row.date) ?? 0);
      const scheduledLoadTss = round1(scheduledByDate.get(row.date) ?? 0);
      const confidenceScore = confidenceScoreForDay({
        hasWeeklyTarget: weeklyTarget !== undefined,
        weekTargetTss,
        isPartialWeek: daysInWeek < 7,
        hasSession: row.hasSession,
        hasEstimatedSessionTss: row.hasEstimatedSessionTss,
        hasExplicitSessionFocus: row.hasExplicitSessionFocus,
        hasExplicitSessionCategory: row.hasExplicitSessionCategory,
        hasPreferredWeekdays: preferredWeekdays.size > 0,
        usedDefaultWeekdayFallback,
        isHardRestDay: row.isHardRestDay,
        hasScheduledLoad: scheduledLoadTss > 0,
        hasCompletedLoad: completedLoadTss > 0,
        isRestDay: row.focus === "rest",
      });
      results.push({
        date: row.date,
        recommendedLoadTss,
        recommendedDurationMinutes: round1(duration[index] ?? 0),
        recommendedFatigueCost: round1(fatigue[index] ?? 0),
        recommendedStrengthSets: round1(strengthSets[index] ?? 0),
        primaryFocus: row.focus,
        activityCategory: row.activityCategory,
        scheduledLoadTss,
        completedLoadTss,
        loadDeltaTss: round1(completedLoadTss - recommendedLoadTss),
        confidence: confidenceBucketForScore(confidenceScore),
        confidence_score: confidenceScore,
        reasonCodes: reasonCodesForDay({
          hasWeeklyTarget: weeklyTarget !== undefined,
          weekTargetTss,
          isPartialWeek: daysInWeek < 7,
          hasSession: row.hasSession,
          hasEstimatedSessionTss: row.hasEstimatedSessionTss,
          hasExplicitSessionFocus: row.hasExplicitSessionFocus,
          hasExplicitSessionCategory: row.hasExplicitSessionCategory,
          hasPreferredWeekdays: preferredWeekdays.size > 0,
          usedDefaultWeekdayFallback,
          isHardRestDay: row.isHardRestDay,
          hasScheduledLoad: scheduledLoadTss > 0,
          hasCompletedLoad: completedLoadTss > 0,
          isRestDay: row.focus === "rest",
        }),
      });
    });
  }

  return results;
}
