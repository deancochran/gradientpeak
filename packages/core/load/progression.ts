import {
  getIntensityAdjustedRecentLoadTimeConstant,
  type TrainingQualityProfile,
} from "../calculations/training-quality";
import {
  getAgeAdjustedLongTermLoadTimeConstant,
  getPersonalizedRecentLoadTimeConstant,
} from "../plan/calibration-constants";

export interface CommonLoadFitnessPoint {
  date: number;
  load: number;
  longTermLoad: number;
  recentLoad: number;
  loadBalance: number;
}

export interface LongTermLoadProjectionConfig {
  startingLongTermLoad: number;
  targetLongTermLoad: number;
  weeklyLoadAverage: number;
  mesocycles: Array<{
    duration_weeks: number;
    load_multiplier: number;
  }>;
  recoveryWeekFrequency?: number;
  recoveryWeekReduction?: number;
}

/** Convert an exponential time constant in days to its one-day smoothing factor. */
function alphaForTimeConstant(timeConstant: number): number {
  return 1 - Math.exp(-1 / timeConstant);
}

export function calculateLongTermLoad(
  previousLongTermLoad: number,
  todayLoad: number,
  userAge?: number,
): number {
  const timeConstant = getAgeAdjustedLongTermLoadTimeConstant(userAge);
  const alpha = alphaForTimeConstant(timeConstant);
  return previousLongTermLoad + alpha * (todayLoad - previousLongTermLoad);
}

export function calculateRecentLoad(
  previousRecentLoad: number,
  todayLoad: number,
  userAge?: number,
  userGender?: "male" | "female" | null,
  trainingQuality?: TrainingQualityProfile,
): number {
  const baseTimeConstant = getPersonalizedRecentLoadTimeConstant(userAge, userGender);
  const timeConstant = getIntensityAdjustedRecentLoadTimeConstant(
    baseTimeConstant,
    trainingQuality,
  );
  const alpha = alphaForTimeConstant(timeConstant);
  return previousRecentLoad + alpha * (todayLoad - previousRecentLoad);
}

export function calculateLoadBalance(longTermLoad: number, recentLoad: number): number {
  return longTermLoad - recentLoad;
}

export function calculateCommonLoadFitnessSeries(
  dailyLoad: number[],
  initialLongTermLoad = 0,
  initialRecentLoad = 0,
  userAge?: number,
  userGender?: "male" | "female" | null,
  trainingQuality?: TrainingQualityProfile,
): CommonLoadFitnessPoint[] {
  const results: CommonLoadFitnessPoint[] = [];

  let currentLongTermLoad = initialLongTermLoad;
  let currentRecentLoad = initialRecentLoad;

  dailyLoad.forEach((load, index) => {
    currentLongTermLoad = calculateLongTermLoad(currentLongTermLoad, load, userAge);
    currentRecentLoad = calculateRecentLoad(
      currentRecentLoad,
      load,
      userAge,
      userGender,
      trainingQuality,
    );
    const loadBalance = calculateLoadBalance(currentLongTermLoad, currentRecentLoad);

    results.push({
      date: index,
      load,
      longTermLoad: currentLongTermLoad,
      recentLoad: currentRecentLoad,
      loadBalance,
    });
  });

  return results;
}

export function projectLongTermLoad(
  currentLongTermLoad: number,
  plannedDailyLoad: number[],
): number {
  let projectedLongTermLoad = currentLongTermLoad;
  for (const load of plannedDailyLoad) {
    projectedLongTermLoad = calculateLongTermLoad(projectedLongTermLoad, load);
  }
  return projectedLongTermLoad;
}

export function calculateTargetDailyLoad(
  currentLongTermLoad: number,
  targetLongTermLoad: number,
  daysToTarget: number,
): number {
  const longTermLoadGap = targetLongTermLoad - currentLongTermLoad;
  const dailyIncrease = longTermLoadGap / daysToTarget;
  const alpha = alphaForTimeConstant(getAgeAdjustedLongTermLoadTimeConstant(undefined));
  return currentLongTermLoad + dailyIncrease / alpha;
}

export function calculateLongTermLoadProjection(
  config: LongTermLoadProjectionConfig,
): Array<{ week: number; longTermLoad: number; date: string }> {
  const {
    startingLongTermLoad,
    targetLongTermLoad,
    weeklyLoadAverage,
    mesocycles,
    recoveryWeekFrequency = 3,
    recoveryWeekReduction = 0.5,
  } = config;

  let currentLongTermLoad = startingLongTermLoad;
  const points: Array<{ week: number; longTermLoad: number; date: string }> = [];
  let weekCounter = 0;
  const startDate = new Date();

  points.push({
    week: 0,
    longTermLoad: startingLongTermLoad,
    date: startDate.toISOString().split("T")[0]!,
  });

  for (const mesocycle of mesocycles) {
    for (let week = 0; week < mesocycle.duration_weeks; week += 1) {
      weekCounter += 1;
      const isRecoveryWeek = weekCounter % recoveryWeekFrequency === 0;
      const adjustedWeeklyLoad = isRecoveryWeek
        ? weeklyLoadAverage * recoveryWeekReduction
        : weeklyLoadAverage * mesocycle.load_multiplier;
      const dailyLoad = adjustedWeeklyLoad / 7;

      for (let day = 0; day < 7; day += 1) {
        currentLongTermLoad = calculateLongTermLoad(currentLongTermLoad, dailyLoad);
      }

      currentLongTermLoad = Math.min(currentLongTermLoad, targetLongTermLoad);

      const weekDate = new Date(startDate);
      weekDate.setDate(startDate.getDate() + weekCounter * 7);
      points.push({
        week: weekCounter,
        longTermLoad: Math.round(currentLongTermLoad * 10) / 10,
        date: weekDate.toISOString().split("T")[0]!,
      });
    }
  }

  return points;
}
