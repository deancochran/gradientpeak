import { getLoadBalanceStatus } from "../load/form";
import {
  calculateLoadBalance,
  calculateLongTermLoad,
  calculateRecentLoad,
} from "../load/progression";
import { buildDailyLoadByDateSeries, replayCommonLoadFitnessByDate } from "../load/replay";
import { addDays } from "../utils/dates";
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
  plannedLoad: number,
  scheduledDate: Date,
  currentState: FitnessState,
  weeklyPlannedActivities: PlannedActivity[] = [],
): FatiguePrediction {
  // Calculate new training load after activity
  const newRecentLoad = calculateRecentLoad(currentState.recentLoad, plannedLoad);
  const newLongTermLoad = calculateLongTermLoad(currentState.longTermLoad, plannedLoad);
  const newLoadBalance = calculateLoadBalance(newLongTermLoad, newRecentLoad);

  // Calculate weekly totals
  const weekStart = getStartOfWeek(scheduledDate);
  const weekEnd = getEndOfWeek(scheduledDate);

  const weeklyCommonLoad = weeklyPlannedActivities
    .filter((activity) => {
      const activityDate = new Date(activity.scheduledDate);
      return activityDate >= weekStart && activityDate <= weekEnd;
    })
    .reduce((sum, activity) => sum + activity.estimatedCommonLoad, 0);

  const totalWeeklyLoad = weeklyCommonLoad + plannedLoad;

  // Calculate ramp rate (weekly LongTermLoad change)
  const previousWeekLongTermLoad = currentState.longTermLoad; // Simplified - could track historical
  const projectedEndOfWeekLongTermLoad = projectWeekEndLongTermLoad(
    currentState.longTermLoad,
    weeklyPlannedActivities,
    plannedLoad,
    scheduledDate,
    weekEnd,
  );
  const rampRate = projectedEndOfWeekLongTermLoad - previousWeekLongTermLoad;

  const hasFitnessState = [
    currentState.recentLoad,
    currentState.longTermLoad,
    currentState.loadBalance,
  ].every(Number.isFinite);
  const loadChangeState = classifyLoadChange(rampRate, hasFitnessState);
  const reasons = buildPlanningReasons({
    hasFitnessState,
    loadChangeState,
    plannedLoad,
    totalWeeklyLoad,
    currentLongTermLoad: currentState.longTermLoad,
  });

  const loadBalanceStatus = getLoadBalanceStatus(newLoadBalance);
  const _formChange = getFormChange(currentState.loadBalance, newLoadBalance);

  // Generate warnings
  const warnings: string[] = [];

  if (!hasFitnessState) {
    warnings.push(
      "Training-load comparison unavailable because the current fitness state is incomplete",
    );
  } else if (loadChangeState === "increasing") {
    warnings.push(`Projected LongTermLoad change is ${rampRate.toFixed(1)} points this week`);
  }

  if (totalWeeklyLoad > currentState.longTermLoad * 1.5) {
    warnings.push(
      `Weekly Common Load (${Math.round(totalWeeklyLoad)}) significantly exceeds current fitness level (LongTermLoad: ${Math.round(currentState.longTermLoad)})`,
    );
  }

  if (plannedLoad > currentState.longTermLoad * 0.8) {
    warnings.push(
      `This single activity (${Math.round(plannedLoad)} Common Load) is very high compared to your fitness level`,
    );
  }

  // Generate recommendation
  const recommendation = generateRecommendation(loadChangeState, reasons);

  return {
    afterActivity: {
      longTermLoad: Math.round(newLongTermLoad * 10) / 10,
      recentLoad: Math.round(newRecentLoad * 10) / 10,
      loadBalance: Math.round(newLoadBalance * 10) / 10,
      loadBalanceStatus,
    },
    weeklyProjection: {
      totalLoad: Math.round(totalWeeklyLoad),
      averageDailyLoad: Math.round((totalWeeklyLoad / 7) * 10) / 10,
      rampRate: Math.round(rampRate * 10) / 10,
      loadChangeState,
      reasons,
      recommendation,
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
  plannedLoad: number;
  totalWeeklyLoad: number;
  currentLongTermLoad: number;
}): PlanningReasonCode[] {
  if (!input.hasFitnessState) return ["MISSING_FITNESS_STATE"];

  const reasons: PlanningReasonCode[] = [
    input.loadChangeState === "increasing"
      ? "LOAD_CHANGE_INCREASING"
      : input.loadChangeState === "decreasing"
        ? "LOAD_CHANGE_DECREASING"
        : "LOAD_CHANGE_STABLE",
  ];
  if (input.totalWeeklyLoad > input.currentLongTermLoad * 1.5)
    reasons.push("WEEKLY_LOAD_ABOVE_CURRENT_LongTermLoad");
  if (input.plannedLoad > input.currentLongTermLoad * 0.8)
    reasons.push("SINGLE_ACTIVITY_ABOVE_CURRENT_LongTermLoad");
  return reasons;
}

/**
 * Determine form change direction
 */
function getFormChange(
  currentLoadBalance: number,
  newLoadBalance: number,
): "improving" | "maintaining" | "declining" {
  const change = newLoadBalance - currentLoadBalance;

  if (Math.abs(change) < 2) return "maintaining";
  if (change > 0) return "improving"; // LoadBalance increasing = getting fresher
  return "declining"; // LoadBalance decreasing = getting more fatigued
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
  if (reasons.includes("WEEKLY_LOAD_ABOVE_CURRENT_LongTermLoad")) {
    return "Planned weekly load is above the current LongTermLoad reference; review the schedule and available context.";
  }
  return `Projected weekly LongTermLoad is ${loadChangeState}; use this descriptive estimate with athlete context.`;
}

/**
 * Project LongTermLoad at end of week based on planned activities
 */
function projectWeekEndLongTermLoad(
  currentLongTermLoad: number,
  plannedActivities: PlannedActivity[],
  additionalLoad: number,
  scheduledDate: Date,
  weekEnd: Date,
): number {
  const loadByDate = new Map<string, number>();

  for (const activity of plannedActivities) {
    const activityDate = new Date(activity.scheduledDate);
    if (activityDate > weekEnd) {
      continue;
    }

    const dateKey = activityDate.toISOString().split("T")[0]!;
    loadByDate.set(dateKey, (loadByDate.get(dateKey) ?? 0) + activity.estimatedCommonLoad);
  }

  const scheduledDateKey = scheduledDate.toISOString().split("T")[0]!;
  loadByDate.set(scheduledDateKey, (loadByDate.get(scheduledDateKey) ?? 0) + additionalLoad);

  const replayed = replayCommonLoadFitnessByDate({
    dailyLoad: buildDailyLoadByDateSeries({
      startDate: getStartOfWeek(scheduledDate).toISOString().split("T")[0]!,
      endDate: weekEnd.toISOString().split("T")[0]!,
      loadByDate,
    }),
    initialLongTermLoad: currentLongTermLoad,
    initialRecentLoad: currentLongTermLoad,
  });

  return replayed.at(-1)?.longTermLoad ?? currentLongTermLoad;
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
  totalLoad: number;
  dailyBreakdown: Array<{ date: Date; load: number; count: number }>;
  projectedLongTermLoad: number;
  rampRate: number;
  loadChangeState: LoadChangeState;
  reasons: PlanningReasonCode[];
} {
  const weekEnd = getEndOfWeek(weekStart);

  // Filter activities for this week
  const weekActivities = plannedActivities.filter((activity) => {
    const activityDate = new Date(activity.scheduledDate);
    return activityDate >= weekStart && activityDate <= weekEnd;
  });

  // Calculate total Common Load
  const totalLoad = weekActivities.reduce((sum, activity) => sum + activity.estimatedCommonLoad, 0);

  // Create daily breakdown
  const dailyBreakdown: Array<{ date: Date; load: number; count: number }> = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStart, i);
    const dayActivities = weekActivities.filter((activity) => {
      const activityDate = new Date(activity.scheduledDate);
      return activityDate.toDateString() === date.toDateString();
    });

    const dayLoad = dayActivities.reduce((sum, activity) => sum + activity.estimatedCommonLoad, 0);

    dailyBreakdown.push({
      date,
      load: Math.round(dayLoad),
      count: dayActivities.length,
    });
  }

  const loadByDate = new Map<string, number>();
  for (const activity of weekActivities) {
    const dateKey = new Date(activity.scheduledDate).toISOString().split("T")[0]!;
    loadByDate.set(dateKey, (loadByDate.get(dateKey) ?? 0) + activity.estimatedCommonLoad);
  }

  const replayed = replayCommonLoadFitnessByDate({
    dailyLoad: buildDailyLoadByDateSeries({
      startDate: weekStart.toISOString().split("T")[0]!,
      endDate: weekEnd.toISOString().split("T")[0]!,
      loadByDate,
    }),
    initialLongTermLoad: currentState.longTermLoad,
    initialRecentLoad: currentState.recentLoad,
  });
  const projectedLongTermLoad = replayed.at(-1)?.longTermLoad ?? currentState.longTermLoad;

  // Calculate ramp rate
  const rampRate = projectedLongTermLoad - currentState.longTermLoad;
  const hasFitnessState = [
    currentState.recentLoad,
    currentState.longTermLoad,
    currentState.loadBalance,
  ].every(Number.isFinite);
  const loadChangeState = classifyLoadChange(rampRate, hasFitnessState);
  const reasons = buildPlanningReasons({
    hasFitnessState,
    loadChangeState,
    plannedLoad: 0,
    totalWeeklyLoad: totalLoad,
    currentLongTermLoad: currentState.longTermLoad,
  });

  return {
    totalLoad: Math.round(totalLoad),
    dailyBreakdown,
    projectedLongTermLoad: Math.round(projectedLongTermLoad * 10) / 10,
    rampRate: Math.round(rampRate * 10) / 10,
    loadChangeState,
    reasons,
  };
}
