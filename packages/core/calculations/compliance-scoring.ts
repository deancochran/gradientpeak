import type { PlannedActivityStructure, Step } from "../schemas/planned_activity";
import type { ActivityTypeId } from "../types/activity-types";
import { getCurrentStep } from "./schema-navigation";

/**
 * Compliance Scoring for Post-Activity Analysis
 *
 * Compares planned activity metrics against actual recorded metrics
 * to generate compliance scores and detailed analysis.
 */

export interface ActivityMetrics {
  /** Total duration in seconds */
  duration: number;

  /** Total distance in meters (if applicable) */
  distance?: number;

  /** Training Stress Score */
  tss?: number;

  /** Average power in watts (if applicable) */
  avgPower?: number;

  /** Normalized power in watts (if applicable) */
  normalizedPower?: number;

  /** Average heart rate in bpm (if applicable) */
  avgHeartRate?: number;

  /** Average cadence in rpm/spm (if applicable) */
  avgCadence?: number;

  /** Average pace in seconds per kilometer (if applicable) */
  avgPace?: number;

  /** Average speed in meters per second (if applicable) */
  avgSpeed?: number;

  /** Time-series data for detailed analysis */
  powerData?: number[];
  heartRateData?: number[];
  cadenceData?: number[];
  paceData?: number[];
}

export interface PlannedMetrics {
  /** Estimated duration from planned activity */
  estimatedDuration: number;

  /** Estimated TSS from planned activity */
  estimatedTSS?: number;

  /** Target average power (if applicable) */
  targetAvgPower?: number;

  /** Target average heart rate (if applicable) */
  targetAvgHeartRate?: number;

  /** Activity type for context */
  activityType: ActivityTypeId;
}

export interface StepCompliance {
  /** Step position in workout structure */
  position: number[];

  /** Step name or description */
  stepName?: string;

  /** Planned step definition */
  plannedStep: Step;

  /** Duration compliance (0-100%) */
  durationCompliance: number;

  /** Intensity compliance (0-100%) if applicable */
  intensityCompliance?: number;

  /** Overall step compliance score (0-100%) */
  overallCompliance: number;

  /** Detailed compliance notes */
  notes: string[];
}

export interface ComplianceAnalysis {
  /** Overall compliance score (0-100%) */
  overallScore: number;

  /** Duration compliance (0-100%) */
  durationCompliance: number;

  /** TSS compliance (0-100%) if applicable */
  tssCompliance?: number;

  /** Average intensity compliance (0-100%) if applicable */
  avgIntensityCompliance?: number;

  /** Step-by-step compliance breakdown */
  stepCompliances: StepCompliance[];

  /** Summary analysis and recommendations */
  summary: {
    strengths: string[];
    areasForImprovement: string[];
    recommendations: string[];
  };

  /** Raw comparison metrics */
  comparison: {
    planned: PlannedMetrics;
    actual: ActivityMetrics;
    deltas: {
      durationDelta: number; // seconds
      tssDelta?: number;
      powerDelta?: number; // watts
      heartRateDelta?: number; // bpm
    };
  };
}

/**
 * Calculate overall compliance score for a completed activity.
 */
export function calculateComplianceScore(
  plannedActivity: PlannedActivityStructure,
  plannedMetrics: PlannedMetrics,
  actualMetrics: ActivityMetrics,
  userFTP?: number,
  userThresholdHR?: number,
): ComplianceAnalysis {

  // Calculate duration compliance
  const durationCompliance = calculateDurationCompliance(
    plannedMetrics.estimatedDuration,
    actualMetrics.duration
  );

  // Calculate TSS compliance if both values are available
  const tssCompliance = plannedMetrics.estimatedTSS && actualMetrics.tss
    ? calculateTSSCompliance(plannedMetrics.estimatedTSS, actualMetrics.tss)
    : undefined;

  // Calculate step-by-step compliance
  const stepCompliances = calculateStepCompliances(
    plannedActivity,
    actualMetrics,
    userFTP,
    userThresholdHR
  );

  // Calculate average intensity compliance from steps
  const avgIntensityCompliance = stepCompliances.length > 0
    ? stepCompliances
        .filter(sc => sc.intensityCompliance !== undefined)
        .reduce((sum, sc) => sum + (sc.intensityCompliance || 0), 0) /
      stepCompliances.filter(sc => sc.intensityCompliance !== undefined).length
    : undefined;

  // Calculate overall score (weighted average)
  const overallScore = calculateOverallScore({
    durationCompliance,
    tssCompliance,
    avgIntensityCompliance,
    stepCompliances
  });

  // Generate summary analysis
  const summary = generateSummaryAnalysis({
    durationCompliance,
    tssCompliance,
    avgIntensityCompliance,
    overallScore,
    plannedMetrics,
    actualMetrics
  });

  return {
    overallScore,
    durationCompliance,
    tssCompliance,
    avgIntensityCompliance,
    stepCompliances,
    summary,
    comparison: {
      planned: plannedMetrics,
      actual: actualMetrics,
      deltas: {
        durationDelta: actualMetrics.duration - plannedMetrics.estimatedDuration,
        tssDelta: actualMetrics.tss && plannedMetrics.estimatedTSS
          ? actualMetrics.tss - plannedMetrics.estimatedTSS
          : undefined,
        powerDelta: actualMetrics.avgPower && plannedMetrics.targetAvgPower
          ? actualMetrics.avgPower - plannedMetrics.targetAvgPower
          : undefined,
        heartRateDelta: actualMetrics.avgHeartRate && plannedMetrics.targetAvgHeartRate
          ? actualMetrics.avgHeartRate - plannedMetrics.targetAvgHeartRate
          : undefined,
      }
    }
  };
}

/**
 * Calculate duration compliance score (0-100%).
 */
function calculateDurationCompliance(plannedDuration: number, actualDuration: number): number {
  if (plannedDuration <= 0) return 100;

  const ratio = actualDuration / plannedDuration;

  // Perfect compliance at exactly planned duration
  if (ratio === 1.0) return 100;

  // Penalty increases as deviation increases
  // Within 5%: 90-100%
  // Within 10%: 80-90%
  // Within 20%: 60-80%
  // Beyond 20%: below 60%

  const deviation = Math.abs(ratio - 1.0);

  if (deviation <= 0.05) {
    return 100 - (deviation / 0.05) * 10; // 90-100%
  } else if (deviation <= 0.10) {
    return 90 - ((deviation - 0.05) / 0.05) * 10; // 80-90%
  } else if (deviation <= 0.20) {
    return 80 - ((deviation - 0.10) / 0.10) * 20; // 60-80%
  } else {
    return Math.max(0, 60 - (deviation - 0.20) * 100); // Below 60%
  }
}

/**
 * Calculate TSS compliance score (0-100%).
 */
function calculateTSSCompliance(plannedTSS: number, actualTSS: number): number {
  if (plannedTSS <= 0) return 100;

  const ratio = actualTSS / plannedTSS;

  // TSS compliance is more forgiving for going over target
  // Under target is penalized more than over target

  if (ratio >= 1.0) {
    // Going over target
    const excess = ratio - 1.0;
    if (excess <= 0.10) return 100 - excess * 50; // 95-100%
    else if (excess <= 0.25) return 95 - (excess - 0.10) * 200; // 65-95%
    else return Math.max(0, 65 - (excess - 0.25) * 100); // Below 65%
  } else {
    // Under target
    const deficit = 1.0 - ratio;
    if (deficit <= 0.05) return 100 - deficit * 100; // 95-100%
    else if (deficit <= 0.15) return 95 - (deficit - 0.05) * 300; // 65-95%
    else return Math.max(0, 65 - (deficit - 0.15) * 100); // Below 65%
  }
}

/**
 * Calculate step-by-step compliance scores.
 */
function calculateStepCompliances(
  plannedActivity: PlannedActivityStructure,
  actualMetrics: ActivityMetrics,
  userFTP?: number,
  userThresholdHR?: number
): StepCompliance[] {
  const stepCompliances: StepCompliance[] = [];

  // For now, we'll do a simplified analysis
  // In a full implementation, this would require matching time periods
  // in the actual data to the planned steps

  let currentPosition = [0];
  let stepIndex = 0;

  while (stepIndex < plannedActivity.steps.length) {
    const step = getCurrentStep(plannedActivity, currentPosition);
    if (!step) break;

    const stepCompliance: StepCompliance = {
      position: [...currentPosition],
      stepName: step.name || `Step ${stepIndex + 1}`,
      plannedStep: step,
      durationCompliance: 85, // Placeholder - would calculate from actual data
      intensityCompliance: step.target ? 80 : undefined, // Placeholder
      overallCompliance: 85, // Placeholder
      notes: []
    };

    if (step.duration?.type === "time") {
      stepCompliance.notes.push(`Planned duration: ${step.duration.value}s`);
    }

    if (step.target) {
      stepCompliance.notes.push(`Target: ${step.target.target} ${step.target.type}`);
    }

    stepCompliances.push(stepCompliance);
    stepIndex++;
    currentPosition = [stepIndex];
  }

  return stepCompliances;
}

/**
 * Calculate weighted overall compliance score.
 */
function calculateOverallScore(metrics: {
  durationCompliance: number;
  tssCompliance?: number;
  avgIntensityCompliance?: number;
  stepCompliances: StepCompliance[];
}): number {
  let totalWeight = 0;
  let weightedSum = 0;

  // Duration compliance (30% weight)
  weightedSum += metrics.durationCompliance * 0.3;
  totalWeight += 0.3;

  // TSS compliance (25% weight if available)
  if (metrics.tssCompliance !== undefined) {
    weightedSum += metrics.tssCompliance * 0.25;
    totalWeight += 0.25;
  }

  // Average intensity compliance (25% weight if available)
  if (metrics.avgIntensityCompliance !== undefined) {
    weightedSum += metrics.avgIntensityCompliance * 0.25;
    totalWeight += 0.25;
  }

  // Step consistency (remaining weight)
  const remainingWeight = 1.0 - totalWeight;
  if (metrics.stepCompliances.length > 0) {
    const avgStepCompliance = metrics.stepCompliances.reduce(
      (sum, sc) => sum + sc.overallCompliance, 0
    ) / metrics.stepCompliances.length;

    weightedSum += avgStepCompliance * remainingWeight;
  }

  return Math.round(weightedSum);
}

/**
 * Generate summary analysis with strengths, improvements, and recommendations.
 */
function generateSummaryAnalysis(data: {
  durationCompliance: number;
  tssCompliance?: number;
  avgIntensityCompliance?: number;
  overallScore: number;
  plannedMetrics: PlannedMetrics;
  actualMetrics: ActivityMetrics;
}): {
  strengths: string[];
  areasForImprovement: string[];
  recommendations: string[];
} {

  const strengths: string[] = [];
  const areasForImprovement: string[] = [];
  const recommendations: string[] = [];

  // Duration analysis
  if (data.durationCompliance >= 90) {
    strengths.push("Excellent duration adherence to planned workout");
  } else if (data.durationCompliance >= 75) {
    strengths.push("Good duration compliance with planned workout");
  } else {
    areasForImprovement.push("Duration significantly different from planned workout");

    const durationDelta = data.actualMetrics.duration - data.plannedMetrics.estimatedDuration;
    if (durationDelta > 0) {
      recommendations.push("Consider planning slightly longer workouts or improving pacing");
    } else {
      recommendations.push("Focus on completing full planned workout duration");
    }
  }

  // TSS analysis
  if (data.tssCompliance !== undefined) {
    if (data.tssCompliance >= 85) {
      strengths.push("Training stress closely matched planned workout");
    } else {
      areasForImprovement.push("Training stress did not match planned intensity");
      recommendations.push("Focus on hitting target power/heart rate zones more consistently");
    }
  }

  // Intensity analysis
  if (data.avgIntensityCompliance !== undefined) {
    if (data.avgIntensityCompliance >= 80) {
      strengths.push("Good adherence to intensity targets");
    } else {
      areasForImprovement.push("Intensity targets not consistently met");
      recommendations.push("Practice maintaining target zones during intervals");
    }
  }

  // Overall score analysis
  if (data.overallScore >= 85) {
    strengths.push("Excellent overall workout execution");
  } else if (data.overallScore >= 70) {
    strengths.push("Good workout execution with room for improvement");
  } else {
    areasForImprovement.push("Significant gaps between planned and executed workout");
    recommendations.push("Consider adjusting workout difficulty or improving execution focus");
  }

  return { strengths, areasForImprovement, recommendations };
}

/**
 * Create sample planned metrics for testing purposes.
 */
export function createSamplePlannedMetrics(): PlannedMetrics {
  return {
    estimatedDuration: 3600, // 60 minutes
    estimatedTSS: 75,
    targetAvgPower: 200,
    targetAvgHeartRate: 150,
    activityType: "indoor_cycling" as ActivityTypeId,
  };
}

/**
 * Create sample actual metrics for testing purposes.
 */
export function createSampleActualMetrics(): ActivityMetrics {
  return {
    duration: 3540, // 59 minutes (slightly under)
    distance: 25000, // 25km
    tss: 72,
    avgPower: 195,
    normalizedPower: 205,
    avgHeartRate: 155,
    avgCadence: 85,
    avgSpeed: 7.04, // ~25.3 km/h
  };
}
