import { describe, expect, it } from "vitest";
import {
  buildRecordedHistoryVisuals,
  normalizeRecordedGoalActivities,
  type RecordedGoalActivity,
  recordedHistoryPageState,
  recordedHistoryWindow,
} from "../recorded-history-visuals";

const window = recordedHistoryWindow("2026-03-10T12:00:00Z", "America/Los_Angeles");
if (!window) throw new Error("Invalid fixture window");
const base = { category: "run" as const, window, complete: true };
function row(
  id: string,
  distanceMeters: number | null = 5000,
  elapsedSeconds: number | null = 1500,
  startedAt = "2026-03-09T14:00:00Z",
): RecordedGoalActivity {
  return { id, title: `Run ${id}`, category: "run", startedAt, distanceMeters, elapsedSeconds };
}
type Input = Parameters<typeof normalizeRecordedGoalActivities>[0][number];
function raw(): Input {
  return {
    id: "one",
    title: "Run",
    time: { startedAt: "2026-03-09T14:00:00Z", finishedAt: null },
    activityComposition: { kind: "single", categories: ["run"] },
    metrics: [
      {
        key: "distance",
        label: "Distance",
        status: "available",
        value: 5000,
        unit: "meters",
        reason: null,
      },
      {
        key: "elapsed_duration",
        label: "Elapsed",
        status: "available",
        value: 1500,
        unit: "seconds",
        reason: null,
      },
    ],
  };
}

describe("recorded goal observations", () => {
  it("uses athlete-local Monday windows across DST and refuses missing or invalid timezone", () => {
    const sunday = recordedHistoryWindow("2026-03-09T06:30:00Z", "America/Los_Angeles");
    const monday = recordedHistoryWindow("2026-03-09T07:30:00Z", "America/Los_Angeles");
    expect(sunday?.today).toBe("2026-03-08");
    expect(sunday?.currentWeek).toBe("2026-03-02");
    expect(monday?.currentWeek).toBe("2026-03-09");
    expect(monday?.weeks).toHaveLength(12);
    expect(monday?.startsAt).toBe("2025-12-22T08:00:00.000Z");
    expect(recordedHistoryWindow("2026-03-09T07:30:00Z", null)).toBeNull();
    expect(recordedHistoryWindow("invalid", "UTC")).toBeNull();
    expect(recordedHistoryWindow("2026-03-09T07:30:00Z", "invalid")).toBeNull();
  });

  it("counts deduplicated recorded single activities in local weeks, not UTC weeks", () => {
    const sunday = row("sun", null, null, "2026-03-09T06:59:00Z");
    const monday = row("mon", null, null, "2026-03-09T07:00:00Z");
    const result = buildRecordedHistoryVisuals({
      ...base,
      objective: { type: "consistency", target_sessions_per_week: 3, target_weeks: 8 },
      activities: [
        sunday,
        monday,
        monday,
        { ...monday, id: "bike", category: "bike" },
        row("future", 5000, 1500, "2026-03-11T12:00:00Z"),
      ],
    });
    const chart = result.charts[0];
    expect(chart?.points.find((point) => point.date === "2026-03-02")?.value).toBe(1);
    expect(chart?.points.at(-1)).toMatchObject({ value: 1, inProgress: true });
    expect(chart?.points[0]?.value).toBe(0);
    expect(chart?.target).toBe(3);
    expect(chart?.gap).toBe(2);
    expect(result.targetWeeks).toBe(8);
    expect(JSON.stringify(result)).not.toMatch(/achiev|streak|probability|forecast/i);
  });

  it("includes only the explicit distance band, retaining actual elapsed time and distance", () => {
    const result = buildRecordedHistoryVisuals({
      ...base,
      objective: {
        type: "event_performance",
        activity_category: "run",
        distance_m: 5000,
        target_time_s: 1500,
      },
      activities: [
        row("lower", 4950, 1600),
        row("upper", 5050, 1550),
        row("outside", 5050.001, 1200),
        row("short", 4949.999, 1000),
        row("missing-distance", null, 1300),
        row("missing-time", 5000, null),
      ],
    });
    const chart = result.charts[0];
    expect(chart?.points.map((point) => point.id).sort()).toEqual([
      "lower",
      "missing-time",
      "upper",
    ]);
    expect(chart?.points.find((point) => point.id === "upper")).toMatchObject({
      value: 1550,
      activities: [{ distanceMeters: 5050 }],
    });
    expect(chart?.best).toBe(1550);
    expect(chart?.gap).toBe(50);
    expect(chart?.points.find((point) => point.id === "missing-time")?.value).toBeNull();
  });

  it("derives only the authored speed target time, never scales observations", () => {
    const result = buildRecordedHistoryVisuals({
      ...base,
      objective: {
        type: "event_performance",
        activity_category: "run",
        distance_m: 5000,
        target_speed_mps: 4,
      },
      activities: [row("run", 4950, 1400)],
    });
    expect(result.charts[0]).toMatchObject({
      target: 1250,
      best: 1400,
      gap: 150,
      points: [{ value: 1400 }],
    });
  });

  it("keeps completion dimensions and their source activities independent", () => {
    const result = buildRecordedHistoryVisuals({
      ...base,
      objective: { type: "completion", distance_m: 10000, duration_s: 3600 },
      activities: [row("distance", 12000, 1000), row("duration", 2000, 4000)],
    });
    expect(result.charts.map(({ id, best }) => ({ id, best }))).toEqual([
      { id: "distance", best: 12000 },
      { id: "elapsed", best: 4000 },
    ]);
    expect(result.charts[0]?.points[0]?.activities[0]?.id).toBe("distance");
    expect(result.charts[1]?.points[1]?.activities[0]?.id).toBe("duration");
    expect(result).not.toHaveProperty("achieved");
  });

  it("does not invent a session target or streak for weeks-only goals", () => {
    const result = buildRecordedHistoryVisuals({
      ...base,
      objective: { type: "consistency", target_weeks: 6 },
      activities: [],
    });
    expect(result.targetWeeks).toBe(6);
    expect(result.charts[0]).toMatchObject({ target: null, best: null, gap: null });
    expect(result.charts[0]?.points).toHaveLength(12);
  });

  it("never treats partial history as historical zero sessions or complete totals", () => {
    const result = buildRecordedHistoryVisuals({
      ...base,
      complete: false,
      objective: { type: "consistency", target_sessions_per_week: 3 },
      activities: [row("one")],
    });
    expect(result.charts[0]?.points[0]).toMatchObject({ value: null, lowerBound: true });
    expect(result.charts[0]?.gap).toBeNull();
    expect(result.charts[0]?.points.at(-1)).toMatchObject({
      value: 1,
      lowerBound: true,
      inProgress: true,
    });
    expect(
      recordedHistoryPageState({
        pageCount: 20,
        hasMore: true,
        hasCursor: true,
        failed: false,
        fetching: false,
      }),
    ).toEqual({ state: "partial", canContinue: false, complete: false });
    expect(
      recordedHistoryPageState({
        pageCount: 1,
        hasMore: true,
        hasCursor: false,
        failed: false,
        fetching: false,
      }).state,
    ).toBe("partial");
    expect(
      recordedHistoryPageState({
        pageCount: 2,
        hasMore: false,
        hasCursor: false,
        failed: true,
        fetching: false,
      }).complete,
    ).toBe(false);
    expect(
      recordedHistoryPageState({
        pageCount: 1,
        hasMore: false,
        hasCursor: false,
        failed: false,
        fetching: false,
      }).complete,
    ).toBe(true);
  });

  it("rejects multisport/unknown composition and unavailable, partial, invalid, or wrong-unit metrics", () => {
    const source = raw();
    expect(normalizeRecordedGoalActivities([source])).toMatchObject([
      { distanceMeters: 5000, elapsedSeconds: 1500 },
    ]);
    expect(
      normalizeRecordedGoalActivities([
        { ...source, activityComposition: { kind: "multisport", categories: ["run", "bike"] } },
        { ...source, activityComposition: { kind: "unknown", categories: ["run"] } },
        { ...source, activityComposition: { kind: "single", categories: ["run", "bike"] } },
        { ...source, time: { startedAt: null, finishedAt: "2026-03-09T15:00:00Z" } },
      ]),
    ).toEqual([]);
    const missing = normalizeRecordedGoalActivities([
      {
        ...source,
        metrics: [
          {
            key: "distance",
            label: "Distance",
            status: "partial",
            value: 5000,
            unit: "meters",
            reason: "Partial",
          },
          {
            key: "elapsed_duration",
            label: "Elapsed",
            status: "unavailable",
            value: null,
            unit: "seconds",
            reason: "Missing",
          },
          {
            key: "active_duration",
            label: "Active",
            status: "available",
            value: 1200,
            unit: "seconds",
            reason: null,
          },
        ],
      },
    ]);
    expect(missing[0]).toMatchObject({ distanceMeters: null, elapsedSeconds: null });
    for (const value of [0, -1, Infinity, Number.NaN]) {
      expect(
        normalizeRecordedGoalActivities([
          {
            ...source,
            metrics: [
              {
                key: "distance",
                label: "Distance",
                status: "available",
                value,
                unit: "meters",
                reason: null,
              },
            ],
          },
        ])[0]?.distanceMeters,
      ).toBeNull();
    }
    expect(
      normalizeRecordedGoalActivities([
        {
          ...source,
          metrics: [
            {
              key: "distance",
              label: "Distance",
              status: "available",
              value: 5,
              unit: "km",
              reason: null,
            },
          ],
        },
      ])[0]?.distanceMeters,
    ).toBeNull();
  });
});
