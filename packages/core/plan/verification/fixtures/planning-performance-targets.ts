import {
  createUnavailableAthletePerformanceTargetFacts,
  materializeAthletePerformanceTargetFacts,
} from "../../../performance-model";

export const SYSTEM_PLAN_VERIFICATION_AS_OF = "2026-07-31T12:00:00.000Z";

const unavailable = createUnavailableAthletePerformanceTargetFacts(
  SYSTEM_PLAN_VERIFICATION_AS_OF,
  "system-plan-verification-athlete",
);

function availableLthr(
  activityCategory: "bike" | "run" | "swim",
  valueBpm: number,
  evidenceId: string,
) {
  return {
    ...unavailable.heartRate[activityCategory].lthr,
    status: "available" as const,
    valueBpm,
    observedAt: "2026-07-01T12:00:00.000Z",
    expiresAt: "2026-09-29T12:00:00.000Z",
    sourceEvidenceId: evidenceId,
    sourceActivityId: `${evidenceId}-activity`,
    source: "activity_file" as const,
    method: "activity_file_lthr_detection" as const,
    calculationVersion: "activity-file-lthr-v1" as const,
    reason: null,
  };
}

/** Explicit, deterministic target facts used only by system-plan verification. */
export const SYSTEM_PLAN_VERIFICATION_PERFORMANCE_TARGETS =
  materializeAthletePerformanceTargetFacts({
    athleteId: unavailable.athleteId,
    asOf: SYSTEM_PLAN_VERIFICATION_AS_OF,
    thresholds: [
      {
        id: "system-plan-bike-threshold",
        status: "available",
        activityCategory: "bike",
        metric: "power",
        unit: "watts",
        method: "bike_power_30m",
        value: 250,
        effectiveAt: "2026-07-01T12:00:00.000Z",
        policyVersion: "threshold-policy-v1",
        state: "confirmed",
        confidence: 0.9,
        sourceEvaluationIds: ["system-plan-bike-evaluation"],
        sourceEffortIds: ["system-plan-bike-effort"],
        sourceActivityIds: ["system-plan-bike-activity"],
      },
      {
        id: "system-plan-run-threshold",
        status: "available",
        activityCategory: "run",
        metric: "speed",
        unit: "meters_per_second",
        method: "run_speed_30m",
        value: 1_000 / 255,
        effectiveAt: "2026-07-01T12:00:00.000Z",
        policyVersion: "threshold-policy-v1",
        state: "confirmed",
        confidence: 0.9,
        sourceEvaluationIds: ["system-plan-run-evaluation"],
        sourceEffortIds: ["system-plan-run-effort"],
        sourceActivityIds: ["system-plan-run-activity"],
      },
      {
        id: "system-plan-swim-threshold",
        status: "available",
        activityCategory: "swim",
        metric: "speed",
        unit: "meters_per_second",
        method: "swim_speed_15m",
        value: 1,
        effectiveAt: "2026-07-01T12:00:00.000Z",
        policyVersion: "threshold-policy-v1",
        state: "confirmed",
        confidence: 0.9,
        sourceEvaluationIds: ["system-plan-swim-evaluation"],
        sourceEffortIds: ["system-plan-swim-effort"],
        sourceActivityIds: ["system-plan-swim-activity"],
      },
    ],
    heartRate: {
      ...unavailable.heartRate,
      bike: {
        ...unavailable.heartRate.bike,
        lthr: availableLthr("bike", 170, "system-plan-verification-bike-lthr"),
      },
      run: {
        ...unavailable.heartRate.run,
        lthr: availableLthr("run", 172, "system-plan-verification-run-lthr"),
      },
      swim: {
        ...unavailable.heartRate.swim,
        lthr: availableLthr("swim", 165, "system-plan-verification-swim-lthr"),
      },
    },
  });
