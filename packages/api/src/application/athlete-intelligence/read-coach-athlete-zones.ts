import { resolveProfileZones } from "@repo/core";
import {
  type CoachAthleteZonesResponse,
  coachAthleteZonesResponseSchema,
} from "../../contracts/coach-athlete-zones";
import type { DrizzleQueryExecutor } from "../../db";
import { getAthleteThresholdTargetFactsAsOf } from "../performance-model/get-athlete-performance-model-as-of";
import {
  type PublishedAthleteStateSnapshot,
  readPublishedAthleteStateSnapshot,
} from "./published-athlete-state";

type CoachZoneSnapshot = Pick<
  PublishedAthleteStateSnapshot,
  "computedAt" | "freshness" | "performanceTargets" | "revisions"
>;
type CoachZoneFacts = NonNullable<CoachZoneSnapshot["performanceTargets"]>;

export function projectCoachAthleteBikeZones(input: {
  asOf: Date;
  snapshot: CoachZoneSnapshot;
  facts?: CoachZoneFacts;
}): CoachAthleteZonesResponse {
  const facts = input.facts ?? input.snapshot.performanceTargets;
  if (!facts) throw new Error("Canonical performance target facts are required");
  const zones = resolveProfileZones({
    thresholds: { bike: facts.thresholds.bike },
    heartRate: { bike: { lthr: facts.heartRate.bike.lthr } },
  });
  const power = facts.thresholds.bike;
  const lthr = facts.heartRate.bike.lthr;
  const powerZoneBounds = zones.powerZones
    ? (({ policyVersion: _policyVersion, ...bounds }) => bounds)(zones.powerZones)
    : null;
  const heartRateZoneBounds = zones.heartRateZones
    ? (({ policyVersion: _policyVersion, ...bounds }) => bounds)(zones.heartRateZones)
    : null;

  return coachAthleteZonesResponseSchema.parse({
    asOf: input.asOf.toISOString(),
    sport: "bike",
    publication: {
      status:
        input.snapshot.freshness === "fresh"
          ? "available"
          : input.snapshot.freshness === "stale"
            ? "stale"
            : "unavailable",
      publishedRevision: input.snapshot.revisions.published,
      computedAt: input.snapshot.computedAt,
    },
    power: {
      source:
        power.status === "available"
          ? {
              availability: "available",
              value: power.value,
              unit: power.unit,
              state: power.state,
              freshness: power.freshness,
              effectiveAt: power.effectiveAt,
              policyVersion: power.policyVersion,
              method: power.method,
              calculationVersion: power.calculationVersion,
              provenance: "validated_threshold",
            }
          : {
              availability: "unavailable",
              value: null,
              unit: power.unit,
              state: "unavailable",
              freshness: "unavailable",
              effectiveAt: null,
              policyVersion: null,
              method: null,
              calculationVersion: null,
              provenance: "unavailable",
            },
      zoneAvailability: zones.powerZones ? "available" : "unavailable",
      policyVersion: zones.powerZones?.policyVersion ?? null,
      zones: powerZoneBounds,
    },
    heartRate: {
      source:
        lthr.status === "available"
          ? {
              availability: "available",
              value: lthr.valueBpm,
              unit: lthr.unit,
              state: lthr.calibrationState,
              freshness: lthr.freshness,
              effectiveAt: lthr.observedAt,
              policyVersion: lthr.policyVersion,
              method: lthr.method,
              calculationVersion: lthr.calculationVersion,
              provenance: lthr.evaluationSemantics,
            }
          : {
              availability: "unavailable",
              value: null,
              unit: lthr.unit,
              state: "unavailable",
              freshness: "unavailable",
              effectiveAt: null,
              policyVersion: null,
              method: null,
              calculationVersion: null,
              provenance: "unavailable",
            },
      zoneAvailability: zones.heartRateZones ? "available" : "unavailable",
      policyVersion: zones.heartRateZones?.policyVersion ?? null,
      zones: heartRateZoneBounds,
    },
  });
}

/**
 * Reads only the canonical, as-of bike threshold and LTHR facts. The supplied
 * executor may be the authorization transaction, so the target reader reuses
 * that snapshot rather than opening an outer read after authorization.
 */
export async function readCoachAthleteBikeZones(input: {
  db: DrizzleQueryExecutor;
  profileId: string;
  now?: Date;
  readSnapshot?: (input: {
    db: DrizzleQueryExecutor;
    profileId: string;
    now: Date;
  }) => Promise<CoachZoneSnapshot>;
  readThresholdFacts?: typeof getAthleteThresholdTargetFactsAsOf;
}): Promise<CoachAthleteZonesResponse> {
  const now = input.now ?? new Date();
  const readSnapshot =
    input.readSnapshot ??
    ((request) =>
      readPublishedAthleteStateSnapshot({
        db: request.db,
        profileId: request.profileId,
        now: request.now,
        advanceBaselineToReadTime: false,
      }));
  const snapshot = await readSnapshot({ db: input.db, profileId: input.profileId, now });
  const readThresholdFacts = input.readThresholdFacts ?? getAthleteThresholdTargetFactsAsOf;
  const facts = await readThresholdFacts({ athleteId: input.profileId, asOf: now }, input.db);
  return projectCoachAthleteBikeZones({ asOf: now, snapshot, facts });
}
