import {
  calculateATL,
  calculateCTL,
  calculateTSB,
  getFormStatus,
} from "../calculations";
import { addDays } from "../calculations";
import type {
  FatiguePrediction,
  FitnessState,
  PlannedActivity,
  FormStatus,
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

  // Safety check (conservative threshold: 8 TSS/week)
  const isSafe = rampRate <= 8;

  // Recovery recommendations
  const daysToRecover = calculateRecoveryDays(plannedTSS, newTSB);
  const nextHardWorkoutDate = addDays(scheduledDate, daysToRecover);
  const suggestedRestDays = Math.max(1, Math.ceil(daysToRecover / 2));

  // Form assessment
  const formStatus = getFormStatus(newTSB);
  const formChange = getFormChange(currentState.tsb, newTSB);

  // Generate warnings
  const warnings: string[] = [];

  if (!isSafe) {
    warnings.push(
      `Ramp rate of ${rampRate.toFixed(1)} TSS/week exceeds safe limit (8 TSS/week)`,
    );
  }

  if (newTSB < -30) {
    warnings.push(
      "This activity will push you into overreaching territory (TSB < -30)",
    );
  }

  if (totalWeeklyTSS > currentState.ctl * 1.5) {
    warnings.push(
      `Weekly TSS (${Math.round(totalWeeklyTSS)}) significantly exceeds current fitness level (CTL: ${Math.round(currentState.ctl)})`,
    );
  }

  if (plannedTSS > currentState.ctl * 0.8) {
    warnings.push(
      `This single workout (${Math.round(plannedTSS)} TSS) is very high compared to your fitness level`,
    );
  }

  // Generate recommendation
  const recommendation = generateRecommendation(
    rampRate,
    totalWeeklyTSS,
    currentState,
    newTSB,
    formStatus,
  );

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
      isSafe,
      recommendation,
    },
    recoveryPlan: {
      daysToRecover,
      nextHardWorkoutDate,
      suggestedRestDays,
    },
    warnings,
  };
}

/**
 * Calculate recovery days needed based on TSS and form
 */
function calculateRecoveryDays(tss: number, newTSB: number): number {
  // Base: 1 day per 100 TSS
  let recoveryDays = tss / 100;

  // Adjust for form status
  if (newTSB < -30) {
    recoveryDays *= 1.5; // Need more recovery when overreaching
  } else if (newTSB < -10) {
    recoveryDays *= 1.2; // Slightly more when tired
  }

  return Math.ceil(recoveryDays);
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
  rampRate: number,
  weeklyTSS: number,
  currentState: FitnessState,
  newTSB: number,
  formStatus: FormStatus,
): string {
  // Critical overtraining warning
  if (rampRate > 15) {
    return "⚠️ STOP: Ramp rate is dangerously high. Consider rest or very easy activities.";
  }

  // High ramp rate warning
  if (rampRate > 8) {
    return "Ramp rate exceeds safe limits. Reduce training load or add recovery days.";
  }

  // Overreaching warning
  if (newTSB < -30) {
    return "You're entering overreaching territory. Plan recovery week with 50% reduction in load.";
  }

  // Form-based recommendations
  if (formStatus === "fresh" && rampRate < 5) {
    return "You're well-rested and building fitness safely. Consider maintaining or slightly increasing load.";
  }

  if (formStatus === "optimal") {
    return "Perfect balance of fitness and freshness. Great time for key workouts.";
  }

  if (formStatus === "tired") {
    return "Fatigue is accumulating. Add easy days and ensure adequate recovery.";
  }

  // Weekly load check
  if (weeklyTSS > currentState.ctl * 1.3) {
    return "Weekly load is high relative to fitness. Monitor recovery closely.";
  }

  // Default positive feedback
  return "Training load is appropriate. Continue building fitness gradually.";
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
  // Collect all activities for the week
  const weekActivities = plannedActivities.filter((activity) => {
    const activityDate = new Date(activity.scheduledDate);
    return activityDate <= weekEnd;
  });

  // Add the current activity being planned
  const allActivities = [
    ...weekActivities,
    {
      id: "current",
      scheduledDate: scheduledDate,
      estimatedTSS: additionalTSS,
      name: "Current",
    },
  ];

  // Sort by date
  allActivities.sort(
    (a, b) =>
      new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime(),
  );

  // Project CTL day by day
  let projectedCTL = currentCTL;
  for (const activity of allActivities) {
    projectedCTL = calculateCTL(projectedCTL, activity.estimatedTSS);
  }

  return projectedCTL;
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
  isSafe: boolean;
} {
  const weekEnd = getEndOfWeek(weekStart);

  // Filter activities for this week
  const weekActivities = plannedActivities.filter((activity) => {
    const activityDate = new Date(activity.scheduledDate);
    return activityDate >= weekStart && activityDate <= weekEnd;
  });

  // Calculate total TSS
  const totalTSS = weekActivities.reduce(
    (sum, activity) => sum + activity.estimatedTSS,
    0,
  );

  // Create daily breakdown
  const dailyBreakdown: Array<{ date: Date; tss: number; count: number }> = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStart, i);
    const dayActivities = weekActivities.filter((activity) => {
      const activityDate = new Date(activity.scheduledDate);
      return activityDate.toDateString() === date.toDateString();
    });

    const dayTSS = dayActivities.reduce(
      (sum, activity) => sum + activity.estimatedTSS,
      0,
    );

    dailyBreakdown.push({
      date,
      tss: Math.round(dayTSS),
      count: dayActivities.length,
    });
  }

  // Project end-of-week CTL
  let projectedCTL = currentState.ctl;
  for (const activity of weekActivities) {
    projectedCTL = calculateCTL(projectedCTL, activity.estimatedTSS);
  }

  // Calculate ramp rate
  const rampRate = projectedCTL - currentState.ctl;
  const isSafe = rampRate <= 8;

  return {
    totalTSS: Math.round(totalTSS),
    dailyBreakdown,
    projectedCTL: Math.round(projectedCTL * 10) / 10,
    rampRate: Math.round(rampRate * 10) / 10,
    isSafe,
  };
}
