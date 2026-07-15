import { describe, expect, it } from "vitest";

import type {
  AthleteIntelligenceModelInput,
  EffortObservationInput,
} from "../model-input-contracts";
import { calculateCriticalPowerCapability } from "../policies/critical-power-capability";

const AS_OF = "2026-07-10T12:00:00.000Z";

function model(
  input: {
    modeled?: boolean;
    durations?: number[];
    observations?: Array<{
      id: string;
      activityId: string;
      durationSeconds: number;
      powerWatts: number;
      observedAt?: string;
    }>;
  } = {},
) {
  const durations = input.durations ?? [180, 300, 600, 1_200];
  const observations =
    input.observations ??
    durations.map((duration) => ({
      id: `${duration}`,
      activityId: `ride-${duration}`,
      durationSeconds: duration,
      powerWatts: 250 + 15_000 / duration,
      observedAt: undefined,
    }));
  const efforts: Extract<EffortObservationInput, { kind: "power" }>[] = observations.map(
    (observation) => ({
      sourceId: `effort:${observation.id}:record`,
      athleteId: "athlete-1",
      lineageGroupId: `activity:${observation.activityId}`,
      activitySourceId: `activity:${observation.activityId}:record`,
      observedAt: observation.observedAt ?? "2026-07-09T12:00:00.000Z",
      sport: "bike",
      startOffsetSeconds: null,
      endOffsetSeconds: null,
      durationSeconds: observation.durationSeconds,
      evidenceSourceIds: [`effort:${observation.id}:duration`, `effort:${observation.id}:value`],
      kind: "power",
      powerWatts: observation.powerWatts,
    }),
  );
  const evidenceRegistry: AthleteIntelligenceModelInput["evidenceRegistry"] = Object.fromEntries(
    efforts.flatMap((effort) => [
      [
        effort.evidenceSourceIds[0],
        {
          athleteId: "athlete-1",
          sourceId: effort.evidenceSourceIds[0],
          lineageGroupId: effort.lineageGroupId,
          observedAt: effort.observedAt,
          rawObservation: { value: effort.durationSeconds, unit: "seconds" },
          sport: "bike" as const,
          modality: "duration",
          sourceType: "activity_effort" as const,
          qualityState: "known" as const,
          validityState: "valid" as const,
          compatibilityState: "compatible" as const,
        },
      ],
      [
        effort.evidenceSourceIds[1],
        {
          athleteId: "athlete-1",
          sourceId: effort.evidenceSourceIds[1],
          lineageGroupId: effort.lineageGroupId,
          observedAt: effort.observedAt,
          rawObservation: { value: effort.powerWatts, unit: "watts" },
          sport: "bike" as const,
          modality: input.modeled ? "value-modeled" : "value",
          sourceType: "activity_effort" as const,
          qualityState: "known" as const,
          validityState: "valid" as const,
          compatibilityState: "compatible" as const,
        },
      ],
    ]),
  );
  return {
    assessmentAsOf: AS_OF,
    efforts,
    evidenceRegistry,
    readCoverage: {
      metrics: { state: "complete" as const, reason: null },
      activities: { state: "complete" as const, reason: null },
      efforts: { state: "complete" as const, reason: null },
      schedules: { state: "complete" as const, reason: null },
    },
  };
}

describe("critical power capability", () => {
  it("adapts materialized observed efforts into distinct CP and W′ capability outputs", () => {
    const result = calculateCriticalPowerCapability({ model: model() });

    expect(result.criticalPowerWatts).toMatchObject({ state: "estimated", unit: "watts" });
    expect(result.criticalPowerWatts.estimate).toBeCloseTo(250);
    expect(result.wPrimeJoules).toMatchObject({ state: "estimated", unit: "joules" });
    expect(result.wPrimeJoules.estimate).toBeCloseTo(15_000);
  });

  it("returns insufficient evidence and excludes modeled effort values", () => {
    expect(
      calculateCriticalPowerCapability({ model: model({ durations: [180, 300] }) }),
    ).toMatchObject({ criticalPowerWatts: { state: "insufficient_evidence" } });
    expect(calculateCriticalPowerCapability({ model: model({ modeled: true }) })).toMatchObject({
      criticalPowerWatts: {
        state: "insufficient_evidence",
        reasonCodes: ["critical_power_insufficient_points"],
        contributingSourceIds: [],
      },
    });
  });

  it("selects the strongest observed effort per duration while preserving winning activity lineage", () => {
    const observations = [180, 300, 600, 1_200].flatMap((duration) => [
      {
        id: `ride-a-${duration}`,
        activityId: "ride-a",
        durationSeconds: duration,
        powerWatts: 250 + 15_000 / duration,
      },
      {
        id: `ride-b-${duration}`,
        activityId: "ride-b",
        durationSeconds: duration,
        powerWatts: 245 + 15_000 / duration,
      },
    ]);

    const result = calculateCriticalPowerCapability({ model: model({ observations }) });

    expect(result.criticalPowerWatts).toMatchObject({
      state: "insufficient_evidence",
      reasonCodes: ["critical_power_insufficient_independent_activities"],
      contributingSourceIds: [
        "effort:ride-a-180:value",
        "effort:ride-a-300:value",
        "effort:ride-a-600:value",
        "effort:ride-a-1200:value",
      ],
    });
  });

  it("breaks equal-power duration ties by newest observation then activity ID", () => {
    const observations = [
      {
        id: "old-180",
        activityId: "ride-a",
        durationSeconds: 180,
        powerWatts: 250 + 15_000 / 180,
        observedAt: "2026-07-08T12:00:00.000Z",
      },
      {
        id: "new-180",
        activityId: "ride-z",
        durationSeconds: 180,
        powerWatts: 250 + 15_000 / 180,
      },
      {
        id: "z-300",
        activityId: "ride-z",
        durationSeconds: 300,
        powerWatts: 250 + 15_000 / 300,
      },
      {
        id: "a-300",
        activityId: "ride-a",
        durationSeconds: 300,
        powerWatts: 250 + 15_000 / 300,
      },
      {
        id: "z-600",
        activityId: "ride-z",
        durationSeconds: 600,
        powerWatts: 250 + 15_000 / 600,
      },
      {
        id: "a-600",
        activityId: "ride-a",
        durationSeconds: 600,
        powerWatts: 249 + 15_000 / 600,
      },
      {
        id: "a-1200",
        activityId: "ride-a",
        durationSeconds: 1_200,
        powerWatts: 250 + 15_000 / 1_200,
      },
      {
        id: "z-1200",
        activityId: "ride-z",
        durationSeconds: 1_200,
        powerWatts: 249 + 15_000 / 1_200,
      },
    ];
    const expectedSourceIds = [
      "effort:new-180:value",
      "effort:a-300:value",
      "effort:z-600:value",
      "effort:a-1200:value",
    ];

    for (const ordered of [observations, [...observations].reverse()]) {
      const result = calculateCriticalPowerCapability({
        model: model({ observations: ordered }),
      });
      expect(result.criticalPowerWatts).toMatchObject({
        state: "estimated",
        contributingSourceIds: expectedSourceIds,
      });
      expect(result.criticalPowerWatts.estimate).toBeCloseTo(250);
    }
  });

  it("returns unsupported outside cycling without relabeling CP as FTP", () => {
    const result = calculateCriticalPowerCapability({ model: model(), targetSport: "run" });
    expect(result.criticalPowerWatts).toMatchObject({
      state: "unsupported",
      reasonCodes: ["critical_power_only_supported_for_bike"],
    });
    expect(result).not.toHaveProperty("ftp");
  });
});
