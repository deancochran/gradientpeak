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
  profile: Profile,
): number {
  if (!profile.ftp) {
    throw new Error("FTP is required for TSS calculation");
  }

  if (movingTime <= 0) {
    return 0;
  }

  const normalizedPower = calculateNormalizedPower(powerStream);
  const ftp = profile.ftp;
  const durationHours = movingTime / 3600; // Convert seconds to hours

  // TSS = (NP/FTP)² × Duration(hours) × 100
  const intensityFactor = normalizedPower / ftp;
  const tss = Math.pow(intensityFactor, 2) * durationHours * 100;

  return Math.round(tss * 10) / 10; // Round to 1 decimal place
}

/**
 * Calculate Training Stress Score for running (rTSS)
 * Uses pace and heart rate data instead of power
 * @param averagePace - Average pace in seconds per kilometer
 * @param thresholdPace - Threshold pace in seconds per kilometer
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

  const durationHours = movingTime / 3600;

  // Intensity Factor for running = Threshold Pace / Average Pace
  const intensityFactor = thresholdPace / averagePace;
  const rTss = Math.pow(intensityFactor, 2) * durationHours * 100;

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

  const durationHours = movingTime / 3600;

  // Intensity Factor for HR = Average HR / Threshold HR
  const intensityFactor = averageHR / thresholdHR;
  const hrTss = Math.pow(intensityFactor, 2) * durationHours * 100;

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

  // Exponential weighted moving averages
  // CTL uses a 42-day time constant (alpha = 1 - e^(-1/42) ≈ 0.0235)
  // ATL uses a 7-day time constant (alpha = 1 - e^(-1/7) ≈ 0.1353)
  const ctlAlpha = 1 - Math.exp(-1 / 42);
  const atlAlpha = 1 - Math.exp(-1 / 7);

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
 * @param plannedTSS - Array of planned TSS values for future days
 * @param days - Number of days to project into the future
 * @returns Projected CTL value
 */
export function projectCTL(
  currentCTL: number,
  plannedTSS: number[],
  days: number,
): number {
  let ctl = currentCTL;
  const ctlAlpha = 1 - Math.exp(-1 / 42);

  for (let i = 0; i < days && i < plannedTSS.length; i++) {
    ctl = plannedTSS[i] * ctlAlpha + ctl * (1 - ctlAlpha);
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
  rampRate: number = 6,
): number {
  // Calculate daily ramp rate
  const dailyRampRate = rampRate / 7;

  // If current CTL is above target, recommend maintenance TSS
  if (currentCTL >= targetCTL) {
    return Math.round(currentCTL);
  }

  // Calculate TSS needed to increase CTL by daily ramp rate
  const ctlAlpha = 1 - Math.exp(-1 / 42);
  const recommendedTSS =
    (currentCTL + dailyRampRate) / ctlAlpha -
    (currentCTL * (1 - ctlAlpha)) / ctlAlpha;

  return Math.round(Math.max(0, recommendedTSS));
}

/**
 * Analyze training load trends
 * @param trainingLoad - Current training load values
 * @returns Analysis object with insights and recommendations
 */
export function analyzeTrainingLoad(trainingLoad: TrainingLoad): {
  fitnessLevel: "low" | "moderate" | "high" | "very_high";
  fatigueLevel: "low" | "moderate" | "high" | "very_high";
  form: "optimal" | "good" | "tired" | "very_tired";
  recommendation: string;
} {
  const { ctl, atl, tsb } = trainingLoad;

  // Determine fitness level based on CTL
  let fitnessLevel: "low" | "moderate" | "high" | "very_high";
  if (ctl < 40) fitnessLevel = "low";
  else if (ctl < 60) fitnessLevel = "moderate";
  else if (ctl < 80) fitnessLevel = "high";
  else fitnessLevel = "very_high";

  // Determine fatigue level based on ATL
  let fatigueLevel: "low" | "moderate" | "high" | "very_high";
  if (atl < 40) fatigueLevel = "low";
  else if (atl < 60) fatigueLevel = "moderate";
  else if (atl < 80) fatigueLevel = "high";
  else fatigueLevel = "very_high";

  // Determine form based on TSB
  let form: "optimal" | "good" | "tired" | "very_tired";
  let recommendation: string;

  if (tsb > 10) {
    form = "optimal";
    recommendation =
      "You are well-rested and ready for high-intensity training or competition.";
  } else if (tsb > -10) {
    form = "good";
    recommendation =
      "Good balance between fitness and fatigue. Maintain current training intensity.";
  } else if (tsb > -30) {
    form = "tired";
    recommendation =
      "You are carrying some fatigue. Consider reducing intensity or adding recovery days.";
  } else {
    form = "very_tired";
    recommendation =
      "High fatigue detected. Focus on recovery and light training until TSB improves.";
  }

  return {
    fitnessLevel,
    fatigueLevel,
    form,
    recommendation,
  };
}
