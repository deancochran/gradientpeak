import {
  athletePerformanceTargetFactsSchema,
  createUnavailableAthletePerformanceTargetFacts,
} from "../../../performance-model";

export const SYSTEM_PLAN_VERIFICATION_AS_OF = "2026-07-31T12:00:00.000Z";

const unavailable = createUnavailableAthletePerformanceTargetFacts(
  SYSTEM_PLAN_VERIFICATION_AS_OF,
  "system-plan-verification-athlete",
);

function availableTarget<T extends { value: number | null }>(
  fact: T,
  value: number,
  evidenceId: string,
) {
  return {
    ...fact,
    status: "available" as const,
    value,
    calculationVersion: "system-plan-verification-targets-v1",
    sourceEvidenceIds: [evidenceId],
    evidenceTime: {
      observedFrom: "2026-07-01T12:00:00.000Z",
      observedThrough: "2026-07-01T12:00:00.000Z",
      computedAt: SYSTEM_PLAN_VERIFICATION_AS_OF,
    },
    confidence: "high" as const,
    expiresAt: "2026-09-29T12:00:00.000Z",
    reasons: [],
  };
}

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
  athletePerformanceTargetFactsSchema.parse({
    ...unavailable,
    cycling: {
      planningThresholdPower: availableTarget(
        unavailable.cycling.planningThresholdPower,
        250,
        "system-plan-verification-planning-threshold-power",
      ),
    },
    running: {
      planningThresholdPace: availableTarget(
        unavailable.running.planningThresholdPace,
        255,
        "system-plan-verification-planning-threshold-pace",
      ),
    },
    swimming: {
      css: availableTarget(unavailable.swimming.css, 100, "system-plan-verification-swim-css"),
    },
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
