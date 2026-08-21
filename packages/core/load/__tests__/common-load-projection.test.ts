import { describe, expect, it } from "vitest";
import {
  COMMON_LOAD_HISTORY_LONG_TERM_DAYS,
  COMMON_LOAD_HISTORY_RECENT_DAYS,
  projectCommonLoadTrend,
  reconstructCommonLoadTrendHistory,
} from "../index";

describe("reconstructCommonLoadTrendHistory", () => {
  it("sorts daily loads and reconstructs a finite series that reaches the trusted baseline", () => {
    const result = reconstructCommonLoadTrendHistory({
      baseline: { date: "2026-07-28", longTermLoad: 40, recentLoad: 35 },
      days: [
        { date: "2026-07-28", load: 0 },
        { date: "2026-07-26", load: 0 },
        { date: "2026-07-27", load: 80 },
      ],
    });

    expect(result.status).toBe("complete");
    expect(result.points.map((point) => point.date)).toEqual([
      "2026-07-26",
      "2026-07-27",
      "2026-07-28",
    ]);
    expect(result.points.at(-1)).toEqual({
      date: "2026-07-28",
      longTermLoad: 40,
      recentLoad: 35,
      loadBalance: 5,
    });
    expect(
      result.points.every((point) =>
        [point.longTermLoad, point.recentLoad, point.loadBalance].every(Number.isFinite),
      ),
    ).toBe(true);
    if (result.status !== "complete") throw new Error("Expected a complete reconstruction");
    const firstPoint = result.points[0];
    if (!firstPoint) throw new Error("Expected a reconstructed starting point");
    const replayed = projectCommonLoadTrend({
      baseline: firstPoint,
      days: [
        { date: "2026-07-27", state: "available", load: 80 },
        { date: "2026-07-28", state: "known_zero" },
      ],
    });
    expect(replayed.points.at(-1)?.longTermLoad).toBeCloseTo(40, 10);
    expect(replayed.points.at(-1)?.recentLoad).toBeCloseTo(35, 10);
  });

  it("rejects gaps and non-finite loads instead of emitting a misleading series", () => {
    expect(
      reconstructCommonLoadTrendHistory({
        baseline: { date: "2026-07-28", longTermLoad: 40, recentLoad: 35 },
        days: [
          { date: "2026-07-26", load: 0 },
          { date: "2026-07-28", load: 0 },
        ],
      }),
    ).toMatchObject({ status: "unavailable", reason: "nonconsecutive_days" });
    expect(
      reconstructCommonLoadTrendHistory({
        baseline: { date: "2026-07-28", longTermLoad: 40, recentLoad: 35 },
        days: [{ date: "2026-07-28", load: Number.POSITIVE_INFINITY }],
      }),
    ).toMatchObject({ status: "unavailable", reason: "invalid_input" });
  });
});

describe("projectCommonLoadTrend", () => {
  it("projects consecutive available and known-zero common Load days", () => {
    const result = projectCommonLoadTrend({
      baseline: { date: "2026-07-27", longTermLoad: 40, recentLoad: 50 },
      days: [
        { date: "2026-07-28", state: "available", load: 100 },
        { date: "2026-07-29", state: "known_zero" },
      ],
    });

    expect(result.status).toBe("complete");
    if (result.status !== "complete") throw new Error("Expected a complete projection");
    const firstProjected = result.points[1];
    const longTermAlpha = 1 - Math.exp(-1 / COMMON_LOAD_HISTORY_LONG_TERM_DAYS);
    const recentAlpha = 1 - Math.exp(-1 / COMMON_LOAD_HISTORY_RECENT_DAYS);
    expect(firstProjected?.longTermLoad).toBeCloseTo(40 + longTermAlpha * 60, 10);
    expect(firstProjected?.recentLoad).toBeCloseTo(50 + recentAlpha * 50, 10);
    expect(result.points[2]?.longTermLoad).toBeLessThan(firstProjected?.longTermLoad ?? 0);
    expect(result.points[2]?.recentLoad).toBeLessThan(firstProjected?.recentLoad ?? 0);
  });

  it("stops before an incomplete day instead of treating it as zero", () => {
    const result = projectCommonLoadTrend({
      baseline: { date: "2026-07-27", longTermLoad: 40, recentLoad: 50 },
      days: [
        { date: "2026-07-28", state: "available", load: 80 },
        { date: "2026-07-29", state: "unavailable", reason: "partial" },
        { date: "2026-07-30", state: "available", load: 60 },
      ],
    });

    expect(result).toMatchObject({
      status: "partial",
      reason: "incomplete_load",
      stoppedAt: "2026-07-29",
    });
    expect(result.points.map((point) => point.date)).toEqual(["2026-07-27", "2026-07-28"]);
  });

  it.each([
    {
      label: "a calendar gap",
      days: [{ date: "2026-07-29", state: "available" as const, load: 50 }],
      reason: "nonconsecutive_days",
    },
    {
      label: "a negative load",
      days: [{ date: "2026-07-28", state: "available" as const, load: -1 }],
      reason: "invalid_input",
    },
  ])("abstains for $label", ({ days, reason }) => {
    expect(
      projectCommonLoadTrend({
        baseline: { date: "2026-07-27", longTermLoad: 40, recentLoad: 50 },
        days,
      }),
    ).toMatchObject({ status: "unavailable", reason, points: [] });
  });

  it("returns the bounded projection before stopping at the maximum horizon", () => {
    const start = new Date("2026-01-01T00:00:00.000Z");
    const days = Array.from({ length: 367 }, (_, index) => {
      const date = new Date(start);
      date.setUTCDate(date.getUTCDate() + index + 1);
      return { date: date.toISOString().slice(0, 10), state: "known_zero" as const };
    });

    const result = projectCommonLoadTrend({
      baseline: { date: "2026-01-01", longTermLoad: 40, recentLoad: 50 },
      days,
    });

    expect(result).toMatchObject({
      status: "partial",
      reason: "projection_limit_reached",
      stoppedAt: days[366]?.date,
    });
    expect(result.points).toHaveLength(367);
  });
});
