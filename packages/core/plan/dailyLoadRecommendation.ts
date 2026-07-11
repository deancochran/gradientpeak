import type { AthletePreferenceProfile } from "../schemas/settings/profile_settings";
import { type DailyFocusRecoveryRange, resolveDailyFocusTemplate } from "./dailyFocusTemplates";
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

export interface DailyLoadRecommendationAvailabilityWindow {
  start_minute_of_day: number;
  end_minute_of_day: number;
}

export interface DailyLoadRecommendationAvailabilityDay {
  /** Weekday name, or number where 0 = Monday and 6 = Sunday. */
  day: DailyLoadRecommendationWeekday;
  windows?: DailyLoadRecommendationAvailabilityWindow[] | null;
  availableMinutes?: number | null;
  maxSessions?: number | null;
}

export interface DailyLoadRecommendationSchedulingConstraints {
  /** Preferred training weekdays. Numeric values use the builder convention: 0 = Monday, 6 = Sunday. */
  preferredWeekdays?: DailyLoadRecommendationWeekday[] | null;
  hardRestDays?: DailyLoadRecommendationWeekday[] | null;
  minSessionsPerWeek?: number | null;
  maxSessionsPerWeek?: number | null;
  availabilityDays?: DailyLoadRecommendationAvailabilityDay[] | null;
}

export interface DailyLoadRecommendationCapacityContext {
  startingCtl?: number | null;
  startingAtl?: number | null;
  startingTsb?: number | null;
  readinessScore?: number | null;
}

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
  eventDate?: string | null;
  recoveryRanges?: DailyFocusRecoveryRange[] | null;
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

export type DailyLoadRecommendationDisposition =
  | "recommended"
  | "maintenance"
  | "clarification_required"
  | "abstain";

export interface DailyLoadRecommendationActionableValues {
  recommendedLoadTss: number;
  recommendedDurationMinutes: number;
  recommendedFatigueCost: number;
  recommendedStrengthSets: number;
}

export interface DailyLoadRecommendationPoint {
  date: string;
  recommendationState: "recommendation" | "maintenance_only" | "clarification_required" | "abstain";
  recommendationDisposition: DailyLoadRecommendationDisposition;
  actionableRecommendation: DailyLoadRecommendationActionableValues | null;
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
  confidence_score?: number;
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
  schedulingConstraints?: DailyLoadRecommendationSchedulingConstraints | null;
  capacityContext?: DailyLoadRecommendationCapacityContext | null;
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

const MONDAY_WEEKDAY_NAMES = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

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
const TSS_EPSILON = 0.000001;

type DailyLoadConfidenceBucket = DailyLoadRecommendationPoint["confidence"];

const ACTIVITY_CATEGORY_ORDER: DailyLoadRecommendationActivityCategory[] = [
  "run",
  "bike",
  "swim",
  "strength",
  "other",
];

type WeeklyAllocationCategory = NonNullable<
  WeeklyAllocation["activity_categories"][keyof WeeklyAllocation["activity_categories"]]
>;

interface PlannedSessionAssignment {
  activityCategory?: DailyLoadRecommendationActivityCategory;
  primaryFocus?: DailyLoadRecommendationPrimaryFocus;
  estimatedTss?: number;
  estimatedDurationMinutes?: number;
}

interface CategoryBudget {
  activityCategory: DailyLoadRecommendationActivityCategory;
  targetSessions: number;
  targetDurationMinutes: number;
  role: WeeklyAllocationCategory["role"] | "fallback";
  keyExposureTypes: string[];
  loadMultiplier: number;
}

const FALLBACK_CATEGORY_BUDGET: CategoryBudget = {
  activityCategory: "other",
  targetSessions: DEFAULT_WEEKLY_SESSION_COUNT,
  targetDurationMinutes: 180,
  role: "fallback",
  keyExposureTypes: [],
  loadMultiplier: 1,
};

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

function confidenceBucketForScore(score: number): DailyLoadConfidenceBucket {
  if (score >= 80) return "high";
  if (score >= 50) return "medium";
  return "low";
}

function orderedReasonCodes(reasons: string[]): string[] {
  return [...new Set(reasons)];
}

function confidenceScoreForRecommendedDay(input: {
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

function reasonCodesForRecommendedDay(input: {
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

function confidenceScoreForDistributionPoint(input: {
  hasWeeklyTarget: boolean;
  weeklyTss: number;
  isPartialWeek: boolean;
  hasPreferenceProfile: boolean;
  hasAvailabilityWindows: boolean;
  hasPlannedSessions: boolean;
  hasWeeklyAllocation: boolean;
  selectedHasPlannedSession: boolean;
  hasExplicitSchedulingConstraints: boolean;
  isRestDay: boolean;
}): number {
  let score = 20;
  if (input.hasWeeklyTarget) score += 25;
  if (input.weeklyTss > 0) score += 10;
  if (input.hasPreferenceProfile) score += 20;
  if (input.hasExplicitSchedulingConstraints) score += 15;
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

function normalizeWeekdayName(
  value: DailyLoadRecommendationWeekday,
): (typeof MONDAY_WEEKDAY_NAMES)[number] | null {
  if (typeof value === "number") {
    return Number.isInteger(value) && value >= 0 && value <= 6
      ? (MONDAY_WEEKDAY_NAMES[value] ?? null)
      : null;
  }
  return MONDAY_WEEKDAY_TO_INDEX[value] !== undefined ? value : null;
}

function normalizeWeekdayNameSet(
  values: DailyLoadRecommendationWeekday[] | null | undefined,
): Set<string> {
  const result = new Set<string>();
  for (const value of values ?? []) {
    const normalized = normalizeWeekdayName(value);
    if (normalized) result.add(normalized);
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

function normalizeActivityCategory(
  category: string | null | undefined,
): DailyLoadRecommendationActivityCategory | null {
  if (
    category === "run" ||
    category === "bike" ||
    category === "swim" ||
    category === "strength" ||
    category === "other"
  ) {
    return category;
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

function tssPerMinuteForFocus(focus: DailyLoadRecommendationPrimaryFocus): number {
  switch (focus) {
    case "threshold":
    case "tempo":
      return 1.35;
    case "long_endurance":
      return 1.1;
    case "endurance":
      return 1;
    case "recovery":
    case "mobility":
      return 0.7;
    default:
      return 0.85;
  }
}

function finitePositive(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function resolveCapacityMultiplier(
  context: DailyLoadRecommendationCapacityContext | null | undefined,
) {
  const readiness = finitePositive(context?.readinessScore);
  const tsb =
    typeof context?.startingTsb === "number" && Number.isFinite(context.startingTsb)
      ? context.startingTsb
      : null;
  let multiplier = 1;

  if (readiness !== null) {
    if (readiness < 35) multiplier *= 0.65;
    else if (readiness < 55) multiplier *= 0.8;
    else if (readiness > 80) multiplier *= 1.1;
  }

  if (tsb !== null) {
    if (tsb < -25) multiplier *= 0.75;
    else if (tsb < -10) multiplier *= 0.9;
  }

  return clamp(multiplier, 0.5, 1.15);
}

function resolveAthleteCapacityCap(
  context: DailyLoadRecommendationCapacityContext | null | undefined,
): number | null {
  const ctl = finitePositive(context?.startingCtl);
  if (ctl === null) return null;
  const lowFitnessCap = ctl < 35 ? ctl * 1.25 + 10 : ctl * 1.6 + 15;
  return Math.max(20, lowFitnessCap * resolveCapacityMultiplier(context));
}

function floor1(value: number): number {
  return Math.floor((value + TSS_EPSILON) * 10) / 10;
}

function allocateWithCaps(total: number, weights: number[], caps: number[]) {
  if (total <= 0 || weights.length === 0) return weights.map(() => 0);
  const safeCaps = caps.map((cap) => Math.max(0, Number.isFinite(cap) ? cap : 0));
  const capped = weights.map(() => false);
  const allocation = weights.map(() => 0);
  let remainingTotal = Math.min(
    total,
    safeCaps.reduce((sum, cap) => sum + cap, 0),
  );

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
      const cap = safeCaps[index] ?? 0;
      if (proposed > cap) {
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
        ? Math.min(
            safeCaps[index] ?? 0,
            (remainingTotal * Math.max(0, weights[index] ?? 0)) / activeWeightTotal,
          )
        : 0;
  }

  const rounded = allocation.map((value, index) =>
    Math.min(floor1(value), floor1(safeCaps[index] ?? 0)),
  );
  let remainingRounding = round1(
    Math.min(
      total,
      safeCaps.reduce((sum, cap) => sum + cap, 0),
    ) - rounded.reduce((sum, value) => sum + value, 0),
  );

  while (remainingRounding >= 0.1 - TSS_EPSILON) {
    const nextIndex = rounded.findIndex(
      (value, index) => value + 0.1 <= floor1(safeCaps[index] ?? 0) + TSS_EPSILON,
    );
    if (nextIndex < 0) break;
    rounded[nextIndex] = round1((rounded[nextIndex] ?? 0) + 0.1);
    remainingRounding = round1(remainingRounding - 0.1);
  }

  return rounded;
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

function sumAvailabilityMinutes(
  windows: DailyLoadRecommendationAvailabilityWindow[] | null | undefined,
) {
  return (windows ?? []).reduce(
    (sum, window) => sum + Math.max(0, window.end_minute_of_day - window.start_minute_of_day),
    0,
  );
}

function resolveAvailableMinutesByDay(input: BuildDailyLoadDistributionRecommendationInput) {
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

function resolveDistributionHardRestDays(input: BuildDailyLoadDistributionRecommendationInput) {
  if (input.schedulingConstraints?.hardRestDays !== undefined) {
    return normalizeWeekdayNameSet(input.schedulingConstraints.hardRestDays);
  }
  return new Set(input.preferenceProfile?.availability.hard_rest_days ?? []);
}

function resolveDistributionPreferredWeekdays(
  input: BuildDailyLoadDistributionRecommendationInput,
) {
  return normalizeWeekdayNameSet(input.schedulingConstraints?.preferredWeekdays);
}

function buildPlannedSessionDateSet(input: BuildDailyLoadDistributionRecommendationInput) {
  const dates = new Set<string>();
  for (const session of input.plannedSessions ?? []) {
    const date = dateForSession({ session, startDate: input.startDate });
    if (date && date >= input.startDate && date <= input.endDate) dates.add(date);
  }
  return dates;
}

function buildPlannedSessionByDate(input: BuildDailyLoadDistributionRecommendationInput) {
  const byDate = new Map<string, PlannedSessionAssignment>();
  for (const session of input.plannedSessions ?? []) {
    const date = dateForSession({ session, startDate: input.startDate });
    if (!date || date < input.startDate || date > input.endDate) continue;

    const existing = byDate.get(date) ?? {};
    const activityCategory = normalizeActivityCategory(session.activityCategory);
    byDate.set(date, {
      activityCategory: existing.activityCategory ?? activityCategory ?? undefined,
      primaryFocus: existing.primaryFocus ?? session.primaryFocus ?? undefined,
      estimatedTss: (existing.estimatedTss ?? 0) + toFinitePositive(session.estimatedTss),
      estimatedDurationMinutes:
        (existing.estimatedDurationMinutes ?? 0) +
        toFinitePositive(session.estimatedDurationMinutes),
    });
  }
  return byDate;
}

function resolveSessionCount(
  input: BuildDailyLoadDistributionRecommendationInput,
  candidateCount: number,
  plannedCount = 0,
): number {
  const allocationTarget = input.weeklyAllocation?.totals.target_sessions;
  const minSessions =
    input.schedulingConstraints?.minSessionsPerWeek ??
    input.preferenceProfile?.dose_limits.min_sessions_per_week;
  const maxSessions =
    input.schedulingConstraints?.maxSessionsPerWeek ??
    input.preferenceProfile?.dose_limits.max_sessions_per_week;
  const boundedMin = typeof minSessions === "number" ? clamp(minSessions, 1, 7) : null;
  const boundedMax = typeof maxSessions === "number" ? clamp(maxSessions, 1, 7) : null;
  const derived =
    typeof allocationTarget === "number" && allocationTarget > 0
      ? allocationTarget
      : boundedMin !== null && boundedMax !== null
        ? Math.round((boundedMin + boundedMax) / 2)
        : (boundedMax ?? boundedMin ?? DEFAULT_WEEKLY_SESSION_COUNT);
  const minAllowed = boundedMin ?? 1;
  const maxAllowed = Math.max(minAllowed, Math.min(candidateCount, boundedMax ?? 7));
  return clamp(Math.max(derived, plannedCount), minAllowed, maxAllowed);
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
    if (selected.some((candidate) => candidate.dayOffset === anchor)) continue;
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
  return "other";
}

function durationMinutesForCategory(category: WeeklyAllocationCategory): number {
  if (category.volume.duration_minutes) return category.volume.duration_minutes.target;
  if (category.volume.unit === "minutes") return category.volume.target;
  if (category.volume.unit === "sets") return category.volume.target * 6;
  return category.volume.target;
}

function rolePriority(role: CategoryBudget["role"]): number {
  switch (role) {
    case "primary":
      return 0;
    case "secondary":
      return 1;
    case "support":
      return 2;
    default:
      return 3;
  }
}

function categoryOrder(category: DailyLoadRecommendationActivityCategory): number {
  const index = ACTIVITY_CATEGORY_ORDER.indexOf(category);
  return index === -1 ? ACTIVITY_CATEGORY_ORDER.length : index;
}

function compareCategoryBudgets(left: CategoryBudget, right: CategoryBudget): number {
  const roleBias = rolePriority(left.role) - rolePriority(right.role);
  if (roleBias !== 0) return roleBias;
  const sessionBias = right.targetSessions - left.targetSessions;
  if (sessionBias !== 0) return sessionBias;
  const durationBias = right.targetDurationMinutes - left.targetDurationMinutes;
  if (durationBias !== 0) return durationBias;
  return categoryOrder(left.activityCategory) - categoryOrder(right.activityCategory);
}

function buildCategoryBudgets(
  weeklyAllocation: WeeklyAllocation | null | undefined,
): CategoryBudget[] {
  const budgets: CategoryBudget[] = [];
  for (const [rawCategory, category] of Object.entries(
    weeklyAllocation?.activity_categories ?? {},
  )) {
    const activityCategory = normalizeActivityCategory(rawCategory);
    if (!activityCategory || !category) continue;
    budgets.push({
      activityCategory,
      targetSessions: Math.max(0, category.sessions.target),
      targetDurationMinutes: durationMinutesForCategory(category),
      role: category.role,
      keyExposureTypes: category.key_exposures.map((exposure) => exposure.type),
      loadMultiplier: Math.max(0.1, category.load_model.fatigue_cost_multiplier),
    });
  }
  budgets.sort(compareCategoryBudgets);

  return budgets.length > 0 ? budgets : [FALLBACK_CATEGORY_BUDGET];
}

function focusFromBudget(
  budget: CategoryBudget,
  fallbackFocus: DailyLoadRecommendationPrimaryFocus,
): DailyLoadRecommendationPrimaryFocus {
  if (budget.activityCategory === "strength") {
    if (budget.keyExposureTypes.includes("strength_heavy")) return "max_strength";
    if (budget.keyExposureTypes.includes("strength_hypertrophy")) return "hypertrophy";
    if (budget.keyExposureTypes.includes("strength_power")) return "power";
    if (budget.keyExposureTypes.includes("mobility")) return "mobility";
    return "strength_endurance";
  }

  if (budget.keyExposureTypes.includes("vo2_interval")) return "vo2";
  if (budget.keyExposureTypes.includes("threshold_interval")) return "threshold";
  if (budget.keyExposureTypes.includes("race_specific")) return "race_specific";
  if (budget.keyExposureTypes.includes("long_session")) return "long_endurance";
  if (budget.keyExposureTypes.includes("recovery")) return "recovery";
  if (budget.keyExposureTypes.includes("technique")) return "endurance";
  return fallbackFocus;
}

function assignCategoryBudgets(input: {
  trainingDates: Array<{ date: string }>;
  budgets: CategoryBudget[];
  plannedSessionByDate: Map<string, PlannedSessionAssignment>;
}) {
  const fallbackBudget = input.budgets[0] ?? FALLBACK_CATEGORY_BUDGET;
  const assignedCounts = new Map<DailyLoadRecommendationActivityCategory, number>(
    input.budgets.map((budget) => [budget.activityCategory, 0] as const),
  );

  return input.trainingDates.map((trainingDate) => {
    const pinnedCategory = input.plannedSessionByDate.get(trainingDate.date)?.activityCategory;
    const budget =
      (pinnedCategory
        ? input.budgets.find((candidate) => candidate.activityCategory === pinnedCategory)
        : undefined) ??
      [...input.budgets].sort((left, right) => {
        const leftTarget = Math.max(1, left.targetSessions);
        const rightTarget = Math.max(1, right.targetSessions);
        const fillBias =
          (assignedCounts.get(left.activityCategory) ?? 0) / leftTarget -
          (assignedCounts.get(right.activityCategory) ?? 0) / rightTarget;
        if (fillBias !== 0) return fillBias;
        return compareCategoryBudgets(left, right);
      })[0] ??
      fallbackBudget;

    assignedCounts.set(
      budget.activityCategory,
      (assignedCounts.get(budget.activityCategory) ?? 0) + 1,
    );
    return { budget, pinned: pinnedCategory === budget.activityCategory };
  });
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
      if (sessionsByDate.has(date) && !hardRestDays.has(weekday)) candidateWeekdays.add(weekday);
      if (preferredWeekdays.has(weekday) && !hardRestDays.has(weekday))
        candidateWeekdays.add(weekday);
    }
    const usedDefaultWeekdayFallback = candidateWeekdays.size === 0;
    if (usedDefaultWeekdayFallback) {
      for (let dayOffset = 0; dayOffset < daysInWeek; dayOffset += 1) {
        if (!hardRestDays.has(dayOffset)) candidateWeekdays.add(dayOffset);
      }
    }
    const activeWeekdays = [...candidateWeekdays].sort((left, right) => left - right);

    const rows = Array.from({ length: daysInWeek }, (_, dayOffset) => {
      const date = addDaysDateOnlyUtc(weekStartDate, dayOffset);
      const sessions = sessionsByDate.get(date) ?? [];
      const hasSession = sessions.length > 0 && !hardRestDays.has(dayOffset);
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
          : "other");
      return { date, dayOffset, focus, activityCategory, weight };
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
      const sessions = sessionsByDate.get(row.date) ?? [];
      const hasExplicitSport = sessions.some((session) => Boolean(session.activityCategory));
      const boundedSessionTss = sessions.reduce(
        (sum, session) => sum + toFinitePositive(session.estimatedTss),
        0,
      );
      const boundedSessionDuration = sessions.reduce(
        (sum, session) => sum + toFinitePositive(session.estimatedDurationMinutes),
        0,
      );
      const recommendationState: DailyLoadRecommendationPoint["recommendationState"] =
        row.focus === "rest"
          ? "abstain"
          : !hasExplicitSport
            ? "clarification_required"
            : boundedSessionTss > 0 || boundedSessionDuration > 0
              ? "maintenance_only"
              : "abstain";
      const maintenanceCap =
        boundedSessionTss > 0 ? boundedSessionTss : boundedSessionDuration * 0.75;
      const recommendedLoadTss =
        recommendationState === "maintenance_only"
          ? round1(Math.min(tss[index] ?? 0, maintenanceCap))
          : round1(tss[index] ?? 0);
      const completedLoadTss = round1(completedByDate.get(row.date) ?? 0);
      const scheduledLoadTss = round1(scheduledByDate.get(row.date) ?? 0);
      const hasSession = sessions.length > 0;
      const hasEstimatedSessionTss = sessions.some(
        (session) => toFinitePositive(session.estimatedTss) > 0,
      );
      const hasExplicitSessionFocus = sessions.some((session) => Boolean(session.primaryFocus));
      const hasExplicitSessionCategory = sessions.some((session) =>
        Boolean(session.activityCategory),
      );
      const confidenceScore = confidenceScoreForRecommendedDay({
        hasWeeklyTarget: Boolean(weeklyTarget),
        weekTargetTss,
        isPartialWeek: daysInWeek < 7,
        hasSession,
        hasEstimatedSessionTss,
        hasExplicitSessionFocus,
        hasExplicitSessionCategory,
        hasPreferredWeekdays: preferredWeekdays.size > 0,
        usedDefaultWeekdayFallback,
        isHardRestDay: hardRestDays.has(row.dayOffset),
        hasScheduledLoad: scheduledLoadTss > 0,
        hasCompletedLoad: completedLoadTss > 0,
        isRestDay: row.focus === "rest",
      });
      results.push({
        date: row.date,
        recommendationState,
        recommendationDisposition:
          recommendationState === "maintenance_only" ? "maintenance" : recommendationState,
        actionableRecommendation: (
          ["recommendation", "maintenance_only"] as readonly string[]
        ).includes(recommendationState)
          ? {
              recommendedLoadTss,
              recommendedDurationMinutes:
                recommendationState === "maintenance_only" && boundedSessionDuration > 0
                  ? round1(Math.min(duration[index] ?? 0, boundedSessionDuration))
                  : round1(duration[index] ?? 0),
              recommendedFatigueCost:
                recommendationState === "maintenance_only"
                  ? round1(Math.min(fatigue[index] ?? 0, maintenanceCap))
                  : round1(fatigue[index] ?? 0),
              recommendedStrengthSets: round1(strengthSets[index] ?? 0),
            }
          : null,
        recommendedLoadTss,
        recommendedDurationMinutes:
          recommendationState === "maintenance_only" && boundedSessionDuration > 0
            ? round1(Math.min(duration[index] ?? 0, boundedSessionDuration))
            : round1(duration[index] ?? 0),
        recommendedFatigueCost:
          recommendationState === "maintenance_only"
            ? round1(Math.min(fatigue[index] ?? 0, maintenanceCap))
            : round1(fatigue[index] ?? 0),
        recommendedStrengthSets: round1(strengthSets[index] ?? 0),
        primaryFocus: row.focus,
        activityCategory: row.activityCategory,
        scheduledLoadTss,
        completedLoadTss,
        loadDeltaTss: round1(completedLoadTss - recommendedLoadTss),
        confidence: confidenceBucketForScore(confidenceScore),
        confidence_score: confidenceScore,
        reasonCodes: reasonCodesForRecommendedDay({
          hasWeeklyTarget: Boolean(weeklyTarget),
          weekTargetTss,
          isPartialWeek: daysInWeek < 7,
          hasSession,
          hasEstimatedSessionTss,
          hasExplicitSessionFocus,
          hasExplicitSessionCategory,
          hasPreferredWeekdays: preferredWeekdays.size > 0,
          usedDefaultWeekdayFallback,
          isHardRestDay: hardRestDays.has(row.dayOffset),
          hasScheduledLoad: scheduledLoadTss > 0,
          hasCompletedLoad: completedLoadTss > 0,
          isRestDay: row.focus === "rest",
        }),
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

  const availableMinutesByDay = resolveAvailableMinutesByDay(input);
  const hasAvailabilityWindows = availableMinutesByDay.size > 0;
  const hardRestDays = resolveDistributionHardRestDays(input);
  const preferredWeekdays = resolveDistributionPreferredWeekdays(input);
  const sessionDates = buildPlannedSessionDateSet(input);
  const plannedSessionByDate = buildPlannedSessionByDate(input);
  const hasExplicitSchedulingConstraints = Boolean(input.schedulingConstraints);
  const targetByWeekStart = new Map(
    input.weeklyTargets.map((target) => [target.weekStartDate ?? target.startDate, target]),
  );
  const categoryBudgets = buildCategoryBudgets(input.weeklyAllocation);
  const points: DailyLoadRecommendationPoint[] = [];

  for (let offset = 0; offset < dayCount; offset += 7) {
    const weekStartDate = addDaysDateOnlyUtc(input.startDate, offset);
    const weekEndDate = addDaysDateOnlyUtc(input.startDate, Math.min(offset + 6, dayCount - 1));
    const daysInWeek = diffDateOnlyUtcDays(weekStartDate, weekEndDate) + 1;
    const target = targetByWeekStart.get(weekStartDate);
    const eventDateInWeek =
      target?.eventDate && target.eventDate >= weekStartDate && target.eventDate <= weekEndDate
        ? target.eventDate
        : null;
    const weeklyTss = Math.max(0, target?.targetTss ?? 0) * (daysInWeek / 7);
    const candidates = Array.from({ length: daysInWeek }, (_, dayOffset) => {
      const date = addDaysDateOnlyUtc(weekStartDate, dayOffset);
      const day = weekdayNameForDate(date);
      const availabilityMinutes =
        availableMinutesByDay.get(day) ?? (hasAvailabilityWindows ? 0 : 60);
      const hasSession = sessionDates.has(date) || date === eventDateInWeek;
      const preferred = preferredWeekdays.size === 0 || preferredWeekdays.has(day) || hasSession;
      const available = preferred && !hardRestDays.has(day) && availabilityMinutes > 0;
      return available ? [{ date, dayOffset, availabilityMinutes, hasSession }] : [];
    }).flat();
    const shouldUseFallbackTrainingDays = candidates.length === 0 && !input.preferenceProfile;
    const trainingDates = chooseTrainingDates({
      candidates:
        candidates.length > 0 || !shouldUseFallbackTrainingDays
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
    const categoryAssignments = assignCategoryBudgets({
      trainingDates,
      budgets: categoryBudgets,
      plannedSessionByDate,
    });
    const templateFocuses = resolveDailyFocusTemplate({
      phase: target?.phase,
      selectedDays: trainingDates.map((trainingDate) => ({
        date: trainingDate.date,
        dayOffset: trainingDate.dayOffset,
      })),
      eventDate: eventDateInWeek,
      recoveryRanges: target?.recoveryRanges,
    });
    const focuses = trainingDates.map((trainingDate, index) => {
      const plannedFocus = plannedSessionByDate.get(trainingDate.date)?.primaryFocus;
      if (plannedFocus) return plannedFocus;
      return focusFromBudget(
        categoryAssignments[index]?.budget ?? categoryBudgets[0] ?? FALLBACK_CATEGORY_BUDGET,
        templateFocuses[index] ?? focusForSelectedIndex(index, trainingDates.length, target?.phase),
      );
    });
    const hasExplicitAllocation = categoryBudgets.some((budget) => budget.role !== "fallback");
    const athleteCapacityCap = resolveAthleteCapacityCap(input.capacityContext);
    const recommendationStates = trainingDates.map(
      (trainingDate, index): DailyLoadRecommendationPoint["recommendationState"] => {
        const assignment = categoryAssignments[index];
        const planned = plannedSessionByDate.get(trainingDate.date);
        const hasExplicitSport = Boolean(
          planned?.activityCategory ??
            (assignment?.budget.role !== "fallback" ? assignment?.budget.activityCategory : null),
        );
        if (!hasExplicitSport) return "clarification_required";
        if (hasExplicitAllocation && athleteCapacityCap !== null) return "recommendation";
        const hasBoundedContext =
          (planned?.estimatedTss ?? 0) > 0 ||
          (planned?.estimatedDurationMinutes ?? 0) > 0 ||
          hasExplicitAllocation;
        return hasBoundedContext ? "maintenance_only" : "abstain";
      },
    );
    const shareCap = trainingDates.length >= 3 ? 0.45 : 0.6;
    const caps = trainingDates.map((trainingDate, index) => {
      const focus = focuses[index] ?? "recovery";
      const recommendationState = recommendationStates[index] ?? "abstain";
      const shareTssCap = weeklyTss * shareCap;
      const availabilityTssCap = hasAvailabilityWindows
        ? trainingDate.availabilityMinutes * tssPerMinuteForFocus(focus)
        : Number.POSITIVE_INFINITY;
      const maxSingleSessionMinutes = finitePositive(
        input.preferenceProfile?.dose_limits.max_single_session_duration_minutes,
      );
      const maxSingleSessionTssCap =
        maxSingleSessionMinutes === null
          ? Number.POSITIVE_INFINITY
          : maxSingleSessionMinutes * tssPerMinuteForFocus(focus);
      const planned = plannedSessionByDate.get(trainingDate.date);
      const maintenanceTssCap =
        recommendationState === "maintenance_only"
          ? (finitePositive(planned?.estimatedTss) ??
            (finitePositive(planned?.estimatedDurationMinutes) !== null
              ? (finitePositive(planned?.estimatedDurationMinutes) ?? 0) *
                tssPerMinuteForFocus(focus)
              : Number.POSITIVE_INFINITY))
          : Number.POSITIVE_INFINITY;
      const capacityTssCap = athleteCapacityCap ?? Number.POSITIVE_INFINITY;
      return Math.max(
        0,
        Math.min(
          shareTssCap,
          availabilityTssCap,
          maxSingleSessionTssCap,
          capacityTssCap,
          maintenanceTssCap,
        ),
      );
    });
    const allocations = allocateWithCaps(
      weeklyTss,
      focuses.map(
        (focus, index) =>
          distributionWeightForFocus(focus) *
          (categoryAssignments[index]?.budget.loadMultiplier ?? 1),
      ),
      caps,
    );
    const allocatedWeeklyTss = round1(allocations.reduce((sum, load) => sum + load, 0));
    const weeklyUnderAllocated = allocatedWeeklyTss + TSS_EPSILON < round1(weeklyTss);

    for (let dayOffset = 0; dayOffset < daysInWeek; dayOffset += 1) {
      const date = addDaysDateOnlyUtc(weekStartDate, dayOffset);
      const day = weekdayNameForDate(date);
      const selectedIndex = selectedByDate.get(date);
      const focus = selectedIndex === undefined ? "rest" : (focuses[selectedIndex] ?? "recovery");
      const assignment =
        selectedIndex === undefined ? null : (categoryAssignments[selectedIndex] ?? null);
      const recommendedLoadTss =
        selectedIndex === undefined ? 0 : (allocations[selectedIndex] ?? 0);
      const cap =
        selectedIndex === undefined ? 0 : (caps[selectedIndex] ?? Number.POSITIVE_INFINITY);
      const capReasonCodes: string[] = [];
      if (input.preferenceProfile && hardRestDays.has(day))
        capReasonCodes.push("hard_rest_day_cap");
      if (selectedIndex !== undefined && hasAvailabilityWindows)
        capReasonCodes.push("availability_duration_cap_applied");
      if (
        selectedIndex !== undefined &&
        finitePositive(input.preferenceProfile?.dose_limits.max_single_session_duration_minutes) !==
          null
      )
        capReasonCodes.push("max_single_session_duration_cap_applied");
      if (selectedIndex !== undefined && athleteCapacityCap !== null)
        capReasonCodes.push("athlete_capacity_cap_applied");
      if (selectedIndex !== undefined && cap <= recommendedLoadTss + TSS_EPSILON)
        capReasonCodes.push("daily_cap_binding");
      if (weeklyUnderAllocated) capReasonCodes.push("weekly_target_under_allocated_daily_caps");
      if (input.preferenceProfile && candidates.length === 0)
        capReasonCodes.push("all_training_days_unavailable");
      const isRestDay = selectedIndex === undefined;
      const recommendationState =
        selectedIndex === undefined
          ? "abstain"
          : (recommendationStates[selectedIndex] ?? "abstain");
      const selectedHasPlannedSession = sessionDates.has(date);
      const confidenceScore = confidenceScoreForDistributionPoint({
        hasWeeklyTarget: Boolean(target),
        weeklyTss,
        isPartialWeek: daysInWeek < 7,
        hasPreferenceProfile: Boolean(input.preferenceProfile),
        hasAvailabilityWindows,
        hasPlannedSessions: sessionDates.size > 0,
        hasWeeklyAllocation:
          Object.keys(input.weeklyAllocation?.activity_categories ?? {}).length > 0,
        selectedHasPlannedSession,
        hasExplicitSchedulingConstraints,
        isRestDay,
      });
      points.push({
        date,
        recommendationState,
        recommendationDisposition:
          recommendationState === "recommendation"
            ? "recommended"
            : recommendationState === "maintenance_only"
              ? "maintenance"
              : recommendationState,
        actionableRecommendation: (
          ["recommendation", "maintenance_only"] as readonly string[]
        ).includes(recommendationState)
          ? {
              recommendedLoadTss,
              recommendedDurationMinutes: 0,
              recommendedFatigueCost: 0,
              recommendedStrengthSets: 0,
            }
          : null,
        recommendedLoadTss,
        recommendedDurationMinutes: 0,
        recommendedFatigueCost: 0,
        recommendedStrengthSets: 0,
        primaryFocus: focus,
        activityCategory:
          focus === "rest"
            ? "other"
            : (plannedSessionByDate.get(date)?.activityCategory ??
              assignment?.budget.activityCategory ??
              primaryActivityCategory(input.weeklyAllocation)),
        scheduledLoadTss: 0,
        completedLoadTss: 0,
        loadDeltaTss: round1(0 - recommendedLoadTss),
        confidence: confidenceBucketForScore(confidenceScore),
        confidence_score: confidenceScore,
        reasonCodes: orderedReasonCodes([
          "daily_load_distribution_v1",
          target ? "source_weekly_target" : "source_missing_weekly_target",
          weeklyTss <= 0 ? "target_zero_tss" : "target_positive_tss",
          ...(daysInWeek < 7 ? ["partial_week_scaled"] : []),
          input.preferenceProfile
            ? "source_preference_profile"
            : "fallback_missing_preference_profile",
          hasAvailabilityWindows ? "availability_windows_applied" : "availability_default_pattern",
          ...(hardRestDays.size > 0 ? ["hard_rest_days_applied"] : []),
          sessionDates.size > 0
            ? "source_planned_session_dates"
            : "fallback_anchor_session_pattern",
          ...(hasExplicitSchedulingConstraints ? ["explicit_scheduling_constraints_applied"] : []),
          ...(selectedHasPlannedSession
            ? ["planned_session_date_applied", "planned_session_date_specific"]
            : []),
          Object.keys(input.weeklyAllocation?.activity_categories ?? {}).length > 0
            ? "source_weekly_allocation_activity_mix"
            : "fallback_default_activity_category",
          isRestDay ? "rest_day_allocation" : "profile_goal_weekly_distribution",
          ...(assignment?.pinned
            ? ["planned_session_category_pin"]
            : isRestDay
              ? []
              : ["weekly_allocation_category_budget"]),
          ...capReasonCodes,
        ]),
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
