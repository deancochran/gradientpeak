import { z } from "zod";

import {
  metersPerSecondToSecondsPer100Meters,
  metersPerSecondToSecondsPerKilometer,
} from "../units";
import {
  type AthletePerformanceTargetFacts,
  athletePerformanceTargetFactsSchema,
} from "./projections";

const overviewConfidenceSchema = z.enum(["high", "medium", "low", "unavailable"]);
const overviewFreshnessSchema = z.enum(["current", "stale", "unavailable"]);
const usableConfidenceSchema = overviewConfidenceSchema.exclude(["unavailable"]);
const displayValueSchema = z.string().trim().min(1).max(80);
const athleteGuidanceSchema = z.string().trim().min(1).max(200);

const overviewGuidanceShape = {
  trainingImpact: athleteGuidanceSchema,
  action: athleteGuidanceSchema.nullable(),
};

/** One athlete-safe canonical target display fact. */
export const athletePerformanceOverviewItemSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("available"),
      value: displayValueSchema,
      confidence: usableConfidenceSchema,
      freshness: overviewFreshnessSchema.exclude(["unavailable"]),
      ...overviewGuidanceShape,
    })
    .strict(),
  z
    .object({
      status: z.literal("unavailable"),
      value: z.null(),
      confidence: z.literal("unavailable"),
      freshness: overviewFreshnessSchema.exclude(["current"]),
      ...overviewGuidanceShape,
    })
    .strict(),
]);

const categoryHeartRateOverviewSchema = z
  .object({
    lthr: athletePerformanceOverviewItemSchema,
    maxHeartRate: athletePerformanceOverviewItemSchema,
  })
  .strict();

/** Canonical target overview; capability models are intentionally not projected here. */
export const athletePerformanceOverviewSchema = z
  .object({
    thresholds: z
      .object({
        bike: athletePerformanceOverviewItemSchema,
        run: athletePerformanceOverviewItemSchema,
        swim: athletePerformanceOverviewItemSchema,
      })
      .strict(),
    heartRate: z
      .object({
        bike: categoryHeartRateOverviewSchema,
        run: categoryHeartRateOverviewSchema,
        swim: categoryHeartRateOverviewSchema,
      })
      .strict(),
  })
  .strict();

const TARGETS_UNCHANGED = "Training targets stay unchanged.";
const MORE_ACTIVITY_DATA = "Record more activity data.";
const MORE_RECENT_ACTIVITY_DATA = "Record more recent activity data.";

function formatInteger(value: number): string {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function formatPace(seconds: number, suffix: string): string {
  const rounded = Math.round(seconds);
  const minutes = Math.floor(rounded / 60);
  const remainder = String(rounded % 60).padStart(2, "0");
  return `${minutes}:${remainder} ${suffix}`;
}

function unavailableItem(freshness: "stale" | "unavailable"): AthletePerformanceOverviewItem {
  return {
    status: "unavailable",
    value: null,
    confidence: "unavailable",
    freshness,
    trainingImpact: TARGETS_UNCHANGED,
    action: freshness === "stale" ? MORE_RECENT_ACTIVITY_DATA : MORE_ACTIVITY_DATA,
  };
}

function confidence(value: number): "high" | "medium" | "low" {
  return value >= 0.75 ? "high" : value >= 0.5 ? "medium" : "low";
}

function thresholdOverview(
  threshold: AthletePerformanceTargetFacts["thresholds"]["bike"],
  input: { formatValue: (value: number) => string; trainingImpact: string },
): AthletePerformanceOverviewItem {
  if (threshold.status === "unavailable") return unavailableItem("unavailable");
  return {
    status: "available",
    value: input.formatValue(threshold.value),
    confidence: confidence(threshold.confidence),
    freshness: threshold.freshness === "stale" ? "stale" : "current",
    trainingImpact: input.trainingImpact,
    action: threshold.freshness === "stale" ? MORE_RECENT_ACTIVITY_DATA : null,
  };
}

function heartRateOverview(
  fact: AthletePerformanceTargetFacts["heartRate"]["bike"]["lthr"],
  trainingImpact: string,
): AthletePerformanceOverviewItem {
  if (fact.status === "unavailable") {
    return unavailableItem(fact.reason === "stale_evidence" ? "stale" : "unavailable");
  }
  const stale = fact.freshness === "stale" || fact.calibrationState === "stale";
  return {
    status: "available",
    value: `${formatInteger(fact.valueBpm)} bpm`,
    confidence: "high",
    freshness: stale ? "stale" : "current",
    trainingImpact,
    action: stale ? MORE_RECENT_ACTIVITY_DATA : null,
  };
}

function categoryHeartRateOverview(
  facts: AthletePerformanceTargetFacts["heartRate"]["bike"],
  activityLabel: "cycling" | "running" | "swimming",
) {
  return {
    lthr: heartRateOverview(facts.lthr, `Can set ${activityLabel} threshold heart-rate targets.`),
    maxHeartRate: heartRateOverview(
      facts.maxHr,
      `Can set ${activityLabel} maximum-heart-rate targets.`,
    ),
  };
}

export function projectAthletePerformanceOverview(
  input: AthletePerformanceTargetFacts,
): AthletePerformanceOverview {
  const facts = athletePerformanceTargetFactsSchema.parse(input);
  return athletePerformanceOverviewSchema.parse({
    thresholds: {
      bike: thresholdOverview(facts.thresholds.bike, {
        formatValue: (value) => `${formatInteger(value)} W`,
        trainingImpact: "Sets cycling power zones and cycling power targets.",
      }),
      run: thresholdOverview(facts.thresholds.run, {
        formatValue: (value) => formatPace(metersPerSecondToSecondsPerKilometer(value), "min/km"),
        trainingImpact: "Sets running pace targets.",
      }),
      swim: thresholdOverview(facts.thresholds.swim, {
        formatValue: (value) => formatPace(metersPerSecondToSecondsPer100Meters(value), "min/100m"),
        trainingImpact: "Sets swimming pace targets.",
      }),
    },
    heartRate: {
      bike: categoryHeartRateOverview(facts.heartRate.bike, "cycling"),
      run: categoryHeartRateOverview(facts.heartRate.run, "running"),
      swim: categoryHeartRateOverview(facts.heartRate.swim, "swimming"),
    },
  });
}

export type AthletePerformanceOverviewItem = z.infer<typeof athletePerformanceOverviewItemSchema>;
export type AthletePerformanceOverview = z.infer<typeof athletePerformanceOverviewSchema>;
