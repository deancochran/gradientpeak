import { commonLoadAggregateSchema } from "@repo/core/load";
import { describe, expect, it } from "vitest";
import {
  buildEffectiveCompletedObservationsByDate,
  mergeCompletedCommonLoadObservations,
  sameCommonLoadIdentity,
} from "./trainingTimelineAdapters";

const commonLoadIdentity = { model: "gradientpeak_relative_load", version: "1" };

function aggregate(input: {
  status: "complete" | "partial" | "unavailable";
  load?: number;
  intensity?: number;
  contributingDurationSeconds: number;
  knownDurationSeconds: number | null;
  contributingActivityCount: number;
  partialActivityCount: number;
  unavailableActivityCount: number;
  totalActivityCount: number;
  unknownDurationActivityCount: number;
  reason?: "no_load_data" | "incompatible_version" | "duration_missing";
}) {
  return commonLoadAggregateSchema.parse({
    ...commonLoadIdentity,
    ...input,
    activityCountCoverage:
      input.totalActivityCount === 0
        ? 0
        : input.contributingActivityCount / input.totalActivityCount,
    knownDurationCoverage:
      input.knownDurationSeconds === null
        ? null
        : input.contributingDurationSeconds / input.knownDurationSeconds,
  });
}

const timeline = [
  {
    date: "2026-06-01",
    completed_load_tss: 12,
    recommended_load_tss: 50,
    scheduled_load_tss: 40,
  },
];

describe("common Load daily-observation adapter", () => {
  it("compares the common model identity", () => {
    expect(sameCommonLoadIdentity(commonLoadIdentity, { ...commonLoadIdentity })).toBe(true);
    expect(
      sameCommonLoadIdentity(commonLoadIdentity, { ...commonLoadIdentity, version: "2" }),
    ).toBe(false);
  });

  it("leaves the projected timeline untouched while the observation range is unavailable", () => {
    expect(mergeCompletedCommonLoadObservations({ requestedRange: null, timeline })).toMatchObject({
      completedObservationsByDate: new Map(),
      completedActivityDatesWithoutLoad: [],
      timeline,
    });
  });

  it("uses complete common Load observations for completed Load", () => {
    const result = mergeCompletedCommonLoadObservations({
      requestedRange: { start_date: "2026-06-01", end_date: "2026-06-01", timezone: "UTC" },
      timeline,
      response: {
        timezone: "UTC",
        start_date: "2026-06-01",
        end_date: "2026-06-01",
        observations: [
          {
            date: "2026-06-01",
            aggregate: aggregate({
              status: "complete",
              load: 20,
              intensity: 0.8,
              contributingDurationSeconds: 1125,
              knownDurationSeconds: 1125,
              contributingActivityCount: 1,
              partialActivityCount: 0,
              unavailableActivityCount: 0,
              totalActivityCount: 1,
              unknownDurationActivityCount: 0,
            }),
          },
        ],
      },
    });

    expect(result.timeline[0]).toMatchObject({ completed_load_tss: 20 });
    expect(result.completedObservationsByDate.get("2026-06-01")).toMatchObject({
      state: "observed",
      hasUnavailableCompletedActivity: false,
      identity: commonLoadIdentity,
    });
  });

  it("keeps partial and unavailable common Load explicit rather than treating it as known zero", () => {
    const result = mergeCompletedCommonLoadObservations({
      requestedRange: { start_date: "2026-06-01", end_date: "2026-06-02", timezone: "UTC" },
      timeline,
      response: {
        timezone: "UTC",
        start_date: "2026-06-01",
        end_date: "2026-06-02",
        observations: [
          {
            date: "2026-06-01",
            aggregate: aggregate({
              status: "partial",
              load: 20,
              intensity: 0.8,
              contributingDurationSeconds: 1125,
              knownDurationSeconds: 2250,
              contributingActivityCount: 1,
              partialActivityCount: 1,
              unavailableActivityCount: 0,
              totalActivityCount: 1,
              unknownDurationActivityCount: 0,
            }),
          },
          {
            date: "2026-06-02",
            aggregate: aggregate({
              status: "unavailable",
              reason: "no_load_data",
              contributingDurationSeconds: 0,
              knownDurationSeconds: null,
              contributingActivityCount: 0,
              partialActivityCount: 0,
              unavailableActivityCount: 1,
              totalActivityCount: 1,
              unknownDurationActivityCount: 1,
            }),
          },
        ],
      },
    });

    expect(result.completedActivityDatesWithoutLoad).toEqual(["2026-06-01", "2026-06-02"]);
    expect(result.completedObservationsByDate.get("2026-06-01")).toMatchObject({
      state: "observed",
      hasUnavailableCompletedActivity: true,
    });
    expect(result.completedObservationsByDate.get("2026-06-02")).toMatchObject({
      state: "unavailable",
      hasUnavailableCompletedActivity: true,
    });
  });

  it("marks only future dates known zero while preserving uncovered history", () => {
    const effective = buildEffectiveCompletedObservationsByDate({
      completedObservationsByDate: new Map([
        [
          "2026-06-01",
          { hasUnavailableCompletedActivity: false, identity: null, state: "uncovered" as const },
        ],
      ]),
      endDate: "2026-06-04",
      todayKey: "2026-06-02",
    });

    expect(effective.get("2026-06-01")?.state).toBe("uncovered");
    expect(effective.get("2026-06-03")?.state).toBe("known_zero");
  });
});
