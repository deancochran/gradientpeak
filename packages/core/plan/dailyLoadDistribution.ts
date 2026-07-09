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

const ACTIVITY_CATEGORY_ORDER: DailyRecommendedLoadActivityCategory[] = [
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
  activityCategory?: DailyRecommendedLoadActivityCategory;
  primaryFocus?: DailyRecommendedLoadPrimaryFocus;
}

interface CategoryBudget {
  activityCategory: DailyRecommendedLoadActivityCategory;
  targetSessions: number;
  targetDurationMinutes: number;
  role: WeeklyAllocationCategory["role"] | "fallback";
  keyExposureTypes: string[];
  loadMultiplier: number;
}

const FALLBACK_CATEGORY_BUDGET: CategoryBudget = {
  activityCategory: "run",
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

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function weekdayNameForDate(date: string): (typeof WEEKDAY_NAMES)[number] {
  return WEEKDAY_NAMES[parseDateOnlyUtc(date).getUTCDay()] ?? "monday";
}

function normalizeActivityCategory(
  category: string | null | undefined,
): DailyRecommendedLoadActivityCategory | null {
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

function buildPlannedSessionByDate(input: BuildDailyLoadDistributionInput) {
  const byDate = new Map<string, PlannedSessionAssignment>();
  for (const session of input.plannedSessions ?? []) {
    const date =
      session.date ??
      (typeof session.offsetDays === "number" && Number.isFinite(session.offsetDays)
        ? addDaysDateOnlyUtc(input.startDate, session.offsetDays)
        : null);
    if (!date || date < input.startDate || date > input.endDate) continue;

    const existing = byDate.get(date) ?? {};
    const activityCategory = normalizeActivityCategory(session.activityCategory);
    byDate.set(date, {
      activityCategory: existing.activityCategory ?? activityCategory ?? undefined,
      primaryFocus: existing.primaryFocus ?? session.primaryFocus ?? undefined,
    });
  }
  return byDate;
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

function preferenceBoundedSessionCount(
  input: BuildDailyLoadDistributionInput,
  sessionCount: number,
  candidateCount: number,
): number {
  const minSessions = input.preferenceProfile?.dose_limits.min_sessions_per_week;
  const maxSessions = input.preferenceProfile?.dose_limits.max_sessions_per_week;
  const boundedMin = typeof minSessions === "number" ? clamp(minSessions, 1, 7) : null;
  const boundedMax = typeof maxSessions === "number" ? clamp(maxSessions, 1, 7) : null;
  const derived = clamp(sessionCount, boundedMin ?? 1, boundedMax ?? 7);
  return clamp(derived, 1, Math.max(1, candidateCount));
}

function resolveSessionCount(
  input: BuildDailyLoadDistributionInput,
  candidateCount: number,
): number {
  const allocationTarget = input.weeklyAllocation?.totals.target_sessions;
  if (typeof allocationTarget === "number" && allocationTarget > 0) {
    return preferenceBoundedSessionCount(input, allocationTarget, candidateCount);
  }

  const minSessions = input.preferenceProfile?.dose_limits.min_sessions_per_week;
  const maxSessions = input.preferenceProfile?.dose_limits.max_sessions_per_week;
  const boundedMin = typeof minSessions === "number" ? clamp(minSessions, 1, 7) : null;
  const boundedMax = typeof maxSessions === "number" ? clamp(maxSessions, 1, 7) : null;
  const derived =
    boundedMin !== null && boundedMax !== null
      ? Math.round((boundedMin + boundedMax) / 2)
      : (boundedMax ?? boundedMin ?? DEFAULT_WEEKLY_SESSION_COUNT);
  return preferenceBoundedSessionCount(input, derived, candidateCount);
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
  const selected = [...input.candidates]
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

function durationMinutesForCategory(category: WeeklyAllocationCategory): number {
  if (category.volume.duration_minutes) return category.volume.duration_minutes.target;
  if (category.volume.unit === "minutes") return category.volume.target;
  if (category.volume.unit === "sets") return category.volume.target * 6;
  return category.volume.target;
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

  if (budgets.length > 0) return budgets;

  return [FALLBACK_CATEGORY_BUDGET];
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

function categoryOrder(category: DailyRecommendedLoadActivityCategory): number {
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

function focusFromBudget(
  budget: CategoryBudget,
  fallbackFocus: DailyRecommendedLoadPrimaryFocus,
): DailyRecommendedLoadPrimaryFocus {
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
  const assignedCounts = new Map<DailyRecommendedLoadActivityCategory, number>(
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
  const plannedSessionByDate = buildPlannedSessionByDate(input);
  const targetByWeekStart = new Map(
    input.weeklyTargets.map((target) => [target.weekStartDate, target]),
  );
  const categoryBudgets = buildCategoryBudgets(input.weeklyAllocation);
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
        ? [{ date, dayOffset, availabilityMinutes, hasSession: plannedSessionByDate.has(date) }]
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
    const categoryAssignments = assignCategoryBudgets({
      trainingDates,
      budgets: categoryBudgets,
      plannedSessionByDate,
    });
    const focuses = trainingDates.map((trainingDate, index) => {
      const plannedFocus = plannedSessionByDate.get(trainingDate.date)?.primaryFocus;
      if (plannedFocus) return plannedFocus;
      return focusFromBudget(
        categoryAssignments[index]?.budget ?? categoryBudgets[0] ?? FALLBACK_CATEGORY_BUDGET,
        focusForSelectedIndex(index, trainingDates.length, target?.phase),
      );
    });
    const allocations = allocateWithCap(
      weeklyTss,
      focuses.map(
        (focus, index) =>
          weightForFocus(focus) * (categoryAssignments[index]?.budget.loadMultiplier ?? 1),
      ),
      trainingDates.length >= 3 ? 0.45 : 0.6,
    );

    for (let dayOffset = 0; dayOffset < daysInWeek; dayOffset += 1) {
      const date = addDaysDateOnlyUtc(weekStartDate, dayOffset);
      const selectedIndex = selectedByDate.get(date);
      const focus = selectedIndex === undefined ? "rest" : (focuses[selectedIndex] ?? "recovery");
      const assignment =
        selectedIndex === undefined ? null : (categoryAssignments[selectedIndex] ?? null);
      points.push({
        date,
        recommended_load_tss: selectedIndex === undefined ? 0 : (allocations[selectedIndex] ?? 0),
        primary_focus: focus,
        activity_category:
          focus === "rest" ? "other" : (assignment?.budget.activityCategory ?? "run"),
        confidence: input.preferenceProfile ? "high" : "medium",
        reason_codes: [
          "daily_load_distribution_v1",
          selectedIndex === undefined ? "rest_day_allocation" : "profile_goal_weekly_distribution",
          ...(assignment?.pinned
            ? ["planned_session_category_pin"]
            : ["weekly_allocation_category_budget"]),
        ],
      });
    }
  }

  return points;
}
