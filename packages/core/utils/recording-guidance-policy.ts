import {
  activityPlanStructureSchemaV2,
  getActivityPlanTargetMetricFamily,
  getRouteStructuredPlanConflicts,
  getStepTargetConflicts,
  isTrainerControllableTarget,
  type ActivityPlanStructureV2,
} from "../schemas/activity_plan_v2";
import type { RecordingGpsMode } from "../schemas/recording-session";

export type RecordingGuidanceKind =
  | "free"
  | "route_only"
  | "structured_only"
  | "structured_with_route";

export type RecordingEvaluableMetric =
  | "time"
  | "distance"
  | "position"
  | "route_progress"
  | "grade"
  | "power"
  | "heart_rate"
  | "speed"
  | "cadence"
  | "perceived_exertion";

export type RecordingTrainerAuthority = "manual" | "plan_targets" | "route_simulation";

export interface RecordingGuidancePolicyInput {
  gpsMode: RecordingGpsMode;
  routeAttached: boolean;
  structure?: ActivityPlanStructureV2 | null | unknown;
}

export interface RecordingGuidancePolicy {
  guidanceKind: RecordingGuidanceKind;
  hasStructure: boolean;
  hasRoute: boolean;
  evaluableMetrics: RecordingEvaluableMetric[];
  targetMetrics: RecordingEvaluableMetric[];
  trainerAuthorities: {
    available: RecordingTrainerAuthority[];
    simultaneousControlAllowed: boolean;
    reasons: string[];
  };
  conflicts: string[];
}

function parseStructure(structure: RecordingGuidancePolicyInput["structure"]): ActivityPlanStructureV2 | null {
  if (structure == null) {
    return null;
  }

  const result = activityPlanStructureSchemaV2.safeParse(structure);
  return result.success ? result.data : null;
}

function getGuidanceKind(hasStructure: boolean, hasRoute: boolean): RecordingGuidanceKind {
  if (hasStructure && hasRoute) return "structured_with_route";
  if (hasStructure) return "structured_only";
  if (hasRoute) return "route_only";
  return "free";
}

export function resolveRecordingGuidancePolicy(
  input: RecordingGuidancePolicyInput,
): RecordingGuidancePolicy {
  const structure = parseStructure(input.structure);
  const hasStructure = structure !== null;
  const hasRoute = input.routeAttached;
  const guidanceKind = getGuidanceKind(hasStructure, hasRoute);

  const evaluableMetrics = new Set<RecordingEvaluableMetric>(["time"]);
  const targetMetrics = new Set<RecordingEvaluableMetric>();
  const availableAuthorities = new Set<RecordingTrainerAuthority>(["manual"]);
  const reasons: string[] = [];
  const conflicts: string[] = [];
  let hasPlanTrainerTargets = false;

  if (hasRoute) {
    evaluableMetrics.add("route_progress");
    evaluableMetrics.add("grade");

    if (input.gpsMode === "on") {
      evaluableMetrics.add("position");
      evaluableMetrics.add("distance");
    } else {
      evaluableMetrics.add("distance");
    }

    availableAuthorities.add("route_simulation");
  } else if (input.gpsMode === "on") {
    evaluableMetrics.add("position");
    evaluableMetrics.add("distance");
  }

  if (structure) {
    for (const conflict of getRouteStructuredPlanConflicts(structure)) {
      conflicts.push(conflict.message);
    }

    for (const interval of structure.intervals) {
      for (const step of interval.steps) {
        switch (step.duration.type) {
          case "distance":
            evaluableMetrics.add("distance");
            break;
          case "time":
          case "untilFinished":
          case "repetitions":
            break;
        }

        for (const conflict of getStepTargetConflicts(step)) {
          conflicts.push(conflict.message);
        }

        for (const target of step.targets ?? []) {
          const family = getActivityPlanTargetMetricFamily(target);
          switch (family) {
            case "power":
              targetMetrics.add("power");
              evaluableMetrics.add("power");
              break;
            case "heart_rate":
              targetMetrics.add("heart_rate");
              evaluableMetrics.add("heart_rate");
              break;
            case "speed":
              targetMetrics.add("speed");
              evaluableMetrics.add("speed");
              break;
            case "cadence":
              targetMetrics.add("cadence");
              evaluableMetrics.add("cadence");
              break;
            case "perceived_exertion":
              targetMetrics.add("perceived_exertion");
              evaluableMetrics.add("perceived_exertion");
              break;
          }

          if (isTrainerControllableTarget(target)) {
            hasPlanTrainerTargets = true;
          }
        }
      }
    }
  }

  if (hasPlanTrainerTargets) {
    availableAuthorities.add("plan_targets");
  }

  let simultaneousControlAllowed = true;
  if (hasRoute && hasPlanTrainerTargets) {
    simultaneousControlAllowed = false;
    reasons.push(
      "Route simulation and plan-driven trainer targets require different trainer authorities and cannot auto-control the same trainer simultaneously.",
    );
  }

  return {
    guidanceKind,
    hasStructure,
    hasRoute,
    evaluableMetrics: [...evaluableMetrics],
    targetMetrics: [...targetMetrics],
    trainerAuthorities: {
      available: [...availableAuthorities],
      simultaneousControlAllowed,
      reasons,
    },
    conflicts: [...new Set(conflicts)],
  };
}
