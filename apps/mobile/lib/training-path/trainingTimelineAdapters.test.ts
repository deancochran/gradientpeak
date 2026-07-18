import type { ActivityTssIdentity } from "@repo/core";
import { buildTrainingTimelineWindow } from "@repo/core/training-timeline";
import { describe, expect, it } from "vitest";
import {
  buildDailyTrainingAdjustmentPointsFromTimelineWindow,
  buildEffectiveCompletedObservationsByDate,
  mergeCompletedTssObservations,
  sameTssIdentity,
} from "./trainingTimelineAdapters";

const bikeIdentity: ActivityTssIdentity = {
  sport: "bike",
  method: "power_threshold",
  source: "activity_analysis",
  version: "1",
  calibration: { type: "ftp_watts", value: 250 },
};

describe("sameTssIdentity", () => {
  it("compares stable series identity without fragmenting on calibration changes", () => {
    expect(sameTssIdentity(bikeIdentity, { ...bikeIdentity })).toBe(true);
    expect(sameTssIdentity(bikeIdentity, { ...bikeIdentity, sport: "run" })).toBe(false);
    expect(
      sameTssIdentity(bikeIdentity, {
        ...bikeIdentity,
        method: "run_pace_threshold",
        calibration: { type: "threshold_speed_mps", value: 4 },
      }),
    ).toBe(false);
    expect(
      sameTssIdentity(bikeIdentity, {
        ...bikeIdentity,
        calibration: { type: "ftp_watts", value: 251 },
      }),
    ).toBe(true);
  });
});

describe("mergeCompletedTssObservations", () => {
  it("leaves the projected timeline untouched while the observation range is unavailable", () => {
    expect(
      mergeCompletedTssObservations({
        requestedRange: null,
        timeline: [
          {
            date: "2026-06-01",
            completed_load_tss: 12,
            recommended_load_tss: 50,
            scheduled_load_tss: 40,
          },
        ],
      }),
    ).toEqual({
      completedObservationsByDate: new Map(),
      completedActivityDatesWithoutLoad: [],
      timeline: [
        {
          date: "2026-06-01",
          completed_load_tss: 12,
          recommended_load_tss: 50,
          scheduled_load_tss: 40,
        },
      ],
    });
  });

  it("does not merge placeholder observations bucketed in a different timezone", () => {
    const result = mergeCompletedTssObservations({
      requestedRange: {
        start_date: "2026-06-01",
        end_date: "2026-06-01",
        timezone: "America/New_York",
      },
      response: {
        start_date: "2026-06-01",
        end_date: "2026-06-01",
        timezone: "America/Los_Angeles",
        observations: [
          {
            date: "2026-06-01",
            state: "calculated",
            tss_identity: bikeIdentity,
            unavailable_activity_count: 0,
            value: 90,
          },
        ],
      },
      timeline: [
        {
          date: "2026-06-01",
          completed_load_tss: 12,
          recommended_load_tss: 50,
          scheduled_load_tss: 40,
        },
      ],
    });

    expect(result.completedObservationsByDate.get("2026-06-01")?.state).toBe("uncovered");
    expect(result.timeline[0]?.completed_load_tss).toBe(0);
  });

  it("maps calculated values to observed completion, overwrites stale load, and keeps mixed unavailability", () => {
    const result = mergeCompletedTssObservations({
      requestedRange: { start_date: "2026-06-01", end_date: "2026-06-01", timezone: "UTC" },
      timeline: [
        {
          date: "2026-06-01",
          completed_load_tss: 99,
          recommended_load_tss: 50,
          scheduled_load_tss: 40,
        },
      ],
      response: {
        timezone: "UTC",
        start_date: "2026-06-01",
        end_date: "2026-06-01",
        observations: [
          {
            date: "2026-06-01",
            state: "calculated",
            tss_identity: bikeIdentity,
            unavailable_activity_count: 0,
            value: 20,
          },
          {
            date: "2026-06-01",
            state: "calculated",
            tss_identity: bikeIdentity,
            value: 15,
            unavailable_activity_count: 1,
          },
        ],
      },
    });

    expect(result.timeline[0]).toMatchObject({
      date: "2026-06-01",
      completed_load_tss: 35,
      recommended_load_tss: 50,
      scheduled_load_tss: 40,
    });
    expect(result.completedActivityDatesWithoutLoad).toEqual(["2026-06-01"]);
  });

  it("includes unavailable-only and completed-only API local dates", () => {
    const result = mergeCompletedTssObservations({
      requestedRange: { start_date: "2026-06-01", end_date: "2026-06-03", timezone: "UTC" },
      timeline: [],
      response: {
        timezone: "UTC",
        start_date: "2026-06-01",
        end_date: "2026-06-03",
        observations: [
          {
            date: "2026-06-03",
            state: "unavailable",
            tss_identity: null,
            unavailable_activity_count: 1,
            value: null,
          },
          {
            date: "2026-06-02",
            state: "calculated",
            tss_identity: bikeIdentity,
            unavailable_activity_count: 0,
            value: 42,
          },
        ],
      },
    });

    expect(result.timeline.map((point) => point.date)).toEqual(["2026-06-02", "2026-06-03"]);
    expect(result.timeline[0]?.completed_load_tss).toBe(42);
    expect(result.timeline[1]?.completed_load_tss).toBe(0);
    expect(result.completedActivityDatesWithoutLoad).toEqual(["2026-06-03"]);
    expect(result.completedObservationsByDate.get("2026-06-01")?.state).toBe("known_zero");
  });

  it("clears stale baseline load throughout a successful sparse response range", () => {
    const result = mergeCompletedTssObservations({
      requestedRange: { start_date: "2026-06-01", end_date: "2026-06-02", timezone: "UTC" },
      response: {
        timezone: "UTC",
        start_date: "2026-06-01",
        end_date: "2026-06-02",
        observations: [],
      },
      timeline: [
        { date: "2026-06-01", actual_tss: 80 },
        { date: "2026-06-02", completed_load_tss: 45 },
      ],
    });

    expect(result.timeline.map((point) => point.completed_load_tss)).toEqual([0, 0]);
    expect(result.completedObservationsByDate.get("2026-06-02")?.state).toBe("known_zero");
  });

  it("marks a newly requested range uncovered while retaining overlapping prior response data", () => {
    const result = mergeCompletedTssObservations({
      requestedRange: { start_date: "2026-06-01", end_date: "2026-06-03", timezone: "UTC" },
      response: {
        timezone: "UTC",
        start_date: "2026-06-01",
        end_date: "2026-06-02",
        observations: [
          {
            date: "2026-06-02",
            state: "calculated",
            tss_identity: bikeIdentity,
            unavailable_activity_count: 0,
            value: 42,
          },
        ],
      },
      timeline: [{ date: "2026-06-03", completed_load_tss: 99 }],
    });

    expect(result.completedObservationsByDate.get("2026-06-02")?.state).toBe("observed");
    expect(result.completedObservationsByDate.get("2026-06-03")?.state).toBe("uncovered");
    expect(result.timeline.find((point) => point.date === "2026-06-03")?.completed_load_tss).toBe(
      0,
    );
  });
});

describe("buildEffectiveCompletedObservationsByDate", () => {
  it("marks only future dates known zero while preserving uncovered history", () => {
    const effective = buildEffectiveCompletedObservationsByDate({
      completedObservationsByDate: new Map([
        [
          "2026-06-01",
          {
            hasUnavailableCompletedActivity: false,
            identity: null,
            state: "uncovered" as const,
          },
        ],
      ]),
      endDate: "2026-06-04",
      todayKey: "2026-06-02",
    });

    expect(effective.get("2026-06-01")?.state).toBe("uncovered");
    expect(effective.has("2026-06-02")).toBe(false);
    expect(effective.get("2026-06-03")?.state).toBe("known_zero");
    expect(effective.get("2026-06-04")?.state).toBe("known_zero");
  });
});

describe("buildDailyTrainingAdjustmentPointsFromTimelineWindow", () => {
  it("keeps completed, scheduled, tentative, and recommended loads semantically distinct", () => {
    const timelineWindow = buildTrainingTimelineWindow({
      today: "2026-06-01",
      startDate: "2026-06-01",
      endDate: "2026-06-02",
      loadPoints: [
        {
          date: "2026-06-01",
          completed_load_tss: 35,
          scheduled_load_tss: 40,
          tentative_scheduled_load_tss: 10,
          recommended_load_tss: 50,
        },
        {
          date: "2026-06-02",
          scheduled_load_tss: 30,
          tentative_scheduled_load_tss: 5,
          recommended_load_tss: 45,
        },
      ],
    });

    const points = buildDailyTrainingAdjustmentPointsFromTimelineWindow({
      targetLoadDates: new Set(["2026-06-01", "2026-06-02"]),
      timelineWindow,
    });

    expect(points[0]).toMatchObject({
      plannedLoadTss: 40,
      tentativePlannedLoadTss: 10,
      completedLoadTss: 35,
      targetLoadTss: 50,
      actualOrScheduledLoadTss: 50,
      loadDeltaTss: 0,
      plannedDeltaTss: 0,
    });
    expect(points[1]).toMatchObject({
      plannedLoadTss: 30,
      tentativePlannedLoadTss: 5,
      completedLoadTss: 0,
      targetLoadTss: 45,
      actualOrScheduledLoadTss: 35,
      loadDeltaTss: -10,
      plannedDeltaTss: -10,
    });
  });

  it("suppresses normalized target zero when Plan has no eligible goal", () => {
    const timelineWindow = buildTrainingTimelineWindow({
      today: "2026-06-01",
      startDate: "2026-06-01",
      endDate: "2026-06-01",
      loadPoints: [{ date: "2026-06-01", completed_load_tss: 20, scheduled_load_tss: 30 }],
    });

    expect(
      buildDailyTrainingAdjustmentPointsFromTimelineWindow({
        targetLoadDates: new Set(),
        timelineWindow,
      })[0],
    ).toMatchObject({ hasTargetLoad: false, targetLoadTss: 0 });
  });

  it("makes target availability date-specific for completed-only history", () => {
    const timelineWindow = buildTrainingTimelineWindow({
      today: "2026-06-01",
      startDate: "2026-06-01",
      endDate: "2026-06-02",
      loadPoints: [
        { date: "2026-06-01", completed_load_tss: 20 },
        { date: "2026-06-02", recommended_load_tss: 0 },
      ],
    });

    const points = buildDailyTrainingAdjustmentPointsFromTimelineWindow({
      targetLoadDates: new Set(["2026-06-02"]),
      timelineWindow,
    });

    expect(points[0]).toMatchObject({ hasTargetLoad: false, completedLoadTss: 20 });
    expect(points[1]).toMatchObject({ hasTargetLoad: true, targetLoadTss: 0 });
  });
});
