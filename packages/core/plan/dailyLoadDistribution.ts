import type { AthletePreferenceProfile } from "../schemas/settings/profile_settings";
import type {
  DailyRecommendedLoadActivityCategory,
  DailyRecommendedLoadPrimaryFocus,
  DailyRecommendedLoadSession,
  DailyRecommendedLoadWeekday,
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
  reason_codes: string[];
}

export type DailyLoadDistributionWeekday = DailyRecommendedLoadWeekday;

export interface DailyLoadDistributionAvailabilityWindow {
  start_minute_of_day: number;
  end_minute_of_day: number;
}

export interface DailyLoadDistributionAvailabilityDay {
  /** Weekday name, or number where 0 = Monday and 6 = Sunday. */
  day: DailyLoadDistributionWeekday;
  windows?: DailyLoadDistributionAvailabilityWindow[] | null;
  availableMinutes?: number | null;
  maxSessions?: number | null;
}

export interface DailyLoadDistributionSchedulingConstraints {
  /** Preferred training weekdays. Numeric values use the builder convention: 0 = Monday, 6 = Sunday. */
  preferredWeekdays?: DailyLoadDistributionWeekday[] | null;
  hardRestDays?: DailyLoadDistributionWeekday[] | null;
  minSessionsPerWeek?: number | null;
  maxSessionsPerWeek?: number | null;
  availabilityDays?: DailyLoadDistributionAvailabilityDay[] | null;
}

export interface BuildDailyLoadDistributionInput {
  startDate: string;
  endDate: string;
  weeklyTargets: DailyLoadDistributionWeeklyTarget[];
  preferenceProfile?: AthletePreferenceProfile | null;
  weeklyAllocation?: WeeklyAllocation | null;
  plannedSessions?: DailyRecommendedLoadSession[] | null;
  schedulingConstraints?: DailyLoadDistributionSchedulingConstraints | null;
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

const WEEKDAY_NAMES_MONDAY_FIRST = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

const DEFAULT_WEEKLY_SESSION_COUNT = 3;

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

function weekdayNameForDate(date: string): (typeof WEEKDAY_NAMES)[number] {
  return WEEKDAY_NAMES[parseDateOnlyUtc(date).getUTCDay()] ?? "monday";
}

function normalizeWeekdayName(
  value: DailyLoadDistributionWeekday,
): (typeof WEEKDAY_NAMES_MONDAY_FIRST)[number] | null {
  if (typeof value === "number") {
    return Number.isInteger(value) && value >= 0 && value <= 6
      ? (WEEKDAY_NAMES_MONDAY_FIRST[value] ?? null)
      : null;
  }

  return WEEKDAY_NAMES_MONDAY_FIRST.includes(value) ? value : null;
}

function normalizeWeekdaySet(
  values: DailyLoadDistributionWeekday[] | null | undefined,
): Set<string> {
  const result = new Set<string>();
  for (const value of values ?? []) {
    const day = normalizeWeekdayName(value);
    if (day) result.add(day);
  }
  return result;
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

function sumAvailabilityMinutes(
  windows: DailyLoadDistributionAvailabilityWindow[] | null | undefined,
) {
  return (windows ?? []).reduce(
    (sum, window) => sum + Math.max(0, window.end_minute_of_day - window.start_minute_of_day),
    0,
  );
}

function resolveAvailableMinutesByDay(input: BuildDailyLoadDistributionInput) {
  const map = new Map<string, number>();

  if (input.schedulingConstraints?.availabilityDays !== undefined) {
    for (const day of input.schedulingConstraints.availabilityDays ?? []) {
      const dayName = normalizeWeekdayName(day.day);
      if (!dayName) continue;
      map.set(
        dayName,
        typeof day.availableMinutes === "number" && Number.isFinite(day.availableMinutes)
          ? Math.max(0, day.availableMinutes)
          : sumAvailabilityMinutes(day.windows),
      );
    }
    return map;
  }

  for (const day of input.preferenceProfile?.availability.weekly_windows ?? []) {
    map.set(day.day, sumAvailabilityMinutes(day.windows));
  }
  return map;
}

function resolveHardRestDays(input: BuildDailyLoadDistributionInput) {
  if (input.schedulingConstraints?.hardRestDays !== undefined) {
    return normalizeWeekdaySet(input.schedulingConstraints.hardRestDays);
  }
  return new Set(input.preferenceProfile?.availability.hard_rest_days ?? []);
}

function resolvePreferredWeekdays(input: BuildDailyLoadDistributionInput) {
  return normalizeWeekdaySet(input.schedulingConstraints?.preferredWeekdays);
}

function resolveSessionCount(
  input: BuildDailyLoadDistributionInput,
  candidateCount: number,
  plannedCount: number,
): number {
  const minSessions =
    input.schedulingConstraints?.minSessionsPerWeek ??
    input.preferenceProfile?.dose_limits.min_sessions_per_week;
  const maxSessions =
    input.schedulingConstraints?.maxSessionsPerWeek ??
    input.preferenceProfile?.dose_limits.max_sessions_per_week;
  const boundedMin = typeof minSessions === "number" ? clamp(minSessions, 1, 7) : null;
  const boundedMax = typeof maxSessions === "number" ? clamp(maxSessions, 1, 7) : null;
  const derived =
    boundedMin !== null && boundedMax !== null
      ? Math.round((boundedMin + boundedMax) / 2)
      : (boundedMax ?? boundedMin ?? DEFAULT_WEEKLY_SESSION_COUNT);
  return clamp(Math.max(derived, plannedCount), 1, Math.max(1, candidateCount));
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
  const selected: typeof input.candidates = input.candidates
    .filter((candidate) => candidate.hasSession)
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(0, input.sessionCount);
  const selectedDates = new Set(selected.map((candidate) => candidate.date));
  const remaining = input.candidates.filter((candidate) => !selectedDates.has(candidate.date));

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
 * profile-derived and explicit scheduling constraints.
 *
 * The returned load values are daily TSS values suitable for day-level charts;
 * weekly projection summaries should not be rendered as daily bars.
 */
export function buildDailyLoadDistribution(
  input: BuildDailyLoadDistributionInput,
): DailyLoadDistributionPoint[] {
  const dayCount = diffDateOnlyUtcDays(input.startDate, input.endDate) + 1;
  if (dayCount <= 0) return [];

  const availableMinutesByDay = resolveAvailableMinutesByDay(input);
  const hasAvailabilityWindows = availableMinutesByDay.size > 0;
  const hardRestDays = resolveHardRestDays(input);
  const preferredWeekdays = resolvePreferredWeekdays(input);
  const sessionDates = buildPlannedSessionDateSet(input);
  const hasExplicitSchedulingConstraints = Boolean(input.schedulingConstraints);
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
    const candidates = Array.from({ length: daysInWeek }, (_, dayOffset) => {
      const date = addDaysDateOnlyUtc(weekStartDate, dayOffset);
      const day = weekdayNameForDate(date);
      const availabilityMinutes =
        availableMinutesByDay.get(day) ?? (hasAvailabilityWindows ? 0 : 60);
      const hasSession = sessionDates.has(date);
      const preferred = preferredWeekdays.size === 0 || preferredWeekdays.has(day) || hasSession;
      const available =
        preferred && (!hardRestDays.has(day) || hasSession) && availabilityMinutes > 0;
      return available ? [{ date, dayOffset, availabilityMinutes, hasSession }] : [];
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
      sessionCount: resolveSessionCount(
        input,
        candidates.length || daysInWeek,
        candidates.filter((candidate) => candidate.hasSession).length,
      ),
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
      points.push({
        date,
        recommended_load_tss: selectedIndex === undefined ? 0 : (allocations[selectedIndex] ?? 0),
        primary_focus: focus,
        activity_category: focus === "rest" ? "other" : category,
        confidence: hasExplicitSchedulingConstraints || input.preferenceProfile ? "high" : "medium",
        reason_codes: [
          "daily_load_distribution_v1",
          ...(hasExplicitSchedulingConstraints ? ["explicit_scheduling_constraints_applied"] : []),
          ...(sessionDates.has(date) ? ["planned_session_date_applied"] : []),
          selectedIndex === undefined ? "rest_day_allocation" : "profile_goal_weekly_distribution",
        ],
      });
    }
  }

  return points;
}
