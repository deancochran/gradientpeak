import {
  FATIGUE_LEVEL_THRESHOLDS,
  FITNESS_LEVEL_THRESHOLDS,
  TIME_CONSTANTS,
  TRAINING_RECOMMENDATIONS,
  TSB_THRESHOLDS,
  TSS_CONSTANTS,
} from "../constants";
import type {
  ActivityStream,
  TSSHistoryEntry,
  TrainingLoad,
  TrainingLoadAnalysis,
} from "../types";
import { calculateNormalizedPower } from "./power";

/**
 * Calculate Training Stress Score (TSS)
 * @param powerStream - Activity stream containing power data
 * @param movingTime - Moving time in seconds
 * @param profile - User profile containing FTP
 * @returns TSS value
 */
export function calculateTSS(
  powerStream: ActivityStream,
  movingTime: number,
  ftp: number,
): number {
  if (movingTime <= 0) {
    return 0;
  }

  const normalizedPower = calculateNormalizedPower(powerStream);
  const durationHours = movingTime / TIME_CONSTANTS.SECONDS_PER_HOUR;

  // TSS = (NP/FTP)² × Duration(hours) × 100
  const intensityFactor = normalizedPower / ftp;
  const tss =
    Math.pow(intensityFactor, 2) *
    durationHours *
    TSS_CONSTANTS.BASE_TSS_MULTIPLIER;

  return Math.round(tss * 10) / 10; // Round to 1 decimal place
}

/**
 * Calculate Training Stress Score for running (rTSS)
 * Uses speed and heart rate data instead of power
 * @param averagePace - Average speed in seconds per kilometer
 * @param thresholdPace - Threshold speed in seconds per kilometer
 * @param movingTime - Moving time in seconds
 * @returns rTSS value
 */
export function calculateRunningTSS(
  averagePace: number,
  thresholdPace: number,
  movingTime: number,
): number {
  if (thresholdPace <= 0 || movingTime <= 0) {
    return 0;
  }

  const durationHours = movingTime / TIME_CONSTANTS.SECONDS_PER_HOUR;

  // Intensity Factor for running = Threshold Pace / Average Pace
  const intensityFactor = thresholdPace / averagePace;
  const rTss =
    Math.pow(intensityFactor, 2) *
    durationHours *
    TSS_CONSTANTS.BASE_TSS_MULTIPLIER;

  return Math.round(rTss * 10) / 10;
}

/**
 * Calculate Heart Rate based TSS (hrTSS)
 * @param averageHR - Average heart rate for the activity
 * @param thresholdHR - Lactate threshold heart rate
 * @param movingTime - Moving time in seconds
 * @returns hrTSS value
 */
export function calculateHeartRateTSS(
  averageHR: number,
  thresholdHR: number,
  movingTime: number,
): number {
  if (thresholdHR <= 0 || movingTime <= 0) {
    return 0;
  }

  const durationHours = movingTime / TIME_CONSTANTS.SECONDS_PER_HOUR;

  // Intensity Factor for HR = Average HR / Threshold HR
  const intensityFactor = averageHR / thresholdHR;
  const hrTss =
    Math.pow(intensityFactor, 2) *
    durationHours *
    TSS_CONSTANTS.BASE_TSS_MULTIPLIER;

  return Math.round(hrTss * 10) / 10;
}

/**
 * Calculate Chronic Training Load (CTL), Acute Training Load (ATL), and Training Stress Balance (TSB)
 * @param tssHistory - Array of TSS values with dates (should be sorted by date ascending)
 * @param targetDate - Date to calculate training load for (defaults to today)
 * @returns Training load object with CTL, ATL, and TSB
 */
export function calculateTrainingLoad(
  tssHistory: TSSHistoryEntry[],
  targetDate: Date = new Date(),
): TrainingLoad {
  if (tssHistory.length === 0) {
    return { ctl: 0, atl: 0, tsb: 0 };
  }

  // Sort by date ascending to ensure proper calculation
  const sortedHistory = tssHistory
    .filter((entry) => entry.date <= targetDate)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  if (sortedHistory.length === 0) {
    return { ctl: 0, atl: 0, tsb: 0 };
  }

  let ctl = 0;
  let atl = 0;

  // Exponential weighted moving averages using constants
  const ctlAlpha = TSS_CONSTANTS.CTL_ALPHA;
  const atlAlpha = TSS_CONSTANTS.ATL_ALPHA;

  for (const entry of sortedHistory) {
    // Update CTL: exponential weighted moving average with 42-day time constant
    ctl = entry.tss * ctlAlpha + ctl * (1 - ctlAlpha);

    // Update ATL: exponential weighted moving average with 7-day time constant
    atl = entry.tss * atlAlpha + atl * (1 - atlAlpha);
  }

  // TSB = CTL - ATL (Training Stress Balance)
  const tsb = ctl - atl;

  return {
    ctl: Math.round(ctl * 10) / 10,
    atl: Math.round(atl * 10) / 10,
    tsb: Math.round(tsb * 10) / 10,
  };
}

/**
 * Project future CTL based on planned training
 * @param currentCTL - Current CTL value
 * @param plannedTSS - Daily planned TSS values for future days
 * @param days - Number of days to project into the future
 * @returns Projected CTL value
 */
export function projectCTL(
  currentCTL: number,
  plannedTSS: number,
  days: number,
): number {
  let ctl = currentCTL;
  const ctlAlpha = TSS_CONSTANTS.CTL_ALPHA;

  for (let i = 0; i < days; i++) {
    ctl = plannedTSS * ctlAlpha + ctl * (1 - ctlAlpha);
  }

  return Math.round(ctl * 10) / 10;
}

/**
 * Calculate recommended TSS for a given day based on current training load
 * @param currentCTL - Current CTL value
 * @param currentATL - Current ATL value
 * @param targetCTL - Target CTL to reach
 * @param rampRate - Weekly CTL increase rate (default: 5-7 TSS/week)
 * @returns Recommended TSS for the day
 */
export function calculateRecommendedTSS(
  currentCTL: number,
  currentATL: number,
  targetCTL: number,
  rampRate: number = TRAINING_RECOMMENDATIONS.DEFAULT_RAMP_RATE,
): number {
  // Calculate daily ramp rate
  const dailyRampRate = rampRate / 7;

  // If current CTL is above target, recommend maintenance TSS
  if (currentCTL >= targetCTL) {
    return Math.round(currentCTL);
  }

  // Calculate TSS needed to increase CTL by daily ramp rate
  const ctlAlpha = TSS_CONSTANTS.CTL_ALPHA;
  const recommendedTSS =
    (currentCTL + dailyRampRate) / ctlAlpha -
    (currentCTL * (1 - ctlAlpha)) / ctlAlpha;

  return Math.round(Math.max(0, recommendedTSS));
}

/**
 * Analyze training load trends with comprehensive data
 * @param tssHistory - Array of TSS history entries for analysis
 * @returns Complete training load analysis
 */
export function analyzeTrainingLoad(
  tssHistory: TSSHistoryEntry[],
): TrainingLoadAnalysis {
  const currentLoad = calculateTrainingLoad(tssHistory);
  const { ctl, atl, tsb } = currentLoad;

  // Determine fitness level based on CTL using constants
  let fitnessLevel: "low" | "moderate" | "high" | "very_high";
  if (ctl < FITNESS_LEVEL_THRESHOLDS.LOW) fitnessLevel = "low";
  else if (ctl < FITNESS_LEVEL_THRESHOLDS.MODERATE) fitnessLevel = "moderate";
  else if (ctl < FITNESS_LEVEL_THRESHOLDS.HIGH) fitnessLevel = "high";
  else fitnessLevel = "very_high";

  // Determine fatigue level based on ATL using constants
  let fatigueLevel: "low" | "moderate" | "high" | "very_high";
  if (atl < FATIGUE_LEVEL_THRESHOLDS.LOW) fatigueLevel = "low";
  else if (atl < FATIGUE_LEVEL_THRESHOLDS.MODERATE) fatigueLevel = "moderate";
  else if (atl < FATIGUE_LEVEL_THRESHOLDS.HIGH) fatigueLevel = "high";
  else fatigueLevel = "very_high";

  // Determine form based on TSB using constants
  let form: "optimal" | "good" | "tired" | "very_tired";
  let recommendation: string;

  if (tsb > TSB_THRESHOLDS.OPTIMAL) {
    form = "optimal";
    recommendation =
      "You are well-rested and ready for high-intensity training or competition.";
  } else if (tsb > TSB_THRESHOLDS.GOOD) {
    form = "good";
    recommendation =
      "Good balance between fitness and fatigue. Maintain current training intensity.";
  } else if (tsb > TSB_THRESHOLDS.TIRED) {
    form = "tired";
    recommendation =
      "You are carrying some fatigue. Consider reducing intensity or adding recovery days.";
  } else {
    form = "very_tired";
    recommendation =
      "High fatigue detected. Focus on recovery and light training until TSB improves.";
  }

  // Calculate ramp rate from recent history
  const recentEntries = tssHistory.slice(-7); // Last 7 days
  const rampRate =
    recentEntries.length > 0
      ? (recentEntries.reduce((sum, entry) => sum + entry.tss, 0) / 7) * 7 // Weekly average
      : 0;

  return {
    ...currentLoad,
    fitnessLevel,
    fatigueLevel,
    form,
    recommendation,
    rampRate,
    history: tssHistory,
    currentCTL: ctl,
    currentATL: atl,
    currentTSB: tsb,
  };
}
