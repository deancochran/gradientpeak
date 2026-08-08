import { z } from "zod";

import {
  type AthletePerformanceModelSnapshot,
  athletePerformanceModelSnapshotSchema,
  type HeartRateCalibrationFact,
} from "./contracts";
import type { AthletePerformanceTargetFacts } from "./projections";

const overviewConfidenceSchema = z.enum(["high", "medium", "low", "unavailable"]);
const overviewFreshnessSchema = z.enum(["current", "stale", "unavailable"]);
const usableConfidenceSchema = overviewConfidenceSchema.exclude(["unavailable"]);
const displayValueSchema = z.string().trim().min(1).max(80);
const athleteGuidanceSchema = z.string().trim().min(1).max(200);

const overviewGuidanceShape = {
  trainingImpact: athleteGuidanceSchema,
  action: athleteGuidanceSchema.nullable(),
};

/** One athlete-safe display fact. Model lineage and calculation diagnostics are deliberately absent. */
export const athletePerformanceOverviewItemSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("available"),
      value: displayValueSchema,
      confidence: usableConfidenceSchema,
      freshness: z.literal("current"),
      ...overviewGuidanceShape,
    })
    .strict(),
  z
    .object({
      status: z.literal("partial"),
      value: displayValueSchema,
      confidence: usableConfidenceSchema,
      freshness: z.literal("current"),
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

/**
 * Athlete-facing performance data. Metric keys provide display identity; every
 * metric value contains only the six fields an athlete surface may render.
 */
export const athletePerformanceOverviewSchema = z
  .object({
    bike: z
      .object({
        fiveSecondPower: athletePerformanceOverviewItemSchema,
        planningThresholdPower: athletePerformanceOverviewItemSchema,
        estimatedThresholdDuration: athletePerformanceOverviewItemSchema,
        durationRetention: athletePerformanceOverviewItemSchema,
        ...categoryHeartRateOverviewSchema.shape,
      })
      .strict(),
    run: z
      .object({
        planningThresholdPace: athletePerformanceOverviewItemSchema,
        durationRetention: athletePerformanceOverviewItemSchema,
        ...categoryHeartRateOverviewSchema.shape,
      })
      .strict(),
    swim: z
      .object({
        cssPace: athletePerformanceOverviewItemSchema,
        ...categoryHeartRateOverviewSchema.shape,
      })
      .strict(),
  })
  .strict();

type SourceOutcome<TValue> = Readonly<{
  status: "available" | "partial" | "unavailable";
  value: TValue | null;
  confidence: "high" | "medium" | "low" | "unavailable";
  expiresAt: string | null;
  reasons: readonly string[];
}>;

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

function formatDuration(seconds: number): string {
  const rounded = Math.round(seconds);
  const hours = Math.floor(rounded / 3_600);
  const minutes = Math.floor((rounded % 3_600) / 60);
  const remainder = rounded % 60;
  return hours > 0
    ? `${hours}h ${String(minutes).padStart(2, "0")}m`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function isCurrent(expiresAt: string | null, asOf: string): boolean {
  return expiresAt !== null && Date.parse(expiresAt) >= Date.parse(asOf);
}

function unavailableFreshness(input: {
  expiresAt: string | null;
  reasons: readonly string[];
  asOf: string;
}): "stale" | "unavailable" {
  if (input.expiresAt !== null && !isCurrent(input.expiresAt, input.asOf)) return "stale";
  return input.reasons.some((reason) => reason.includes("stale") || reason.includes("freshness"))
    ? "stale"
    : "unavailable";
}

function unavailableOverviewItem(input: {
  freshness: "stale" | "unavailable";
  showAction: boolean;
}): AthletePerformanceOverviewItem {
  return {
    status: "unavailable",
    value: null,
    confidence: "unavailable",
    freshness: input.freshness,
    trainingImpact: TARGETS_UNCHANGED,
    action: input.showAction
      ? input.freshness === "stale"
        ? MORE_RECENT_ACTIVITY_DATA
        : MORE_ACTIVITY_DATA
      : null,
  };
}

function projectOutcome<TValue>(input: {
  outcome: SourceOutcome<TValue>;
  asOf: string;
  formatValue: (value: TValue) => string;
  availableTrainingImpact: string;
  showAction?: boolean;
}): AthletePerformanceOverviewItem {
  const showAction = input.showAction ?? true;
  if (
    input.outcome.status === "unavailable" ||
    input.outcome.value === null ||
    input.outcome.confidence === "unavailable" ||
    !isCurrent(input.outcome.expiresAt, input.asOf)
  ) {
    return unavailableOverviewItem({
      freshness: unavailableFreshness({
        expiresAt: input.outcome.expiresAt,
        reasons: input.outcome.reasons,
        asOf: input.asOf,
      }),
      showAction,
    });
  }

  if (input.outcome.status === "partial") {
    return {
      status: "partial",
      value: input.formatValue(input.outcome.value),
      confidence: input.outcome.confidence,
      freshness: "current",
      trainingImpact: TARGETS_UNCHANGED,
      action: showAction ? MORE_ACTIVITY_DATA : null,
    };
  }

  return {
    status: "available",
    value: input.formatValue(input.outcome.value),
    confidence: input.outcome.confidence,
    freshness: "current",
    trainingImpact: input.availableTrainingImpact,
    action: null,
  };
}

function projectHeartRate(input: {
  fact: HeartRateCalibrationFact;
  asOf: string;
  availableTrainingImpact: string;
}): AthletePerformanceOverviewItem {
  if (input.fact.status === "unavailable" || !isCurrent(input.fact.expiresAt, input.asOf)) {
    return unavailableOverviewItem({
      freshness:
        input.fact.status === "unavailable" && input.fact.reason !== "stale_evidence"
          ? "unavailable"
          : "stale",
      showAction: true,
    });
  }

  return {
    status: "available",
    value: `${formatInteger(input.fact.valueBpm)} bpm`,
    confidence: "high",
    freshness: "current",
    trainingImpact: input.availableTrainingImpact,
    action: null,
  };
}

function categoryHeartRateOverview(input: {
  facts: AthletePerformanceModelSnapshot["heartRate"]["bike"];
  asOf: string;
  activityLabel: "cycling" | "running" | "swimming";
}) {
  return {
    lthr: projectHeartRate({
      fact: input.facts.lthr,
      asOf: input.asOf,
      availableTrainingImpact: `Can set ${input.activityLabel} threshold heart-rate targets.`,
    }),
    maxHeartRate: projectHeartRate({
      fact: input.facts.maxHr,
      asOf: input.asOf,
      availableTrainingImpact: `Can set ${input.activityLabel} maximum-heart-rate targets.`,
    }),
  };
}

/** Projects the server model into the complete and exclusive athlete-facing performance contract. */
export function projectAthletePerformanceOverview(
  input: AthletePerformanceModelSnapshot,
): AthletePerformanceOverview {
  const snapshot = athletePerformanceModelSnapshotSchema.parse(input);
  const bike = snapshot.categories.bike.parameters;
  const run = snapshot.categories.run.parameters;

  return athletePerformanceOverviewSchema.parse({
    bike: {
      fiveSecondPower: projectOutcome({
        outcome: bike.fiveSecondPower,
        asOf: snapshot.asOf,
        formatValue: (value) => `${formatInteger(value.watts)} W`,
        availableTrainingImpact: "Does not directly change training targets.",
      }),
      planningThresholdPower: projectOutcome({
        outcome: bike.planningThresholdPower,
        asOf: snapshot.asOf,
        formatValue: (value) => `${formatInteger(value.watts)} W`,
        availableTrainingImpact: "Sets cycling power zones and cycling power targets.",
      }),
      estimatedThresholdDuration: projectOutcome({
        outcome: bike.modeledTimeToExhaustion,
        asOf: snapshot.asOf,
        formatValue: (value) => formatDuration(value.seconds),
        availableTrainingImpact: "Does not directly change training targets.",
      }),
      durationRetention: projectOutcome({
        outcome: bike.durationRetention,
        asOf: snapshot.asOf,
        formatValue: (value) => `${Math.round(value.ratio * 1_000) / 10}%`,
        availableTrainingImpact: "Does not directly change training targets.",
      }),
      ...categoryHeartRateOverview({
        facts: snapshot.heartRate.bike,
        asOf: snapshot.asOf,
        activityLabel: "cycling",
      }),
    },
    run: {
      planningThresholdPace: projectOutcome({
        outcome: run.planningThresholdPace,
        asOf: snapshot.asOf,
        formatValue: (value) => formatPace(value.paceSecondsPerKilometer, "min/km"),
        availableTrainingImpact: "Sets running pace targets.",
      }),
      durationRetention: projectOutcome({
        outcome: run.durationRetention,
        asOf: snapshot.asOf,
        formatValue: (value) => `${Math.round(value.speedRetentionRatio * 1_000) / 10}%`,
        availableTrainingImpact: "Does not directly change training targets.",
      }),
      ...categoryHeartRateOverview({
        facts: snapshot.heartRate.run,
        asOf: snapshot.asOf,
        activityLabel: "running",
      }),
    },
    swim: {
      cssPace: projectOutcome({
        outcome: snapshot.categories.swim.css,
        asOf: snapshot.asOf,
        formatValue: (value) => formatPace(value.cssSecondsPer100Meters, "min/100m"),
        availableTrainingImpact: "Sets swim pace targets.",
        // No athlete-facing production route currently supports the CSS workflow.
        showAction: false,
      }),
      ...categoryHeartRateOverview({
        facts: snapshot.heartRate.swim,
        asOf: snapshot.asOf,
        activityLabel: "swimming",
      }),
    },
  });
}

/** Projects the persisted target authority without requiring a duplicate full model snapshot. */
export function projectAthletePerformanceTargetOverview(
  input: AthletePerformanceTargetFacts,
): AthletePerformanceOverview {
  const unavailable = () => unavailableOverviewItem({ freshness: "unavailable", showAction: true });
  return athletePerformanceOverviewSchema.parse({
    bike: {
      fiveSecondPower: unavailable(),
      planningThresholdPower: projectOutcome({
        outcome: input.cycling.planningThresholdPower,
        asOf: input.asOf,
        formatValue: (value) => `${formatInteger(value)} W`,
        availableTrainingImpact: "Sets cycling power zones and cycling power targets.",
      }),
      estimatedThresholdDuration: unavailable(),
      durationRetention: unavailable(),
      ...categoryHeartRateOverview({
        facts: input.heartRate.bike,
        asOf: input.asOf,
        activityLabel: "cycling",
      }),
    },
    run: {
      planningThresholdPace: projectOutcome({
        outcome: input.running.planningThresholdPace,
        asOf: input.asOf,
        formatValue: (value) => formatPace(value, "min/km"),
        availableTrainingImpact: "Sets running pace targets.",
      }),
      durationRetention: unavailable(),
      ...categoryHeartRateOverview({
        facts: input.heartRate.run,
        asOf: input.asOf,
        activityLabel: "running",
      }),
    },
    swim: {
      cssPace: projectOutcome({
        outcome: input.swimming.css,
        asOf: input.asOf,
        formatValue: (value) => formatPace(value, "min/100m"),
        availableTrainingImpact: "Sets swim pace targets.",
        showAction: false,
      }),
      ...categoryHeartRateOverview({
        facts: input.heartRate.swim,
        asOf: input.asOf,
        activityLabel: "swimming",
      }),
    },
  });
}

export type AthletePerformanceOverviewItem = z.infer<typeof athletePerformanceOverviewItemSchema>;
export type AthletePerformanceOverview = z.infer<typeof athletePerformanceOverviewSchema>;
