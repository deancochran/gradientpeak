import {
  createUnavailableAthletePerformanceTargetFacts,
  materializeAthletePerformanceTargetFacts,
} from "@repo/core";
import { describe, expect, it } from "vitest";
import { coachAthleteZonesRequestSchema } from "../../contracts/coach-athlete-zones";
import {
  projectCoachAthleteBikeZones,
  readCoachAthleteBikeZones,
} from "./read-coach-athlete-zones";

const PROFILE_ID = "11111111-1111-4111-8111-111111111111";
const AS_OF = new Date("2026-08-10T12:00:00.000Z");

function snapshot(performanceTargets = targetFacts()) {
  return {
    computedAt: "2026-08-10T11:00:00.000Z",
    freshness: "fresh" as const,
    performanceTargets,
    revisions: { source: 4, published: 4 },
  };
}

function targetFacts(asOf = AS_OF) {
  return materializeAthletePerformanceTargetFacts({
    athleteId: PROFILE_ID,
    asOf: asOf.toISOString(),
    thresholds: [
      {
        id: "bike-threshold",
        status: "available",
        activityCategory: "bike",
        metric: "power",
        unit: "watts",
        method: "bike_power_30m",
        value: 251,
        effectiveAt: "2026-08-09T12:00:00.000Z",
        policyVersion: "threshold-truth-v1",
        state: "confirmed",
        confidence: 0.9,
        sourceEvaluationIds: ["evaluation"],
        sourceEffortIds: ["effort"],
        sourceActivityIds: ["activity"],
      },
      {
        id: "bike-lthr",
        status: "available",
        activityCategory: "bike",
        metric: "lthr",
        unit: "bpm",
        method: "lthr_30m_final_20m",
        value: 171,
        effectiveAt: "2026-08-09T12:00:00.000Z",
        policyVersion: "threshold-truth-v1",
        state: "provisional",
        confidence: 0.7,
        sourceEvaluationIds: ["lthr-evaluation"],
        sourceEffortIds: ["lthr-effort"],
        sourceActivityIds: ["lthr-activity"],
      },
    ],
  });
}

describe("projectCoachAthleteBikeZones", () => {
  it("accepts no client sport selector, so run and swim zone mismatches cannot be requested", () => {
    expect(
      coachAthleteZonesRequestSchema.safeParse({
        organizationId: PROFILE_ID,
        athleteProfileId: PROFILE_ID,
        sport: "run",
      }).success,
    ).toBe(false);
  });

  it("uses the canonical Core policy's rounded bike boundaries and exposes only safe fact metadata", () => {
    const result = projectCoachAthleteBikeZones({ asOf: AS_OF, snapshot: snapshot() });

    expect(result.power).toMatchObject({
      source: { value: 251, state: "confirmed", freshness: "fresh" },
      policyVersion: "cycling_ftp_zones_v1",
      zones: { zone1: { min: 0, max: 138 }, zone7: { min: 379, max: null } },
    });
    expect(result.heartRate).toMatchObject({
      source: { value: 171, state: "provisional", freshness: "fresh" },
      policyVersion: "sport_lthr_zones_v1",
      zones: { zone1: { min: 0, max: 139 }, zone5: { min: 171, max: null } },
    });
    expect(JSON.stringify(result)).not.toMatch(/source(?:Activity|Evaluation|Effort)Id|profileId/i);
    expect(Object.keys(result).sort()).toEqual([
      "asOf",
      "heartRate",
      "power",
      "publication",
      "sport",
    ]);
  });

  it("fails closed when canonical bike facts are unavailable even if a published estimate could exist", () => {
    const result = projectCoachAthleteBikeZones({
      asOf: AS_OF,
      snapshot: snapshot(
        createUnavailableAthletePerformanceTargetFacts(AS_OF.toISOString(), PROFILE_ID),
      ),
    });

    expect(result.power).toMatchObject({ zoneAvailability: "unavailable", zones: null });
    expect(result.heartRate).toMatchObject({ zoneAvailability: "unavailable", zones: null });
    expect(result).not.toHaveProperty("estimates");
  });

  it("preserves stale publication and stale canonical fact truth without presenting approval", () => {
    const staleAsOf = new Date("2026-11-10T12:00:00.000Z");
    const stale = targetFacts(staleAsOf);
    const result = projectCoachAthleteBikeZones({
      asOf: staleAsOf,
      snapshot: { ...snapshot(stale), freshness: "stale" },
    });

    expect(result.publication.status).toBe("stale");
    expect(result.power.source).toMatchObject({ availability: "available", freshness: "stale" });
    expect(result).not.toHaveProperty("medicalReadiness");
    expect(result).not.toHaveProperty("approved");
  });
});

describe("readCoachAthleteBikeZones", () => {
  it("uses canonical bike LTHR when the publication cache is unavailable", async () => {
    const unavailablePublicationSnapshot = snapshot(
      createUnavailableAthletePerformanceTargetFacts(AS_OF.toISOString(), PROFILE_ID),
    );
    const result = await readCoachAthleteBikeZones({
      db: {} as never,
      profileId: PROFILE_ID,
      now: AS_OF,
      readSnapshot: async () => unavailablePublicationSnapshot,
      readThresholdFacts: async () => targetFacts(),
    });

    expect(result.publication.status).toBe("available");
    expect(result.power).toMatchObject({
      source: { availability: "available", value: 251 },
      zoneAvailability: "available",
    });
    expect(result.heartRate).toMatchObject({
      source: { availability: "available", value: 171 },
      zoneAvailability: "available",
    });
    expect(JSON.stringify(result)).not.toMatch(/source(?:Activity|Evaluation|Effort)Id|profileId/i);
  });
});
