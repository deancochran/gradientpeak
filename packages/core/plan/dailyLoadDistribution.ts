import type { AthletePreferenceProfile } from "../schemas/settings/profile_settings";
import { type DailyFocusRecoveryRange, resolveDailyFocusTemplate } from "./dailyFocusTemplates";
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
  eventDate?: string | null;
  recoveryRanges?: DailyFocusRecoveryRange[] | null;
}

export interface DailyLoadDistributionPoint {
  date: string;
  recommended_load_tss: number;
  primary_focus: DailyRecommendedLoadPrimaryFocus;
  activity_category: DailyRecommendedLoadActivityCategory;
  confidence: "low" | "medium" | "high";
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

function ensureRequiredTrainingDate(
  selected: ReturnType<typeof chooseTrainingDates>,
  candidates: Parameters<typeof chooseTrainingDates>[0]["candidates"],
  requiredDate: string | null | undefined,
) {
  if (!requiredDate || selected.some((day) => day.date === requiredDate)) {
    return selected;
  }

  const requiredCandidate = candidates.find((day) => day.date === requiredDate);
  if (!requiredCandidate) return selected;
  if (selected.length === 0) return [requiredCandidate];

  const replacementIndex = selected.reduce((worstIndex, day, index) => {
    const worst = selected[worstIndex];
    if (!worst) return index;
    if (day.hasSession !== worst.hasSession) return day.hasSession ? worstIndex : index;
    if (day.availabilityMinutes !== worst.availabilityMinutes) {
      return day.availabilityMinutes < worst.availabilityMinutes ? index : worstIndex;
    }
    const distance = Math.abs(day.dayOffset - requiredCandidate.dayOffset);
    const worstDistance = Math.abs(worst.dayOffset - requiredCandidate.dayOffset);
    return distance > worstDistance ? index : worstIndex;
  }, 0);

  const next = [...selected];
  next[replacementIndex] = requiredCandidate;
  return next.sort((left, right) => left.date.localeCompare(right.date));
}

function weightForFocus(focus: DailyRecommendedLoadPrimaryFocus): number {
  switch (focus) {
    case "long_endurance":
      return 1.55;
    case "threshold":
    case "tempo":
    case "race_specific":
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
    const availableCandidates =
      candidates.length > 0
        ? candidates
        : Array.from({ length: daysInWeek }, (_, dayOffset) => ({
            date: addDaysDateOnlyUtc(weekStartDate, dayOffset),
            dayOffset,
            availabilityMinutes: 60,
            hasSession: false,
          }));
    const eventDateInWeek =
      target?.eventDate && target.eventDate >= weekStartDate && target.eventDate <= weekEndDate
        ? target.eventDate
        : null;
    const trainingDates = ensureRequiredTrainingDate(
      chooseTrainingDates({
        candidates: availableCandidates,
        sessionCount: resolveSessionCount(input, candidates.length || daysInWeek),
      }),
      availableCandidates,
      eventDateInWeek,
    );
    const selectedByDate = new Map(trainingDates.map((date, index) => [date.date, index] as const));
    const focuses = resolveDailyFocusTemplate({
      phase: target?.phase,
      selectedDays: trainingDates,
      eventDate: eventDateInWeek,
      recoveryRanges: target?.recoveryRanges,
    });
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
        confidence: input.preferenceProfile ? "high" : "medium",
        reason_codes: [
          "daily_load_distribution_v1",
          selectedIndex === undefined ? "rest_day_allocation" : "profile_goal_weekly_distribution",
        ],
      });
    }
  }

  return points;
}
