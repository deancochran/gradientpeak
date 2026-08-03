import { z } from "zod";

import { getActivityCategorySecondsPerRep } from "../activity-categories";
import type { CompiledActivityPlan } from "../activity-plan";
import { ACTIVITY_PLAN_LIMITS } from "../activity-plan/structure-validation";
import {
  type AthletePerformanceTargetFacts,
  athletePerformanceTargetFactsSchema,
  getAvailablePerformanceTargetValue,
} from "../performance-model";
import { summarizeActivityPlanDuration } from "./totals";

const durationValueSecondsSchema = z.number().int().positive();

/**
 * The sole activity-plan elapsed-duration estimate contract.
 *
 * Each available variant fixes its provenance and confidence together so a
 * caller cannot attach high confidence to a saved or template-derived value.
 */
export const activityPlanDurationEstimateSchema = z.discriminatedUnion("basis", [
  z
    .object({
      valueSeconds: durationValueSecondsSchema,
      status: z.literal("exact"),
      basis: z.literal("compiled_time"),
      confidence: z.literal("high"),
    })
    .strict(),
  z
    .object({
      valueSeconds: durationValueSecondsSchema,
      status: z.literal("estimated"),
      basis: z.literal("distance_and_pace"),
      confidence: z.literal("medium"),
    })
    .strict(),
  z
    .object({
      valueSeconds: durationValueSecondsSchema,
      status: z.literal("estimated"),
      basis: z.literal("repetitions"),
      confidence: z.literal("low"),
    })
    .strict(),
  z
    .object({
      valueSeconds: durationValueSecondsSchema,
      status: z.literal("estimated"),
      basis: z.literal("saved_estimate"),
      confidence: z.literal("low"),
    })
    .strict(),
  z
    .object({
      valueSeconds: z.null(),
      status: z.literal("unavailable"),
      basis: z.null(),
      confidence: z.null(),
    })
    .strict(),
]);

export type ActivityPlanDurationEstimate = z.infer<typeof activityPlanDurationEstimateSchema>;

export type EstimateActivityPlanDurationInput = {
  compiledPlan: Pick<CompiledActivityPlan, "activity_category" | "occurrences"> | null;
  performanceTargets?: AthletePerformanceTargetFacts | null;
  asOf?: string;
};

/** Creates the explicit no-evidence duration state used by failure boundaries. */
export function unavailableActivityPlanDurationEstimate(): ActivityPlanDurationEstimate {
  return activityPlanDurationEstimateSchema.parse({
    valueSeconds: null,
    status: "unavailable",
    basis: null,
    confidence: null,
  });
}

function parsePerformanceTargets(input: EstimateActivityPlanDurationInput) {
  const hasPerformanceTargets =
    input.performanceTargets !== null && input.performanceTargets !== undefined;
  const hasAsOf = input.asOf !== undefined;
  if (hasPerformanceTargets !== hasAsOf) {
    throw new Error("Duration performance targets and asOf must be supplied together");
  }
  if (!hasPerformanceTargets || !input.performanceTargets || !input.asOf) return null;

  const performanceTargets = athletePerformanceTargetFactsSchema.parse(input.performanceTargets);
  if (performanceTargets.asOf !== input.asOf) {
    throw new Error("Duration estimate asOf must match its performance targets");
  }
  return performanceTargets;
}

function boundedSeconds(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) return null;
  const rounded = Math.round(value);
  return rounded <= ACTIVITY_PLAN_LIMITS.maxExplicitTimedDurationSeconds ? rounded : null;
}

function targetSecondsPerMeter(
  activityCategory: CompiledActivityPlan["activity_category"],
  performanceTargets: AthletePerformanceTargetFacts | null,
): number | null {
  if (!performanceTargets) return null;
  if (activityCategory === "run") {
    const pace = getAvailablePerformanceTargetValue(
      performanceTargets.running.planningThresholdPace,
    );
    return pace === null ? null : pace / 1_000;
  }
  if (activityCategory === "swim") {
    const pace = getAvailablePerformanceTargetValue(performanceTargets.swimming.css);
    return pace === null ? null : pace / 100;
  }
  return null;
}

/**
 * Resolves elapsed duration in strict priority order:
 * compiled time, category-matched performance-model target, bounded strength-repetition
 * policy, then unavailable.
 *
 * Open completion is never assigned a generic duration. Repetition estimates
 * are limited to strength plans, use the explicit strength template policy,
 * and are rejected rather than clamped when they exceed the activity-plan
 * duration budget.
 */
export function estimateActivityPlanDuration(
  input: EstimateActivityPlanDurationInput,
): ActivityPlanDurationEstimate {
  const performanceTargets = parsePerformanceTargets(input);
  const compiled = input.compiledPlan;

  if (compiled) {
    const summary = summarizeActivityPlanDuration(compiled);
    const exactSeconds = boundedSeconds(summary.exactElapsedSeconds);
    if (exactSeconds !== null) {
      return activityPlanDurationEstimateSchema.parse({
        valueSeconds: exactSeconds,
        status: "exact",
        basis: "compiled_time",
        confidence: "high",
      });
    }

    const nonTimedActivities = compiled.occurrences.filter(
      (occurrence) => occurrence.role === "activity" && occurrence.duration.type !== "time",
    );
    const distanceOnly =
      nonTimedActivities.length > 0 &&
      nonTimedActivities.every((occurrence) => occurrence.duration.type === "distance");
    const secondsPerMeter = targetSecondsPerMeter(compiled.activity_category, performanceTargets);
    if (distanceOnly && secondsPerMeter !== null) {
      const estimatedSeconds = boundedSeconds(
        summary.timedActiveSeconds + summary.restSeconds + summary.distanceMeters * secondsPerMeter,
      );
      if (estimatedSeconds !== null) {
        return activityPlanDurationEstimateSchema.parse({
          valueSeconds: estimatedSeconds,
          status: "estimated",
          basis: "distance_and_pace",
          confidence: "medium",
        });
      }
    }

    const repetitionsOnly =
      compiled.activity_category === "strength" &&
      nonTimedActivities.length > 0 &&
      nonTimedActivities.every((occurrence) => occurrence.duration.type === "repetitions");
    if (repetitionsOnly) {
      const secondsPerRep = getActivityCategorySecondsPerRep("strength");
      const estimatedSeconds = boundedSeconds(
        summary.timedActiveSeconds + summary.restSeconds + summary.repetitionCount * secondsPerRep,
      );
      if (estimatedSeconds !== null) {
        return activityPlanDurationEstimateSchema.parse({
          valueSeconds: estimatedSeconds,
          status: "estimated",
          basis: "repetitions",
          confidence: "low",
        });
      }
    }
  }

  return unavailableActivityPlanDurationEstimate();
}
