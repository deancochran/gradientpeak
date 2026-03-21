import {
  getIntensityAdjustedATLTimeConstant,
  type TrainingQualityProfile,
} from "../calculations/training-quality";
import {
  getAgeAdjustedCTLTimeConstant,
  getPersonalizedATLTimeConstant,
} from "../plan/calibration-constants";

export interface TrainingLoadPoint {
  date: number;
  tss: number;
  ctl: number;
  atl: number;
  tsb: number;
}

export interface CTLProjectionConfig {
  startingCTL: number;
  targetCTL: number;
  weeklyTSSAvg: number;
  mesocycles: Array<{
    duration_weeks: number;
    tss_multiplier: number;
  }>;
  recoveryWeekFrequency?: number;
  recoveryWeekReduction?: number;
}

export function calculateCTL(previousCTL: number, todayTSS: number, userAge?: number): number {
  const timeConstant = getAgeAdjustedCTLTimeConstant(userAge);
  const alpha = 2 / (timeConstant + 1);
  return previousCTL + alpha * (todayTSS - previousCTL);
}

export function calculateATL(
  previousATL: number,
  todayTSS: number,
  userAge?: number,
  userGender?: "male" | "female" | null,
  trainingQuality?: TrainingQualityProfile,
): number {
  const baseTimeConstant = getPersonalizedATLTimeConstant(userAge, userGender);
  const timeConstant = getIntensityAdjustedATLTimeConstant(baseTimeConstant, trainingQuality);
  const alpha = 2 / (timeConstant + 1);
  return previousATL + alpha * (todayTSS - previousATL);
}

export function calculateTSB(ctl: number, atl: number): number {
  return ctl - atl;
}

export function calculateTrainingLoadSeries(
  dailyTSS: number[],
  initialCTL = 0,
  initialATL = 0,
  userAge?: number,
  userGender?: "male" | "female" | null,
  trainingQuality?: TrainingQualityProfile,
): TrainingLoadPoint[] {
  const results: TrainingLoadPoint[] = [];

  let currentCTL = initialCTL;
  let currentATL = initialATL;

  dailyTSS.forEach((tss, index) => {
    currentCTL = calculateCTL(currentCTL, tss, userAge);
    currentATL = calculateATL(currentATL, tss, userAge, userGender, trainingQuality);
    const tsb = calculateTSB(currentCTL, currentATL);

    results.push({
      date: index,
      tss,
      ctl: currentCTL,
      atl: currentATL,
      tsb,
    });
  });

  return results;
}

export function projectCTL(currentCTL: number, plannedDailyTSS: number[]): number {
  let projectedCTL = currentCTL;
  for (const tss of plannedDailyTSS) {
    projectedCTL = calculateCTL(projectedCTL, tss);
  }
  return projectedCTL;
}

export function calculateTargetDailyTSS(
  currentCTL: number,
  targetCTL: number,
  daysToTarget: number,
): number {
  const ctlGap = targetCTL - currentCTL;
  const dailyIncrease = ctlGap / daysToTarget;
  const alpha = 2 / (getAgeAdjustedCTLTimeConstant(undefined) + 1);
  return currentCTL + dailyIncrease / alpha;
}

export function calculateCTLProjection(
  config: CTLProjectionConfig,
): Array<{ week: number; ctl: number; date: string }> {
  const {
    startingCTL,
    targetCTL,
    weeklyTSSAvg,
    mesocycles,
    recoveryWeekFrequency = 3,
    recoveryWeekReduction = 0.5,
  } = config;

  let currentCTL = startingCTL;
  const points: Array<{ week: number; ctl: number; date: string }> = [];
  let weekCounter = 0;
  const startDate = new Date();

  points.push({
    week: 0,
    ctl: startingCTL,
    date: startDate.toISOString().split("T")[0]!,
  });

  for (const mesocycle of mesocycles) {
    for (let week = 0; week < mesocycle.duration_weeks; week += 1) {
      weekCounter += 1;
      const isRecoveryWeek = weekCounter % recoveryWeekFrequency === 0;
      const adjustedWeeklyTSS = isRecoveryWeek
        ? weeklyTSSAvg * recoveryWeekReduction
        : weeklyTSSAvg * mesocycle.tss_multiplier;
      const dailyTSS = adjustedWeeklyTSS / 7;

      for (let day = 0; day < 7; day += 1) {
        currentCTL = calculateCTL(currentCTL, dailyTSS);
      }

      currentCTL = Math.min(currentCTL, targetCTL);

      const weekDate = new Date(startDate);
      weekDate.setDate(startDate.getDate() + weekCounter * 7);
      points.push({
        week: weekCounter,
        ctl: Math.round(currentCTL * 10) / 10,
        date: weekDate.toISOString().split("T")[0]!,
      });
    }
  }

  return points;
}
