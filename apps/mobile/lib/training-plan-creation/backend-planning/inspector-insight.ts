import type { ActiveTrainingPlanProjection, ScheduleInspectorBackendInsight } from "./types";

export function deriveScheduleInspectorBackendInsight({
  activeProjection,
  selectionLabel,
}: {
  activeProjection: ActiveTrainingPlanProjection;
  selectionLabel?: string | null;
}): ScheduleInspectorBackendInsight | null {
  if (activeProjection.source !== "backend") return null;

  const subject = selectionLabel ?? "This schedule";
  const firstConflict = activeProjection.conflicts.items[0];
  if (firstConflict) {
    return {
      source: "backend",
      headline: "Backend projection flags a planning risk",
      detail: `${subject}: ${firstConflict.message}`,
      riskLabel: firstConflict.severity,
      recommendation:
        activeProjection.feasibilityReasons[0] ??
        "Adjust workout placement or reduce load before saving.",
      outcome: "Too fatigued",
    };
  }

  if (
    activeProjection.feasibilityState === "unsafe" ||
    activeProjection.feasibilityState === "aggressive"
  ) {
    return {
      source: "backend",
      headline:
        activeProjection.feasibilityState === "unsafe"
          ? "Backend projection marks this plan as unsafe"
          : "Backend projection marks this plan as aggressive",
      detail:
        activeProjection.feasibilityReasons[0] ??
        `${subject} may create more load than the athlete can absorb safely.`,
      riskLabel: activeProjection.feasibilityState,
      recommendation:
        "Spread hard work out, reduce load, or add recovery before committing this plan.",
      outcome: "Too fatigued",
    };
  }

  if (activeProjection.readinessScore !== null) {
    if (activeProjection.readinessScore >= 75) {
      return {
        source: "backend",
        headline: "This schedule is supporting the goal",
        detail: `Projected readiness is ${Math.round(activeProjection.readinessScore)}${activeProjection.readinessConfidence !== null ? ` with ${Math.round(activeProjection.readinessConfidence * 100)}% confidence` : ""}.`,
        riskLabel: null,
        recommendation: "Keep this shape unless the athlete context or goal changes.",
        outcome: "Better prepared",
      };
    }
    if (activeProjection.readinessScore < 50) {
      return {
        source: "backend",
        headline: "Goal support is still weak",
        detail: `Projected readiness is ${Math.round(activeProjection.readinessScore)}.`,
        riskLabel: "under-supported",
        recommendation: "Add more specific work or revisit the goal timeline/preferences.",
        outcome: "Needs support",
      };
    }
    return {
      source: "backend",
      headline: "This schedule is moderately supporting the goal",
      detail: `Projected readiness is ${Math.round(activeProjection.readinessScore)}.`,
      riskLabel: null,
      recommendation:
        "Use workout placement and recovery weeks to improve support without adding excess fatigue.",
      outcome: "Better prepared",
    };
  }

  return null;
}
