import { describe, expect, it } from "vitest";
import { buildSelectedWeekBucket } from "./trainingPathSelectedWeekBucket";

const bikeIdentity = {
  sport: "bike" as const,
  method: "power_threshold" as const,
  source: "activity_analysis" as const,
  version: "1" as const,
  calibration: { type: "ftp_watts" as const, value: 250 },
};

describe("buildSelectedWeekBucket", () => {
  it("requires all seven week dates while preserving seven explicit zero targets", () => {
    const base = {
      weekStart: "2026-06-01",
      weekEnd: "2026-06-07",
    };

    expect(
      buildSelectedWeekBucket({
        ...base,
        points: [
          {
            date: "2026-06-01",
            hasTargetLoad: false,
            plannedLoadTss: 20,
            targetLoadTss: 0,
          },
        ],
      }),
    ).toMatchObject({ targetLoadTss: null, loadDeltaTss: null });
    expect(
      buildSelectedWeekBucket({
        ...base,
        points: [{ date: "2026-06-01", targetLoadTss: 0 }],
      }),
    ).toMatchObject({ targetLoadTss: null, loadDeltaTss: null });
    expect(
      buildSelectedWeekBucket({
        ...base,
        points: Array.from({ length: 7 }, (_, index) => ({
          date: `2026-06-0${index + 1}`,
          targetLoadTss: 0,
        })),
      }),
    ).toMatchObject({ targetLoadTss: 0, loadDeltaTss: 0 });
  });

  it("keeps completed aggregate null for incompatible or unavailable observations", () => {
    const bucket = buildSelectedWeekBucket({
      weekStart: "2026-06-01",
      weekEnd: "2026-06-07",
      points: [
        {
          date: "2026-06-01",
          completedLoadTss: 40,
          completedObservationState: "observed",
          completedTssIdentity: bikeIdentity,
        },
        {
          date: "2026-06-02",
          completedLoadTss: 20,
          completedObservationState: "observed",
          completedTssIdentity: {
            sport: "run",
            method: "run_pace_threshold",
            source: "activity_analysis",
            version: "1",
            calibration: { type: "threshold_speed_mps", value: 4 },
          },
        },
      ],
    });

    expect(bucket).toMatchObject({ completedLoadTss: null, completedLoadUnavailable: true });

    expect(
      buildSelectedWeekBucket({
        weekStart: "2026-06-01",
        weekEnd: "2026-06-07",
        points: [
          {
            date: "2026-06-01",
            completedLoadTss: 40,
            completedObservationState: "observed",
            completedTssIdentity: bikeIdentity,
          },
          {
            date: "2026-06-02",
            completedObservationState: "unavailable",
            hasCompletedActivityWithoutLoad: true,
          },
        ],
      }),
    ).toMatchObject({ completedLoadTss: null, completedLoadUnavailable: true });
  });

  it.each([
    "not-a-date",
    "2026-02-30",
    "999999-01-01",
  ])("treats invalid week start %s as unavailable instead of throwing", (weekStart) => {
    expect(() =>
      buildSelectedWeekBucket({
        weekStart,
        weekEnd: weekStart,
        points: [{ date: weekStart, targetLoadTss: 10 }],
      }),
    ).not.toThrow();
    expect(
      buildSelectedWeekBucket({
        weekStart,
        weekEnd: weekStart,
        points: [{ date: weekStart, targetLoadTss: 10 }],
      }),
    ).toMatchObject({ targetLoadTss: null, loadDeltaTss: null });
  });
});
