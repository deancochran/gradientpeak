import type { AthletePreferenceProfile } from "../schemas/settings/profile_settings";
import type {
  DailyRecommendedLoadActivityCategory,
  DailyRecommendedLoadPrimaryFocus,
  DailyRecommendedLoadSession,
} from "./dailyRecommendedLoad";
import { addDaysDateOnlyUtc, diffDateOnlyUtcDays, parseDateOnlyUtc } from "./dateOnlyUtc";
import type { WeeklyAllocation } from "./weeklyAllocation";

export interface DailyLoadDistributionWeeklyTarget {
  weekStartDate: string;
  weekEndDate?: string;
  targetTss: number;
  phase?: string | null;
}

export interface DailyLoadDistributionPoint {
  date: string;
  recommended_load_tss: number;
  primary_focus: DailyRecommendedLoadPrimaryFocus;
  activity_category: DailyRecommendedLoadActivityCategory;
  confidence: "low" | "medium" | "high";
  confidence_score?: number;
  reason_codes: string[];
}

export interface BuildDailyLoadDistributionInput {
  startDate: string;
  endDate: string;
  weeklyTargets: DailyLoadDistributionWeeklyTarget[];
  preferenceProfile?: AthletePreferenceProfile | null;
  weeklyAllocation?: WeeklyAllocation | null;
  plannedSessions?: DailyRecommendedLoadSession[] | null;
}

const WEEKDAY_NAMES = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

const DEFAULT_WEEKLY_SESSION_COUNT = 3;

type DailyLoadConfidenceBucket = DailyLoadDistributionPoint["confidence"];

const SESSION_ANCHORS_BY_COUNT: Record<number, number[]> = {
  1: [3],
  2: [1, 5],
  3: [1, 3, 5],
  4: [0, 2, 4, 6],
  5: [0, 1, 3, 4, 6],
  6: [0, 1, 2, 4, 5, 6],
  7: [0, 1, 2, 3, 4, 5, 6],
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function confidenceBucketForScore(score: number): DailyLoadConfidenceBucket {
  if (score >= 80) return "high";
  if (score >= 50) return "medium";
  return "low";
}

function orderedReasonCodes(reasons: string[]): string[] {
  return [...new Set(reasons)];
}

function confidenceScoreForWeek(input: {
  hasWeeklyTarget: boolean;
  weeklyTss: number;
  isPartialWeek: boolean;
  hasPreferenceProfile: boolean;
  hasAvailabilityWindows: boolean;
  hasPlannedSessions: boolean;
  hasWeeklyAllocation: boolean;
  selectedHasPlannedSession: boolean;
  isRestDay: boolean;
}): number {
  let score = 20;
  if (input.hasWeeklyTarget) score += 25;
  if (input.weeklyTss > 0) score += 10;
  if (input.hasPreferenceProfile) score += 20;
  if (input.hasAvailabilityWindows) score += 10;
  if (input.hasPlannedSessions) score += 10;
  if (input.selectedHasPlannedSession) score += 5;
  if (input.hasWeeklyAllocation) score += 5;
  if (!input.hasWeeklyTarget) score -= 15;
  if (input.weeklyTss <= 0) score -= 20;
  if (input.isPartialWeek) score -= 5;
  if (input.isRestDay && !input.hasPlannedSessions) score -= 5;
  return clamp(score, 0, 100);
}

function reasonCodesForPoint(input: {
  hasWeeklyTarget: boolean;
  weeklyTss: number;
  isPartialWeek: boolean;
  hasPreferenceProfile: boolean;
  hasAvailabilityWindows: boolean;
  hasHardRestDays: boolean;
  hasPlannedSessions: boolean;
  selectedHasPlannedSession: boolean;
  hasWeeklyAllocation: boolean;
  isRestDay: boolean;
}): string[] {
  return orderedReasonCodes([
    "daily_load_distribution_v1",
    input.hasWeeklyTarget ? "source_weekly_target" : "source_missing_weekly_target",
    input.weeklyTss <= 0 ? "target_zero_tss" : "target_positive_tss",
    ...(input.isPartialWeek ? ["partial_week_scaled"] : []),
    input.hasPreferenceProfile
      ? "source_preference_profile"
      : "fallback_missing_preference_profile",
    input.hasAvailabilityWindows ? "availability_windows_applied" : "availability_default_pattern",
    ...(input.hasHardRestDays ? ["hard_rest_days_applied"] : []),
    input.hasPlannedSessions ? "source_planned_session_dates" : "fallback_anchor_session_pattern",
    ...(input.selectedHasPlannedSession ? ["planned_session_date_specific"] : []),
    input.hasWeeklyAllocation
      ? "source_weekly_allocation_activity_mix"
      : "fallback_default_activity_category",
    input.isRestDay ? "rest_day_allocation" : "profile_goal_weekly_distribution",
  ]);
}

function weekdayNameForDate(date: string): (typeof WEEKDAY_NAMES)[number] {
  return WEEKDAY_NAMES[parseDateOnlyUtc(date).getUTCDay()] ?? "monday";
}

function buildPlannedSessionDateSet(input: BuildDailyLoadDistributionInput) {
  const dates = new Set<string>();
  for (const session of input.plannedSessions ?? []) {
    const date =
      session.date ??
      (typeof session.offsetDays === "number" && Number.isFinite(session.offsetDays)
        ? addDaysDateOnlyUtc(input.startDate, session.offsetDays)
        : null);
    if (date && date >= input.startDate && date <= input.endDate) dates.add(date);
  }
  return dates;
}

function resolveAvailableMinutesByDay(
  preferenceProfile: AthletePreferenceProfile | null | undefined,
) {
  const map = new Map<string, number>();
  for (const day of preferenceProfile?.availability.weekly_windows ?? []) {
    const minutes = day.windows.reduce(
      (sum, window) => sum + Math.max(0, window.end_minute_of_day - window.start_minute_of_day),
      0,
    );
    map.set(day.day, minutes);
  }
  return map;
}

function resolveSessionCount(
  input: BuildDailyLoadDistributionInput,
  candidateCount: number,
): number {
  const minSessions = input.preferenceProfile?.dose_limits.min_sessions_per_week;
  const maxSessions = input.preferenceProfile?.dose_limits.max_sessions_per_week;
  const boundedMin = typeof minSessions === "number" ? clamp(minSessions, 1, 7) : null;
  const boundedMax = typeof maxSessions === "number" ? clamp(maxSessions, 1, 7) : null;
  const derived =
    boundedMin !== null && boundedMax !== null
      ? Math.round((boundedMin + boundedMax) / 2)
      : (boundedMax ?? boundedMin ?? DEFAULT_WEEKLY_SESSION_COUNT);
  return clamp(derived, 1, Math.max(1, candidateCount));
}

function chooseTrainingDates(input: {
  candidates: Array<{
    date: string;
    dayOffset: number;
    availabilityMinutes: number;
    hasSession: boolean;
  }>;
  sessionCount: number;
}) {
  const anchors = SESSION_ANCHORS_BY_COUNT[input.sessionCount] ?? [0, 1, 2, 3, 4, 5, 6];
  const remaining = [...input.candidates];
  const selected: typeof input.candidates = [];

  for (const anchor of anchors) {
    if (selected.length >= input.sessionCount || remaining.length === 0) break;
    remaining.sort((left, right) => {
      const anchorDistance = Math.abs(left.dayOffset - anchor) - Math.abs(right.dayOffset - anchor);
      if (anchorDistance !== 0) return anchorDistance;
      const sessionBias = Number(right.hasSession) - Number(left.hasSession);
      if (sessionBias !== 0) return sessionBias;
      const availabilityBias = right.availabilityMinutes - left.availabilityMinutes;
      if (availabilityBias !== 0) return availabilityBias;
      return left.date.localeCompare(right.date);
    });
    const [next] = remaining.splice(0, 1);
    if (next) selected.push(next);
  }

  return selected.sort((left, right) => left.date.localeCompare(right.date));
}

function focusForSelectedIndex(
  index: number,
  selectedCount: number,
  phase: string | null | undefined,
): DailyRecommendedLoadPrimaryFocus {
  const normalizedPhase = phase?.toLowerCase() ?? "";
  if (normalizedPhase.includes("recovery")) return index === 0 ? "recovery" : "mobility";
  if (normalizedPhase.includes("taper")) return index === selectedCount - 1 ? "tempo" : "recovery";
  if (selectedCount === 1) return "endurance";
  if (index === selectedCount - 1) return "long_endurance";
  if (selectedCount >= 3 && index === Math.floor(selectedCount / 2)) return "threshold";
  return index === 0 ? "endurance" : "recovery";
}

function weightForFocus(focus: DailyRecommendedLoadPrimaryFocus): number {
  switch (focus) {
    case "long_endurance":
      return 1.55;
    case "threshold":
    case "tempo":
      return 1.25;
    case "endurance":
      return 1;
    case "recovery":
    case "mobility":
      return 0.6;
    default:
      return 0.85;
  }
}

function primaryActivityCategory(
  weeklyAllocation: WeeklyAllocation | null | undefined,
): DailyRecommendedLoadActivityCategory {
  const categories = Object.entries(weeklyAllocation?.activity_categories ?? {}).sort(
    ([, left], [, right]) => (right.sessions?.target ?? 0) - (left.sessions?.target ?? 0),
  );
  const category = categories[0]?.[0];
  if (category === "bike" || category === "swim" || category === "strength") return category;
  if (category === "run") return "run";
  return "run";
}

function allocateWithCap(total: number, weights: number[], capShare: number) {
  if (total <= 0 || weights.length === 0) return weights.map(() => 0);
  const capped = weights.map(() => false);
  const allocation = weights.map(() => 0);
  let remainingTotal = total;

  for (let iteration = 0; iteration < weights.length; iteration += 1) {
    const activeWeightTotal = weights.reduce(
      (sum, weight, index) => sum + (capped[index] ? 0 : Math.max(0, weight)),
      0,
    );
    if (activeWeightTotal <= 0) break;
    let changed = false;
    for (let index = 0; index < weights.length; index += 1) {
      if (capped[index]) continue;
      const proposed = (remainingTotal * Math.max(0, weights[index] ?? 0)) / activeWeightTotal;
      const cap = total * capShare;
      if (proposed > cap && weights.length > 1) {
        allocation[index] = cap;
        capped[index] = true;
        remainingTotal -= cap;
        changed = true;
      }
    }
    if (!changed) break;
  }

  const activeWeightTotal = weights.reduce(
    (sum, weight, index) => sum + (capped[index] ? 0 : Math.max(0, weight)),
    0,
  );
  for (let index = 0; index < weights.length; index += 1) {
    if (capped[index]) continue;
    allocation[index] =
      activeWeightTotal > 0
        ? (remainingTotal * Math.max(0, weights[index] ?? 0)) / activeWeightTotal
        : 0;
  }

  const rounded = allocation.map(round1);
  const delta = round1(total - rounded.reduce((sum, value) => sum + value, 0));
  if (rounded.length > 0 && delta !== 0)
    rounded[rounded.length - 1] = round1((rounded.at(-1) ?? 0) + delta);
  return rounded;
}

/**
 * Builds daily recommended load points from weekly projection targets and
 * profile-derived planning constraints.
 *
 * The returned load values are daily TSS values suitable for day-level charts;
 * weekly projection summaries should not be rendered as daily bars.
 */
export function buildDailyLoadDistribution(
  input: BuildDailyLoadDistributionInput,
): DailyLoadDistributionPoint[] {
  const dayCount = diffDateOnlyUtcDays(input.startDate, input.endDate) + 1;
  if (dayCount <= 0) return [];

  const availableMinutesByDay = resolveAvailableMinutesByDay(input.preferenceProfile);
  const hasAvailabilityWindows = availableMinutesByDay.size > 0;
  const hardRestDays = new Set(input.preferenceProfile?.availability.hard_rest_days ?? []);
  const sessionDates = buildPlannedSessionDateSet(input);
  const targetByWeekStart = new Map(
    input.weeklyTargets.map((target) => [target.weekStartDate, target]),
  );
  const category = primaryActivityCategory(input.weeklyAllocation);
  const points: DailyLoadDistributionPoint[] = [];

  for (let offset = 0; offset < dayCount; offset += 7) {
    const weekStartDate = addDaysDateOnlyUtc(input.startDate, offset);
    const weekEndDate = addDaysDateOnlyUtc(input.startDate, Math.min(offset + 6, dayCount - 1));
    const daysInWeek = diffDateOnlyUtcDays(weekStartDate, weekEndDate) + 1;
    const target = targetByWeekStart.get(weekStartDate);
    const weeklyTss = Math.max(0, target?.targetTss ?? 0) * (daysInWeek / 7);
    const hasWeeklyTarget = target !== undefined;
    const isPartialWeek = daysInWeek < 7;
    const candidates = Array.from({ length: daysInWeek }, (_, dayOffset) => {
      const date = addDaysDateOnlyUtc(weekStartDate, dayOffset);
      const day = weekdayNameForDate(date);
      const availabilityMinutes =
        availableMinutesByDay.get(day) ?? (hasAvailabilityWindows ? 0 : 60);
      const available = !hardRestDays.has(day) && availabilityMinutes > 0;
      return available
        ? [{ date, dayOffset, availabilityMinutes, hasSession: sessionDates.has(date) }]
        : [];
    }).flat();
    const trainingDates = chooseTrainingDates({
      candidates:
        candidates.length > 0
          ? candidates
          : Array.from({ length: daysInWeek }, (_, dayOffset) => ({
              date: addDaysDateOnlyUtc(weekStartDate, dayOffset),
              dayOffset,
              availabilityMinutes: 60,
              hasSession: false,
            })),
      sessionCount: resolveSessionCount(input, candidates.length || daysInWeek),
    });
    const selectedByDate = new Map(trainingDates.map((date, index) => [date.date, index] as const));
    const focuses = trainingDates.map((_, index) =>
      focusForSelectedIndex(index, trainingDates.length, target?.phase),
    );
    const allocations = allocateWithCap(
      weeklyTss,
      focuses.map(weightForFocus),
      trainingDates.length >= 3 ? 0.45 : 0.6,
    );

    for (let dayOffset = 0; dayOffset < daysInWeek; dayOffset += 1) {
      const date = addDaysDateOnlyUtc(weekStartDate, dayOffset);
      const selectedIndex = selectedByDate.get(date);
      const focus = selectedIndex === undefined ? "rest" : (focuses[selectedIndex] ?? "recovery");
      const selectedHasPlannedSession = sessionDates.has(date) && selectedIndex !== undefined;
      const confidenceScore = confidenceScoreForWeek({
        hasWeeklyTarget,
        weeklyTss,
        isPartialWeek,
        hasPreferenceProfile:
          input.preferenceProfile !== null && input.preferenceProfile !== undefined,
        hasAvailabilityWindows,
        hasPlannedSessions: sessionDates.size > 0,
        hasWeeklyAllocation:
          input.weeklyAllocation !== null && input.weeklyAllocation !== undefined,
        selectedHasPlannedSession,
        isRestDay: selectedIndex === undefined,
      });
      points.push({
        date,
        recommended_load_tss: selectedIndex === undefined ? 0 : (allocations[selectedIndex] ?? 0),
        primary_focus: focus,
        activity_category: focus === "rest" ? "other" : category,
        confidence: confidenceBucketForScore(confidenceScore),
        confidence_score: confidenceScore,
        reason_codes: reasonCodesForPoint({
          hasWeeklyTarget,
          weeklyTss,
          isPartialWeek,
          hasPreferenceProfile:
            input.preferenceProfile !== null && input.preferenceProfile !== undefined,
          hasAvailabilityWindows,
          hasHardRestDays: hardRestDays.size > 0,
          hasPlannedSessions: sessionDates.size > 0,
          selectedHasPlannedSession,
          hasWeeklyAllocation:
            input.weeklyAllocation !== null && input.weeklyAllocation !== undefined,
          isRestDay: selectedIndex === undefined,
        }),
      });
    }
  }

  return points;
}
