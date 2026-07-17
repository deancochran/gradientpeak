import { describe, expect, it } from "vitest";

import {
  activityArtifactSemanticsSchema,
  compareActivityArtifactSemantics,
} from "../semantic-comparator";

const expected = {
  segments: [
    {
      role: "activity" as const,
      category: "run" as const,
      rawSport: 1,
      rawSubSport: "road",
      startOffsetMs: 0,
      endOffsetMs: 60_000,
      activeMs: 55_000,
      movingMs: 50_000,
      distanceMeters: 200,
      pauseRanges: [{ startOffsetMs: 20_000, endOffsetMs: 25_000 }],
      timerEvents: [
        { type: "start" as const, offsetMs: 0 },
        { type: "pause" as const, offsetMs: 20_000 },
        { type: "resume" as const, offsetMs: 25_000 },
        { type: "stop" as const, offsetMs: 60_000 },
      ],
    },
    {
      role: "transition" as const,
      startOffsetMs: 60_000,
      endOffsetMs: 70_000,
      activeMs: 10_000,
      movingMs: 10_000,
    },
    {
      role: "activity" as const,
      category: "bike" as const,
      rawSport: 2,
      startOffsetMs: 70_000,
      endOffsetMs: 130_000,
      activeMs: 60_000,
      movingMs: 60_000,
      distanceMeters: 500,
    },
  ],
  totals: { elapsedMs: 130_000, activeMs: 125_000, movingMs: 120_000, distanceMeters: 700 },
};

describe("activity artifact semantic comparator", () => {
  it("accepts FIT quantization within explicit tolerances", () => {
    const actual = structuredClone(expected);
    const firstSegment = actual.segments[0];
    if (!firstSegment) throw new Error("Fixture requires a segment.");
    firstSegment.distanceMeters = 199;
    firstSegment.pauseRanges = [{ startOffsetMs: 21_000, endOffsetMs: 26_000 }];
    firstSegment.timerEvents = [
      { type: "start", offsetMs: 0 },
      { type: "pause", offsetMs: 21_000 },
      { type: "resume", offsetMs: 26_000 },
      { type: "stop", offsetMs: 60_000 },
    ];
    actual.totals.elapsedMs += 1_000;

    expect(compareActivityArtifactSemantics({ expected, actual })).toEqual({
      equivalent: true,
      differences: [],
    });
  });

  it("reports order/category and numeric differences outside tolerances", () => {
    const actual = structuredClone(expected);
    const firstSegment = actual.segments[0];
    if (!firstSegment) throw new Error("Fixture requires a segment.");
    firstSegment.category = "bike";
    firstSegment.timerEvents = [
      { type: "start", offsetMs: 0 },
      { type: "pause", offsetMs: 21_001 },
      { type: "resume", offsetMs: 25_000 },
      { type: "stop", offsetMs: 60_000 },
    ];

    const comparison = compareActivityArtifactSemantics({ expected, actual });
    expect(comparison.equivalent).toBe(false);
    expect(comparison.differences.map((difference) => difference.path)).toContainEqual([
      "segments",
      0,
      "category",
    ]);
    expect(comparison.differences.map((difference) => difference.path)).toContainEqual([
      "segments",
      0,
      "timerEvents",
      1,
      "offsetMs",
    ]);
  });

  it("does not let opposite boundary shifts hide a duration mismatch", () => {
    const actual = structuredClone(expected);
    const firstSegment = actual.segments[0];
    if (!firstSegment) throw new Error("Fixture requires a segment.");
    firstSegment.startOffsetMs += 1_000;
    firstSegment.endOffsetMs -= 1_000;
    firstSegment.timerEvents = [
      { type: "start", offsetMs: 1_000 },
      { type: "pause", offsetMs: 20_000 },
      { type: "resume", offsetMs: 25_000 },
      { type: "stop", offsetMs: 59_000 },
    ];

    const comparison = compareActivityArtifactSemantics({ expected, actual });
    expect(comparison.equivalent).toBe(false);
    expect(comparison.differences.map((difference) => difference.path)).toContainEqual([
      "segments",
      0,
      "durationMs",
    ]);
  });

  it("compares repeated swim, unknown raw values, pauses, timers, and parent timing", () => {
    const semantics = activityArtifactSemanticsSchema.parse({
      segments: [
        {
          role: "activity" as const,
          category: "swim" as const,
          rawSport: 5,
          rawSubSport: "lap_swimming",
          startOffsetMs: 0,
          endOffsetMs: 10_000,
          activeMs: 9_000,
          movingMs: 8_000,
          pauseRanges: [{ startOffsetMs: 4_000, endOffsetMs: 5_000 }],
          timerEvents: [
            { type: "start", offsetMs: 0 },
            { type: "pause", offsetMs: 4_000 },
            { type: "resume", offsetMs: 5_000 },
            { type: "stop", offsetMs: 10_000 },
          ],
        },
        {
          role: "unknown" as const,
          rawType: "vendor_leg",
          rawSport: 254,
          rawSubSport: "vendor_leg",
          startOffsetMs: 10_000,
          endOffsetMs: 11_000,
          activeMs: 1_000,
          movingMs: 1_000,
        },
        {
          role: "activity" as const,
          category: "swim" as const,
          rawSport: 5,
          rawSubSport: "open_water",
          startOffsetMs: 11_000,
          endOffsetMs: 20_000,
          activeMs: 8_000,
          movingMs: 7_000,
        },
      ],
      totals: { elapsedMs: 20_000, activeMs: 18_000, movingMs: 16_000 },
    });
    const actual = structuredClone(semantics);
    const first = actual.segments[0];
    if (first?.role !== "activity") throw new Error("Fixture requires an activity segment.");
    first.rawSubSport = "open_water";
    first.pauseRanges = [{ startOffsetMs: 4_000, endOffsetMs: 6_500 }];
    first.timerEvents = [
      { type: "start", offsetMs: 0 },
      { type: "pause", offsetMs: 6_000 },
      { type: "resume", offsetMs: 7_000 },
      { type: "stop", offsetMs: 10_000 },
    ];
    const third = actual.segments[2];
    if (third?.role !== "activity")
      throw new Error("Fixture requires a repeated activity segment.");
    third.activeMs = 6_000;
    third.movingMs = 5_000;
    actual.totals.activeMs = 16_000;
    actual.totals.movingMs = 14_000;

    const comparison = compareActivityArtifactSemantics({ expected: semantics, actual });
    expect(comparison.equivalent).toBe(false);
    expect(comparison.differences.map((difference) => difference.path)).toEqual(
      expect.arrayContaining([
        ["segments", 0, "rawSubSport"],
        ["segments", 0, "pauseRanges", 0, "durationMs"],
        ["segments", 0, "timerEvents", 1, "offsetMs"],
        ["totals", "activeMs"],
      ]),
    );
  });

  it("rejects negative, infinite, and NaN tolerances", () => {
    for (const invalid of [-1, Number.POSITIVE_INFINITY, Number.NaN]) {
      expect(() =>
        compareActivityArtifactSemantics({
          expected,
          actual: expected,
          tolerances: { timestampMs: invalid, durationMs: 1, distanceMeters: 1 },
        }),
      ).toThrow();
    }
  });

  it("rejects malformed roles and out-of-order or out-of-bounds timing evidence", () => {
    const malformed = [
      {
        segments: [{ role: "activity", startOffsetMs: 0, endOffsetMs: 10 }],
        totals: { elapsedMs: 10 },
      },
      {
        segments: [{ role: "rest", category: "run", startOffsetMs: 0, endOffsetMs: 10 }],
        totals: { elapsedMs: 10 },
      },
      {
        segments: [{ role: "unknown", startOffsetMs: 0, endOffsetMs: 10 }],
        totals: { elapsedMs: 10 },
      },
      {
        segments: [
          {
            role: "activity",
            category: "run",
            startOffsetMs: 0,
            endOffsetMs: 100,
            pauseRanges: [
              { startOffsetMs: 50, endOffsetMs: 60 },
              { startOffsetMs: 40, endOffsetMs: 45 },
            ],
            timerEvents: [{ type: "pause", offsetMs: 101 }],
          },
        ],
        totals: { elapsedMs: 100 },
      },
    ];

    for (const value of malformed) {
      expect(() =>
        compareActivityArtifactSemantics({ expected: value, actual: expected }),
      ).toThrow();
    }
  });

  it("accepts a raw-sport-only unknown segment", () => {
    const semantics = {
      segments: [{ role: "unknown", rawSport: 254, startOffsetMs: 0, endOffsetMs: 1_000 }],
      totals: { elapsedMs: 1_000 },
    };
    expect(compareActivityArtifactSemantics({ expected: semantics, actual: semantics })).toEqual({
      equivalent: true,
      differences: [],
    });
  });

  it("rejects identical documents with invalid document-level semantics", () => {
    const activity = (startOffsetMs: number, endOffsetMs: number) => ({
      role: "activity",
      category: "run",
      startOffsetMs,
      endOffsetMs,
    });
    const invalidDocuments = [
      {
        segments: [activity(0, 15), activity(10, 20)],
        totals: { elapsedMs: 20 },
      },
      {
        segments: [activity(10, 20), activity(0, 10)],
        totals: { elapsedMs: 20 },
      },
      {
        segments: [{ role: "transition", startOffsetMs: 0, endOffsetMs: 5 }, activity(5, 10)],
        totals: { elapsedMs: 10 },
      },
      {
        segments: [activity(0, 11)],
        totals: { elapsedMs: 10 },
      },
      {
        segments: [
          { role: "rest", startOffsetMs: 0, endOffsetMs: 5 },
          { role: "rest", startOffsetMs: 5, endOffsetMs: 10 },
        ],
        totals: { elapsedMs: 10 },
      },
      {
        segments: [
          {
            ...activity(0, 5_000),
            activeMs: 4_000,
            movingMs: 3_000,
          },
        ],
        totals: { elapsedMs: 5_000, activeMs: 1_000, movingMs: 1_000 },
      },
    ];

    for (const document of invalidDocuments) {
      expect(() =>
        compareActivityArtifactSemantics({ expected: document, actual: document }),
      ).toThrow();
    }
  });
});
