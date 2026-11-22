import { describe, expect, it } from "vitest";
import { buildSelectedWeekBucket } from "./trainingPathSelectedWeekBucket";

const commonLoadIdentity = {
  model: "gradientpeak_relative_load" as const,
  version: "1" as const,
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
            plannedLoad: 20,
            targetLoad: 0,
          },
        ],
      }),
    ).toMatchObject({ targetLoad: null, loadDelta: null });
    expect(
      buildSelectedWeekBucket({
        ...base,
        points: [{ date: "2026-06-01", targetLoad: 0 }],
      }),
    ).toMatchObject({ targetLoad: null, loadDelta: null });
    expect(
      buildSelectedWeekBucket({
        ...base,
        points: Array.from({ length: 7 }, (_, index) => ({
          actualOrScheduledLoad: 0,
          date: `2026-06-0${index + 1}`,
          targetLoad: 0,
        })),
      }),
    ).toMatchObject({ targetLoad: 0, loadDelta: 0 });
  });

  it("keeps completed aggregate null for incompatible or unavailable observations", () => {
    const bucket = buildSelectedWeekBucket({
      weekStart: "2026-06-01",
      weekEnd: "2026-06-07",
      points: [
        {
          date: "2026-06-01",
          completedLoad: 40,
          completedObservationState: "observed",
          completedCommonLoadIdentity: commonLoadIdentity,
        },
        {
          date: "2026-06-02",
          completedLoad: 20,
          completedObservationState: "observed",
          completedCommonLoadIdentity: { ...commonLoadIdentity, version: "2" },
        },
      ],
    });

    expect(bucket).toMatchObject({ completedLoad: null, completedLoadUnavailable: true });

    expect(
      buildSelectedWeekBucket({
        weekStart: "2026-06-01",
        weekEnd: "2026-06-07",
        points: [
          {
            date: "2026-06-01",
            completedLoad: 40,
            completedObservationState: "observed",
            completedCommonLoadIdentity: commonLoadIdentity,
          },
          {
            date: "2026-06-02",
            completedObservationState: "unavailable",
            hasCompletedActivityWithoutLoad: true,
          },
        ],
      }),
    ).toMatchObject({ completedLoad: null, completedLoadUnavailable: true });
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
        points: [{ date: weekStart, targetLoad: 10 }],
      }),
    ).not.toThrow();
    expect(
      buildSelectedWeekBucket({
        weekStart,
        weekEnd: weekStart,
        points: [{ date: weekStart, targetLoad: 10 }],
      }),
    ).toMatchObject({ targetLoad: null, loadDelta: null });
  });
});
