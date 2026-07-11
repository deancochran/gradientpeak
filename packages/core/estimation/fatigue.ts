import { addDays } from "../calculations";
import { getFormStatus } from "../load/form";
import { calculateATL, calculateCTL, calculateTSB } from "../load/progression";
import { buildDailyTssByDateSeries, replayTrainingLoadByDate } from "../load/replay";
import type {
  FatiguePrediction,
  FitnessState,
  LoadChangeState,
  PlannedActivity,
  PlanningReasonCode,
} from "./types";

/**
 * Predict fatigue impact after completing a planned activity
 */
export function predictFatigue(
  plannedTSS: number,
  scheduledDate: Date,
  currentState: FitnessState,
  weeklyPlannedActivities: PlannedActivity[] = [],
): FatiguePrediction {
  // Calculate new training load after activity
  const newATL = calculateATL(currentState.atl, plannedTSS);
  const newCTL = calculateCTL(currentState.ctl, plannedTSS);
  const newTSB = calculateTSB(newCTL, newATL);

  // Calculate weekly totals
  const weekStart = getStartOfWeek(scheduledDate);
  const weekEnd = getEndOfWeek(scheduledDate);

  const weeklyTSS = weeklyPlannedActivities
    .filter((activity) => {
      const activityDate = new Date(activity.scheduledDate);
      return activityDate >= weekStart && activityDate <= weekEnd;
    })
    .reduce((sum, activity) => sum + activity.estimatedTSS, 0);

  const totalWeeklyTSS = weeklyTSS + plannedTSS;

  // Calculate ramp rate (weekly CTL change)
  const previousWeekCTL = currentState.ctl; // Simplified - could track historical
  const projectedEndOfWeekCTL = projectWeekEndCTL(
    currentState.ctl,
    weeklyPlannedActivities,
    plannedTSS,
    scheduledDate,
    weekEnd,
  );
  const rampRate = projectedEndOfWeekCTL - previousWeekCTL;

  const hasFitnessState = [currentState.atl, currentState.ctl, currentState.tsb].every(
    Number.isFinite,
  );
  const loadChangeState = classifyLoadChange(rampRate, hasFitnessState);
  const reasons = buildPlanningReasons({
    hasFitnessState,
    loadChangeState,
    plannedTSS,
    totalWeeklyTSS,
    currentCTL: currentState.ctl,
  });

  // Form assessment
  const calculatedFormStatus = getFormStatus(newTSB);
  const formStatus: FatiguePrediction["afterActivity"]["form"] =
    calculatedFormStatus === "overreaching" ? "tired" : calculatedFormStatus;
  const _formChange = getFormChange(currentState.tsb, newTSB);

  // Generate warnings
  const warnings: string[] = [];

  if (!hasFitnessState) {
    warnings.push(
      "Training-load comparison unavailable because the current fitness state is incomplete",
    );
  } else if (loadChangeState === "increasing") {
    warnings.push(`Projected CTL change is ${rampRate.toFixed(1)} points this week`);
  }

  if (totalWeeklyTSS > currentState.ctl * 1.5) {
    warnings.push(
      `Weekly TSS (${Math.round(totalWeeklyTSS)}) significantly exceeds current fitness level (CTL: ${Math.round(currentState.ctl)})`,
    );
  }

  if (plannedTSS > currentState.ctl * 0.8) {
    warnings.push(
      `This single activity (${Math.round(plannedTSS)} TSS) is very high compared to your fitness level`,
    );
  }

  // Generate recommendation
  const recommendation = generateRecommendation(loadChangeState, reasons);

  return {
    afterActivity: {
      ctl: Math.round(newCTL * 10) / 10,
      atl: Math.round(newATL * 10) / 10,
      tsb: Math.round(newTSB * 10) / 10,
      form: formStatus,
    },
    weeklyProjection: {
      totalTSS: Math.round(totalWeeklyTSS),
      averageDailyTSS: Math.round((totalWeeklyTSS / 7) * 10) / 10,
      rampRate: Math.round(rampRate * 10) / 10,
      isSafe: null,
      loadChangeState,
      reasons,
      recommendation,
    },
    recoveryPlan: {
      daysToRecover: null,
      nextHardWorkoutDate: null,
      suggestedRestDays: null,
    },
    warnings,
  };
}

function classifyLoadChange(rampRate: number, hasFitnessState: boolean): LoadChangeState {
  if (!hasFitnessState || !Number.isFinite(rampRate)) return "insufficient_data";
  if (rampRate > 2) return "increasing";
  if (rampRate < -2) return "decreasing";
  return "stable";
}

function buildPlanningReasons(input: {
  hasFitnessState: boolean;
  loadChangeState: LoadChangeState;
  plannedTSS: number;
  totalWeeklyTSS: number;
  currentCTL: number;
}): PlanningReasonCode[] {
  if (!input.hasFitnessState) return ["MISSING_FITNESS_STATE"];

  const reasons: PlanningReasonCode[] = [
    input.loadChangeState === "increasing"
      ? "LOAD_CHANGE_INCREASING"
      : input.loadChangeState === "decreasing"
        ? "LOAD_CHANGE_DECREASING"
        : "LOAD_CHANGE_STABLE",
  ];
  if (input.totalWeeklyTSS > input.currentCTL * 1.5) reasons.push("WEEKLY_LOAD_ABOVE_CURRENT_CTL");
  if (input.plannedTSS > input.currentCTL * 0.8) reasons.push("SINGLE_ACTIVITY_ABOVE_CURRENT_CTL");
  return reasons;
}

/**
 * Determine form change direction
 */
function getFormChange(
  currentTSB: number,
  newTSB: number,
): "improving" | "maintaining" | "declining" {
  const change = newTSB - currentTSB;

  if (Math.abs(change) < 2) return "maintaining";
  if (change > 0) return "improving"; // TSB increasing = getting fresher
  return "declining"; // TSB decreasing = getting more fatigued
}

/**
 * Generate recommendation text
 */
function generateRecommendation(
  loadChangeState: LoadChangeState,
  reasons: PlanningReasonCode[],
): string {
  if (loadChangeState === "insufficient_data") {
    return "Planning comparison unavailable until a complete fitness state is provided.";
  }
  if (reasons.includes("WEEKLY_LOAD_ABOVE_CURRENT_CTL")) {
    return "Planned weekly load is above the current CTL reference; review the schedule and available context.";
  }
  return `Projected weekly CTL is ${loadChangeState}; use this descriptive estimate with athlete context.`;
}

/**
 * Project CTL at end of week based on planned activities
 */
function projectWeekEndCTL(
  currentCTL: number,
  plannedActivities: PlannedActivity[],
  additionalTSS: number,
  scheduledDate: Date,
  weekEnd: Date,
): number {
  const tssByDate = new Map<string, number>();

  for (const activity of plannedActivities) {
    const activityDate = new Date(activity.scheduledDate);
    if (activityDate > weekEnd) {
      continue;
    }

    const dateKey = activityDate.toISOString().split("T")[0]!;
    tssByDate.set(dateKey, (tssByDate.get(dateKey) ?? 0) + activity.estimatedTSS);
  }

  const scheduledDateKey = scheduledDate.toISOString().split("T")[0]!;
  tssByDate.set(scheduledDateKey, (tssByDate.get(scheduledDateKey) ?? 0) + additionalTSS);

  const replayed = replayTrainingLoadByDate({
    dailyTss: buildDailyTssByDateSeries({
      startDate: getStartOfWeek(scheduledDate).toISOString().split("T")[0]!,
      endDate: weekEnd.toISOString().split("T")[0]!,
      tssByDate,
    }),
    initialCTL: currentCTL,
    initialATL: currentCTL,
  });

  return replayed.at(-1)?.ctl ?? currentCTL;
}

/**
 * Get start of week (Monday)
 */
function getStartOfWeek(date: Date): Date {
  const result = new Date(date);
  const day = result.getDay();
  const diff = result.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Sunday
  result.setDate(diff);
  result.setHours(0, 0, 0, 0);
  return result;
}

/**
 * Get end of week (Sunday)
 */
function getEndOfWeek(date: Date): Date {
  const result = getStartOfWeek(date);
  result.setDate(result.getDate() + 6);
  result.setHours(23, 59, 59, 999);
  return result;
}

/**
 * Estimate weekly load for a given week
 */
export function estimateWeeklyLoad(
  weekStart: Date,
  plannedActivities: PlannedActivity[],
  currentState: FitnessState,
): {
  totalTSS: number;
  dailyBreakdown: Array<{ date: Date; tss: number; count: number }>;
  projectedCTL: number;
  rampRate: number;
  isSafe: boolean | null;
  loadChangeState: LoadChangeState;
  reasons: PlanningReasonCode[];
} {
  const weekEnd = getEndOfWeek(weekStart);

  // Filter activities for this week
  const weekActivities = plannedActivities.filter((activity) => {
    const activityDate = new Date(activity.scheduledDate);
    return activityDate >= weekStart && activityDate <= weekEnd;
  });

  // Calculate total TSS
  const totalTSS = weekActivities.reduce((sum, activity) => sum + activity.estimatedTSS, 0);

  // Create daily breakdown
  const dailyBreakdown: Array<{ date: Date; tss: number; count: number }> = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStart, i);
    const dayActivities = weekActivities.filter((activity) => {
      const activityDate = new Date(activity.scheduledDate);
      return activityDate.toDateString() === date.toDateString();
    });

    const dayTSS = dayActivities.reduce((sum, activity) => sum + activity.estimatedTSS, 0);

    dailyBreakdown.push({
      date,
      tss: Math.round(dayTSS),
      count: dayActivities.length,
    });
  }

  const tssByDate = new Map<string, number>();
  for (const activity of weekActivities) {
    const dateKey = new Date(activity.scheduledDate).toISOString().split("T")[0]!;
    tssByDate.set(dateKey, (tssByDate.get(dateKey) ?? 0) + activity.estimatedTSS);
  }

  const replayed = replayTrainingLoadByDate({
    dailyTss: buildDailyTssByDateSeries({
      startDate: weekStart.toISOString().split("T")[0]!,
      endDate: weekEnd.toISOString().split("T")[0]!,
      tssByDate,
    }),
    initialCTL: currentState.ctl,
    initialATL: currentState.atl,
  });
  const projectedCTL = replayed.at(-1)?.ctl ?? currentState.ctl;

  // Calculate ramp rate
  const rampRate = projectedCTL - currentState.ctl;
  const hasFitnessState = [currentState.atl, currentState.ctl, currentState.tsb].every(
    Number.isFinite,
  );
  const loadChangeState = classifyLoadChange(rampRate, hasFitnessState);
  const reasons = buildPlanningReasons({
    hasFitnessState,
    loadChangeState,
    plannedTSS: 0,
    totalWeeklyTSS: totalTSS,
    currentCTL: currentState.ctl,
  });

  return {
    totalTSS: Math.round(totalTSS),
    dailyBreakdown,
    projectedCTL: Math.round(projectedCTL * 10) / 10,
    rampRate: Math.round(rampRate * 10) / 10,
    isSafe: null,
    loadChangeState,
    reasons,
  };
}
