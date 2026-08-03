import { compileActivityPlan } from "../activity-plan";
import type { ActivityPlanDurationEstimate } from "../duration";
import {
  estimateActivityPlanDuration,
  summarizeActivityPlanDuration,
  unavailableActivityPlanDurationEstimate,
} from "../duration";
import type { EstimationContext, EstimationResult } from "./types";

// ==============================
// Strategy 1: Structure-Based
// ==============================

/**
 * Retain only evidence-safe ancillary facts from a structured activity plan.
 * Numeric Load and intensity belong exclusively to canonical Common Load.
 */
export function estimateFromStructure(context: EstimationContext): EstimationResult {
  if (!context.structure) throw new Error("Structure-based estimation requires a valid structure");
  const compiled = compileActivityPlan(context.structure);
  const summary = summarizeActivityPlanDuration(compiled);
  const durationEstimate = estimateActivityPlanDuration({ compiledPlan: compiled });
  const categoryDoses = summary.activity_categories.map((dose) => ({ ...dose, load: null }));
  const warnings = [
    "Load and intensity are unavailable from the ancillary estimator; use canonical Common Load.",
  ];
  if (durationEstimate.status === "unavailable") {
    warnings.push("Elapsed duration is unavailable without supported duration evidence.");
  }

  return {
    load: null,
    durationEstimate,
    duration: durationEstimate.valueSeconds,
    categoryDoses,
    estimatedDistance: summary.distanceMeters > 0 ? summary.distanceMeters : undefined,
    confidence: durationEstimate.confidence,
    confidenceScore: durationConfidenceScore(durationEstimate),
    factors: ["compiled-v3-occurrences", `duration:${durationEstimate.basis ?? "unavailable"}`],
    warnings,
  };
}

// ==============================
// Strategy 2: Route-Based
// ==============================

/**
 * Retain authored route facts without assuming speed, mass, power, or effort.
 */
export function estimateFromRoute(context: EstimationContext): EstimationResult {
  const { route } = context;

  if (!route) {
    throw new Error("Route-based estimation requires route data");
  }
  const durationEstimate = unavailableActivityPlanDurationEstimate();
  const estimatedDistance =
    Number.isFinite(route.distanceMeters) && route.distanceMeters > 0
      ? route.distanceMeters
      : undefined;

  return {
    load: null,
    durationEstimate,
    duration: null,
    estimatedDistance,
    confidence: null,
    confidenceScore: null,
    factors: estimatedDistance === undefined ? [] : ["authored-route-distance"],
    warnings: [
      "Route distance is retained, but elapsed duration, Load, and intensity are unavailable without supported evidence.",
    ],
  };
}

// ==============================
// Strategy 3: Template-Based
// ==============================

/**
 * Explicitly abstain when no structure or route evidence exists.
 */
export function estimateFromTemplate(_context: EstimationContext): EstimationResult {
  const durationEstimate = unavailableActivityPlanDurationEstimate();
  return {
    load: null,
    durationEstimate,
    duration: null,
    confidence: null,
    confidenceScore: null,
    factors: [],
    warnings: [
      "No supported structure or route evidence; duration, Load, and intensity are unavailable.",
    ],
  };
}

function durationConfidenceScore(duration: ActivityPlanDurationEstimate): number | null {
  switch (duration.confidence) {
    case "high":
      return 100;
    case "medium":
      return 75;
    case "low":
      return 50;
    case null:
      return null;
  }
}
