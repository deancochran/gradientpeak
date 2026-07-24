import { describe, expect, it } from "vitest";
import {
  deriveNormalizedPowerCompatibilityProjection,
  deriveNormalizedPowerCompatibilityProjectionFromSegments,
} from "../activity-normalized-power";

const segment = (id: string, normalizedPowerWatts?: number) => ({
  id,
  ordinal: 0,
  role: "activity" as const,
  category: "bike" as const,
  startOffsetMs: 0,
  endOffsetMs: 1_000,
  summary: {
    version: 1 as const,
    timing: { timingCoverage: "unavailable" as const },
    ...(normalizedPowerWatts === undefined ? {} : { normalizedPowerWatts }),
  },
});

describe("deriveNormalizedPowerCompatibilityProjection", () => {
  it("uses the single validated activity segment summary", () => {
    expect(
      deriveNormalizedPowerCompatibilityProjection({
        version: 1,
        elapsedMs: 1_000,
        segments: [segment("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", 247.5)],
      }),
    ).toBe(248);
  });

  it("abstains for multisport activity segments", () => {
    expect(
      deriveNormalizedPowerCompatibilityProjection({
        version: 1,
        elapsedMs: 2_000,
        segments: [
          segment("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", 247),
          { ...segment("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", 211), ordinal: 1, category: "run" },
        ],
      }),
    ).toBeNull();
  });

  it.each([
    ["malformed summary", [{ role: "activity", summary: { normalizedPowerWatts: 247.5 } }]],
    ["no activity segment", [{ role: "transition", summary: {} }]],
    [
      "multiple activity segments",
      [
        { role: "activity", summary: segment("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", 247).summary },
        { role: "activity", summary: segment("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", 211).summary },
      ],
    ],
  ])("returns null for %s", (_reason, segments) => {
    expect(deriveNormalizedPowerCompatibilityProjectionFromSegments(segments)).toBeNull();
  });
});
