import type { AthletePreferenceProfile } from "../schemas/settings/profile_settings";
import { addDaysDateOnlyUtc, diffDateOnlyUtcDays, parseDateOnlyUtc } from "./dateOnlyUtc";
import type { WeeklyAllocation } from "./weeklyAllocation";

export type DailyLoadRecommendationActivityCategory =
  | "run"
  | "bike"
  | "swim"
  | "strength"
  | "other";

export type DailyLoadRecommendationPrimaryFocus =
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

export type DailyLoadRecommendationWeekday =
  | number
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export interface DailyLoadRecommendationWeeklyTarget {
  weekIndex?: number;
  weekStartDate?: string;
  startDate?: string;
  endDate?: string;
  targetTss?: number | null;
  targetDurationMinutes?: number | null;
  targetFatigueCost?: number | null;
  targetStrengthSets?: number | null;
  phase?: string | null;
}

export interface DailyLoadRecommendationSession {
  date?: string | null;
  offsetDays?: number | null;
  estimatedTss?: number | null;
  estimatedDurationMinutes?: number | null;
  estimatedFatigueCost?: number | null;
  estimatedStrengthSets?: number | null;
  activityCategory?: DailyLoadRecommendationActivityCategory | null;
  primaryFocus?: DailyLoadRecommendationPrimaryFocus | null;
  intentType?: string | null;
}

export interface DailyLoadRecommendationActualOrScheduledPoint {
  date: string;
  tss?: number | null;
}

export interface DailyLoadRecommendationPoint {
  date: string;
  recommendedLoadTss: number;
  recommendedDurationMinutes: number;
  recommendedFatigueCost: number;
  recommendedStrengthSets: number;
  primaryFocus: DailyLoadRecommendationPrimaryFocus;
  activityCategory: DailyLoadRecommendationActivityCategory;
  scheduledLoadTss: number;
  completedLoadTss: number;
  loadDeltaTss: number;
  confidence: "low" | "medium" | "high";
  reasonCodes: string[];
}

export interface BuildDailyRecommendedLoadRecommendationInput {
  mode: "recommended-load";
  startDate: string;
  endDate: string;
  weeklyTargets: DailyLoadRecommendationWeeklyTarget[];
  sessions?: DailyLoadRecommendationSession[];
  preferredWeekdays?: DailyLoadRecommendationWeekday[] | null;
  hardRestDays?: DailyLoadRecommendationWeekday[] | null;
  scheduledLoads?: DailyLoadRecommendationActualOrScheduledPoint[] | null;
  completedLoads?: DailyLoadRecommendationActualOrScheduledPoint[] | null;
}

export interface BuildDailyLoadDistributionRecommendationInput {
  mode: "distribution";
  startDate: string;
  endDate: string;
  weeklyTargets: DailyLoadRecommendationWeeklyTarget[];
  preferenceProfile?: AthletePreferenceProfile | null;
  weeklyAllocation?: WeeklyAllocation | null;
  plannedSessions?: DailyLoadRecommendationSession[] | null;
}

export type BuildDailyLoadRecommendationInput =
  | BuildDailyRecommendedLoadRecommendationInput
  | BuildDailyLoadDistributionRecommendationInput;

const MONDAY_WEEKDAY_TO_INDEX: Record<Exclude<DailyLoadRecommendationWeekday, number>, number> = {
  monday: 0,
  tuesday: 1,
  wednesday: 2,
  thursday: 3,
  friday: 4,
  saturday: 5,
  sunday: 6,
};

const UTC_WEEKDAY_NAMES = [
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

function toFinitePositive(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function normalizeMondayWeekday(value: DailyLoadRecommendationWeekday): number | null {
  if (typeof value === "number") {
    return Number.isInteger(value) && value >= 0 && value <= 6 ? value : null;
  }
  return MONDAY_WEEKDAY_TO_INDEX[value] ?? null;
}

function normalizeMondayWeekdaySet(
  values: DailyLoadRecommendationWeekday[] | null | undefined,
): Set<number> {
  const result = new Set<number>();
  for (const value of values ?? []) {
    const normalized = normalizeMondayWeekday(value);
    if (normalized !== null) result.add(normalized);
  }
  return result;
}

function weekdayNameForDate(date: string): (typeof UTC_WEEKDAY_NAMES)[number] {
  return UTC_WEEKDAY_NAMES[parseDateOnlyUtc(date).getUTCDay()] ?? "monday";
}

function dateForSession(input: { session: DailyLoadRecommendationSession; startDate: string }) {
  if (input.session.date) return input.session.date;
  if (typeof input.session.offsetDays === "number" && Number.isFinite(input.session.offsetDays)) {
    return addDaysDateOnlyUtc(input.startDate, input.session.offsetDays);
  }
  return null;
}

function focusFromSession(
  session: DailyLoadRecommendationSession,
): DailyLoadRecommendationPrimaryFocus {
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
): DailyLoadRecommendationPrimaryFocus {
  if (activeWeekdays.length === 0) return "rest";
  if (weekday === activeWeekdays[activeWeekdays.length - 1]) return "long_endurance";
  if (activeWeekdays.length >= 3 && weekday === activeWeekdays[1]) return "threshold";
  if (weekday === activeWeekdays[0]) return "endurance";
  return "recovery";
}

function recommendedWeightForFocus(focus: DailyLoadRecommendationPrimaryFocus): number {
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

function distributionWeightForFocus(focus: DailyLoadRecommendationPrimaryFocus): number {
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

function buildLoadMap(points: DailyLoadRecommendationActualOrScheduledPoint[] | null | undefined) {
  const map = new Map<string, number>();
  for (const point of points ?? []) {
    map.set(point.date, round1((map.get(point.date) ?? 0) + toFinitePositive(point.tss)));
  }
  return map;
}

function findWeeklyTarget(input: {
  targetByWeekIndex: Map<number, DailyLoadRecommendationWeeklyTarget>;
  targetByStartDate: Map<string, DailyLoadRecommendationWeeklyTarget>;
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

function buildPlannedSessionDateSet(input: BuildDailyLoadDistributionRecommendationInput) {
  const dates = new Set<string>();
  for (const session of input.plannedSessions ?? []) {
    const date = dateForSession({ session, startDate: input.startDate });
    if (date && date >= input.startDate && date <= input.endDate) dates.add(date);
  }
  return dates;
}

function resolveSessionCount(
  input: BuildDailyLoadDistributionRecommendationInput,
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
): DailyLoadRecommendationPrimaryFocus {
  const normalizedPhase = phase?.toLowerCase() ?? "";
  if (normalizedPhase.includes("recovery")) return index === 0 ? "recovery" : "mobility";
  if (normalizedPhase.includes("taper")) return index === selectedCount - 1 ? "tempo" : "recovery";
  if (selectedCount === 1) return "endurance";
  if (index === selectedCount - 1) return "long_endurance";
  if (selectedCount >= 3 && index === Math.floor(selectedCount / 2)) return "threshold";
  return index === 0 ? "endurance" : "recovery";
}

function primaryActivityCategory(
  weeklyAllocation: WeeklyAllocation | null | undefined,
): DailyLoadRecommendationActivityCategory {
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

function buildRecommendedLoadPoints(
  input: BuildDailyRecommendedLoadRecommendationInput,
): DailyLoadRecommendationPoint[] {
  const dayCount = diffDateOnlyUtcDays(input.startDate, input.endDate) + 1;
  if (dayCount <= 0) return [];

  const preferredWeekdays = normalizeMondayWeekdaySet(input.preferredWeekdays);
  const hardRestDays = normalizeMondayWeekdaySet(input.hardRestDays);
  const scheduledByDate = buildLoadMap(input.scheduledLoads);
  const completedByDate = buildLoadMap(input.completedLoads);
  const sessionsByDate = new Map<string, DailyLoadRecommendationSession[]>();
  for (const session of input.sessions ?? []) {
    const date = dateForSession({ session, startDate: input.startDate });
    if (!date || date < input.startDate || date > input.endDate) continue;
    const sessions = sessionsByDate.get(date) ?? [];
    sessions.push(session);
    sessionsByDate.set(date, sessions);
  }

  const targetByWeekIndex = new Map<number, DailyLoadRecommendationWeeklyTarget>();
  const targetByStartDate = new Map<string, DailyLoadRecommendationWeeklyTarget>();
  for (const target of input.weeklyTargets) {
    if (typeof target.weekIndex === "number") targetByWeekIndex.set(target.weekIndex, target);
    const weekStartDate = target.weekStartDate ?? target.startDate;
    if (weekStartDate) targetByStartDate.set(weekStartDate, target);
  }

  const results: DailyLoadRecommendationPoint[] = [];
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
      const sessionFocuses = sessions
        .map(focusFromSession)
        .sort((left, right) => recommendedWeightForFocus(right) - recommendedWeightForFocus(left));
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
      const weight = focus === "rest" ? 0 : recommendedWeightForFocus(focus) * sessionWeightBoost;
      const activityCategory =
        sessions.find((session) => session.activityCategory)?.activityCategory ??
        (focus.includes("strength") || ["hypertrophy", "max_strength", "power"].includes(focus)
          ? "strength"
          : "run");
      return { date, focus, activityCategory, weight };
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
        confidence: input.sessions?.length ? "high" : preferredWeekdays.size ? "medium" : "low",
        reasonCodes: [
          "daily_recommended_load_v1",
          row.focus === "rest" ? "rest_day_allocation" : "weekly_target_daily_distribution",
        ],
      });
    });
  }

  return results;
}

function buildDistributionPoints(
  input: BuildDailyLoadDistributionRecommendationInput,
): DailyLoadRecommendationPoint[] {
  const dayCount = diffDateOnlyUtcDays(input.startDate, input.endDate) + 1;
  if (dayCount <= 0) return [];

  const availableMinutesByDay = resolveAvailableMinutesByDay(input.preferenceProfile);
  const hasAvailabilityWindows = availableMinutesByDay.size > 0;
  const hardRestDays = new Set(input.preferenceProfile?.availability.hard_rest_days ?? []);
  const sessionDates = buildPlannedSessionDateSet(input);
  const targetByWeekStart = new Map(
    input.weeklyTargets.map((target) => [target.weekStartDate ?? target.startDate, target]),
  );
  const category = primaryActivityCategory(input.weeklyAllocation);
  const points: DailyLoadRecommendationPoint[] = [];

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
      focuses.map(distributionWeightForFocus),
      trainingDates.length >= 3 ? 0.45 : 0.6,
    );

    for (let dayOffset = 0; dayOffset < daysInWeek; dayOffset += 1) {
      const date = addDaysDateOnlyUtc(weekStartDate, dayOffset);
      const selectedIndex = selectedByDate.get(date);
      const focus = selectedIndex === undefined ? "rest" : (focuses[selectedIndex] ?? "recovery");
      const recommendedLoadTss =
        selectedIndex === undefined ? 0 : (allocations[selectedIndex] ?? 0);
      points.push({
        date,
        recommendedLoadTss,
        recommendedDurationMinutes: 0,
        recommendedFatigueCost: 0,
        recommendedStrengthSets: 0,
        primaryFocus: focus,
        activityCategory: focus === "rest" ? "other" : category,
        scheduledLoadTss: 0,
        completedLoadTss: 0,
        loadDeltaTss: round1(0 - recommendedLoadTss),
        confidence: input.preferenceProfile ? "high" : "medium",
        reasonCodes: [
          "daily_load_distribution_v1",
          selectedIndex === undefined ? "rest_day_allocation" : "profile_goal_weekly_distribution",
        ],
      });
    }
  }

  return points;
}

/**
 * Canonical daily load recommendation engine.
 *
 * Internally returns camelCase recommendation points with load, duration,
 * fatigue, strength, focus, category, scheduled/completed/delta, confidence,
 * and reason fields. Public wrappers adapt this shape for legacy callers.
 */
export function buildDailyLoadRecommendation(
  input: BuildDailyLoadRecommendationInput,
): DailyLoadRecommendationPoint[] {
  return input.mode === "recommended-load"
    ? buildRecommendedLoadPoints(input)
    : buildDistributionPoints(input);
}
