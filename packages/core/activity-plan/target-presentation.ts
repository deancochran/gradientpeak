import type { AthletePerformanceTargetFacts } from "../performance-model";
import type { CanonicalActivityCategory } from "../schemas/activity-category";
import type { ActivityPlanTarget } from "./structure-schema";

export type ActivityPlanTargetPresentation =
  | { kind: "exact_authored"; label: string; sourceLabel: string }
  | { kind: "exact_personalized"; label: string; sourceLabel: string }
  | { kind: "abstract"; label: string; sourceLabel: string };

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value);
}

function abstractLabel(target: ActivityPlanTarget): string {
  switch (target.type) {
    case "%FTP":
      return `${formatNumber(target.intensity)}% FTP`;
    case "%ThresholdHR":
      return `${formatNumber(target.intensity)}% Threshold HR`;
    case "%MaxHR":
      return `${formatNumber(target.intensity)}% Max HR`;
    case "watts":
      return `${formatNumber(target.intensity)} W`;
    case "bpm":
      return `${formatNumber(target.intensity)} bpm`;
    case "speed":
      return `${formatNumber(target.intensity)} km/h`;
    case "cadence":
      return `${formatNumber(target.intensity)} rpm`;
    case "RPE":
      return `${formatNumber(target.intensity)} RPE`;
  }
}

function isConfirmedHeartRate(
  fact: { status: string; calibrationState: string; expiresAt: string | null },
  asOf: string,
): boolean {
  return (
    fact.status === "available" &&
    fact.calibrationState === "confirmed" &&
    (fact.expiresAt === null || Date.parse(fact.expiresAt) >= Date.parse(asOf))
  );
}

function isConfirmedThreshold(fact: AthletePerformanceTargetFacts["thresholds"]["bike"]): boolean {
  return fact.status === "available" && fact.state === "confirmed" && fact.freshness === "fresh";
}

/**
 * Presents authored plan targets without exposing a personalized conversion until
 * its underlying calibration is confirmed and current at the supplied instant.
 */
export function resolveActivityPlanTargetPresentation(input: {
  target: ActivityPlanTarget;
  activityCategory: CanonicalActivityCategory;
  performanceTargets?: AthletePerformanceTargetFacts | null;
  asOf: string;
}): ActivityPlanTargetPresentation {
  const sourceLabel = abstractLabel(input.target);
  const { performanceTargets, target } = input;

  if (target.type === "%FTP" && input.activityCategory === "bike") {
    const fact = performanceTargets?.thresholds.bike;
    if (fact && isConfirmedThreshold(fact) && typeof fact.value === "number") {
      return {
        kind: "exact_personalized",
        label: `${formatNumber((fact.value * target.intensity) / 100)} W (${sourceLabel})`,
        sourceLabel,
      };
    }
  }

  if (target.type === "%ThresholdHR" || target.type === "%MaxHR") {
    const category =
      input.activityCategory === "bike" ||
      input.activityCategory === "run" ||
      input.activityCategory === "swim"
        ? input.activityCategory
        : null;
    const fact = category
      ? performanceTargets?.heartRate[category][target.type === "%ThresholdHR" ? "lthr" : "maxHr"]
      : undefined;
    if (fact && isConfirmedHeartRate(fact, input.asOf) && typeof fact.valueBpm === "number") {
      return {
        kind: "exact_personalized",
        label: `${formatNumber((fact.valueBpm * target.intensity) / 100)} bpm (${sourceLabel})`,
        sourceLabel,
      };
    }
  }

  if (target.type === "%FTP" || target.type === "%ThresholdHR" || target.type === "%MaxHR") {
    return { kind: "abstract", label: sourceLabel, sourceLabel };
  }
  return { kind: "exact_authored", label: sourceLabel, sourceLabel };
}
