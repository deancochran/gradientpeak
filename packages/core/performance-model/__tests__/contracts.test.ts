import { describe, expect, it } from "vitest";
import {
  buildPerformanceModelSnapshotFixture,
  buildPerformanceTargetFactsFixture,
} from "../../testing/performance-model";
import {
  ATHLETE_PERFORMANCE_TARGET_FACTS_VERSION,
  athletePerformanceModelSnapshotSchema,
  athletePerformanceTargetFactsSchema,
  completedActivityPerformanceTargetSnapshotSchema,
  createUnavailableAthletePerformanceTargetFacts,
  getAvailablePerformanceTargetValue,
  materializeAthletePerformanceTargetFacts,
} from "..";

const asOf = "2026-08-10T12:00:00.000Z";

function source(overrides: Record<string, unknown> = {}) {
  return {
    id: "run-threshold",
    status: "available" as const,
    activityCategory: "run" as const,
    metric: "speed" as const,
    unit: "meters_per_second" as const,
    method: "run_speed_30m" as const,
    value: 4,
    effectiveAt: "2026-08-01T12:00:00.000Z",
    policyVersion: "threshold-policy-v1",
    state: "confirmed" as const,
    confidence: 0.9,
    sourceEvaluationIds: ["evaluation-1"],
    sourceEffortIds: ["effort-1"],
    sourceActivityIds: ["activity-1"],
    ...overrides,
  };
}

describe("AthletePerformanceTargetFacts", () => {
  it("publishes one strict native-unit threshold shape with separate heart-rate capability facts", () => {
    const facts = materializeAthletePerformanceTargetFacts({
      athleteId: "athlete-1",
      asOf,
      thresholds: [source()],
    });

    expect(facts).toMatchObject({
      contractVersion: ATHLETE_PERFORMANCE_TARGET_FACTS_VERSION,
      thresholds: {
        bike: { status: "unavailable", unit: "watts" },
        run: {
          status: "available",
          value: 4,
          unit: "meters_per_second",
          thresholdId: "run-threshold",
          evaluationId: "evaluation-1",
          method: "run_speed_30m",
          state: "confirmed",
          freshness: "fresh",
          sourceEffortIds: ["effort-1"],
          sourceActivityIds: ["activity-1"],
        },
        swim: { status: "unavailable", unit: "meters_per_second" },
      },
      heartRate: { run: { lthr: { status: "unavailable" } } },
    });
    expect(facts).not.toHaveProperty("cycling");
    expect(facts).not.toHaveProperty("running");
    expect(facts).not.toHaveProperty("swimming");
    expect(getAvailablePerformanceTargetValue(facts.thresholds.run)).toBe(4);
  });

  it("derives stale metadata without discarding usable threshold truth", () => {
    const facts = materializeAthletePerformanceTargetFacts({
      athleteId: "athlete-1",
      asOf: "2027-01-01T12:00:00.000Z",
      thresholds: [source()],
    });
    expect(facts.thresholds.run).toMatchObject({ freshness: "stale", value: 4 });
    expect(getAvailablePerformanceTargetValue(facts.thresholds.run)).toBe(4);
  });

  it("creates a complete fail-closed target contract", () => {
    const facts = createUnavailableAthletePerformanceTargetFacts(asOf, "athlete-1");
    expect(facts.thresholds).toEqual({
      bike: expect.objectContaining({ status: "unavailable", metric: "power", unit: "watts" }),
      run: expect.objectContaining({
        status: "unavailable",
        metric: "speed",
        unit: "meters_per_second",
      }),
      swim: expect.objectContaining({
        status: "unavailable",
        metric: "speed",
        unit: "meters_per_second",
      }),
    });
    expect(facts.heartRate.bike.lthr.status).toBe("unavailable");
  });

  it("rejects compatibility aliases and pace primary units", () => {
    const facts = createUnavailableAthletePerformanceTargetFacts(asOf, "athlete-1");
    expect(
      athletePerformanceTargetFactsSchema.safeParse({
        ...facts,
        cycling: { planningThresholdPower: facts.thresholds.bike },
      }).success,
    ).toBe(false);
    expect(() =>
      materializeAthletePerformanceTargetFacts({
        athleteId: "athlete-1",
        asOf,
        thresholds: [source({ unit: "seconds_per_kilometer" })],
      }),
    ).toThrow();
    expect(() =>
      materializeAthletePerformanceTargetFacts({
        athleteId: "athlete-1",
        asOf,
        thresholds: [source({ freshness: { status: "fresh", ageSeconds: 1, freshForSeconds: 1 } })],
      }),
    ).toThrow("Unrecognized key");
  });

  it("rejects duplicate category facts, policy mismatches, and misaligned provenance", () => {
    expect(() =>
      materializeAthletePerformanceTargetFacts({
        athleteId: "athlete-1",
        asOf,
        thresholds: [source(), source({ id: "run-threshold-2" })],
      }),
    ).toThrow("duplicated");
    expect(() =>
      materializeAthletePerformanceTargetFacts({
        athleteId: "athlete-1",
        asOf,
        thresholds: [source({ method: "swim_speed_15m" })],
      }),
    ).toThrow();
    expect(() =>
      materializeAthletePerformanceTargetFacts({
        athleteId: "athlete-1",
        asOf,
        thresholds: [source({ sourceEffortIds: [] })],
      }),
    ).toThrow("provenance must align");
  });

  it("uses the canonical target contract in completed-activity captures", () => {
    const targets = createUnavailableAthletePerformanceTargetFacts(asOf, "athlete-1");
    expect(
      completedActivityPerformanceTargetSnapshotSchema.parse({
        contractVersion: "completed-activity-performance-target-snapshot-v2",
        capturedAt: asOf,
        publishedRevision: 1,
        publicationStatus: "available",
        targets,
      }).targets,
    ).toEqual(targets);
  });

  it("rejects future heart-rate observations at both schema and materializer boundaries", () => {
    const valid = buildPerformanceTargetFactsFixture({
      athleteId: "athlete-1",
      asOf,
      maxHrBpm: { run: 190 },
    });
    const futureHeartRate = structuredClone(valid.heartRate);
    if (futureHeartRate.run.maxHr.status !== "available") {
      throw new Error("Expected available max-HR fixture");
    }
    futureHeartRate.run.maxHr.observedAt = "2026-08-10T12:00:00.001Z";

    expect(
      athletePerformanceTargetFactsSchema.safeParse({ ...valid, heartRate: futureHeartRate })
        .success,
    ).toBe(false);
    expect(() =>
      materializeAthletePerformanceTargetFacts({
        athleteId: "athlete-1",
        asOf,
        thresholds: [],
        heartRate: futureHeartRate,
      }),
    ).toThrow("cannot come from the future");
  });
});

describe("AthletePerformanceModelSnapshot", () => {
  it("keeps capability models and heart rate separate from canonical threshold authority", () => {
    const snapshot = buildPerformanceModelSnapshotFixture({ asOf, athleteId: "athlete-1" });
    expect(athletePerformanceModelSnapshotSchema.parse(snapshot)).toEqual(snapshot);
    expect(
      athletePerformanceModelSnapshotSchema.safeParse({ ...snapshot, calibrations: [] }).success,
    ).toBe(false);
  });
});
