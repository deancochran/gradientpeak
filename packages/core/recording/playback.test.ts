import { describe, expect, it } from "vitest";
import {
  advancePlayback,
  buildPlaybackIndex,
  clampPlaybackElapsed,
  playbackFrameAt,
  playbackTimestampMs,
} from "./playback";

const start = Date.parse("2026-09-20T10:00:00Z");
describe("persisted playback timing", () => {
  it("normalizes actual timestamps, stable-sorts, merges supplied duplicate fields and keeps coordinate pairs", () => {
    const index = buildPlaybackIndex([
      { timestamp: start + 2000, metrics: { power: 200 } },
      {
        timestamp: new Date(start),
        metrics: { power: 100 },
        position: { latitude: 40, longitude: -74 },
      },
      { timestamp: "2026-09-20T10:00:00Z", metrics: { heartRate: 140 } },
      {
        timestamp: start,
        metrics: { power: 120 },
        position: { latitude: 41, longitude: undefined },
      },
      { timestamp: "not a timestamp", metrics: { power: 999 } },
      { timestamp: 0, metrics: { power: 999 } },
    ]);
    expect(index).toMatchObject({
      startMs: start,
      endMs: start + 2000,
      durationMs: 2000,
      timestampCount: 2,
      duplicateTimestamps: 2,
      rejectedRecords: 2,
    });
    expect(playbackFrameAt(index, 0).metrics).toEqual(
      expect.arrayContaining([
        { key: "power", sample: { value: 120, sampledAtMs: start, ageMs: 0 } },
        { key: "heartRate", sample: { value: 140, sampledAtMs: start, ageMs: 0 } },
      ]),
    );
    expect(playbackFrameAt(index, 0).position).toBeNull();
    expect(playbackTimestampMs("1789898400000")).toBeNull();
    expect(playbackTimestampMs(new Date(NaN))).toBeNull();
  });

  it("never fills missing/invalid fields with zero, future samples, or geometry interpolation", () => {
    const index = buildPlaybackIndex([
      {
        timestamp: start,
        metrics: { power: 0, speed: 3 },
        position: { latitude: 0, longitude: 0 },
      },
      { timestamp: start + 1000, metrics: { heartRate: 150 } },
      {
        timestamp: start + 2000,
        metrics: { speed: NaN },
        position: { latitude: 100, longitude: 2 },
      },
      {
        timestamp: start + 20000,
        metrics: { power: 300 },
        position: { latitude: 1, longitude: 1 },
      },
    ]);
    const one = playbackFrameAt(index, 1000);
    expect(one.metrics.find((metric) => metric.key === "power")?.sample).toMatchObject({
      value: 0,
      ageMs: 1000,
    });
    expect(one.position?.value).toEqual({ latitude: 0, longitude: 0 });
    expect(playbackFrameAt(index, 2000).position).toBeNull();
    expect(
      playbackFrameAt(index, 2000).metrics.find((metric) => metric.key === "speed")?.sample,
    ).toBeNull();
    expect(playbackFrameAt(index, 10000).metrics.every((metric) => metric.sample === null)).toBe(
      true,
    );
    expect(playbackFrameAt(index, 10000).position).toBeNull();
    expect(playbackFrameAt(index, 20000).position?.value).toEqual({ latitude: 1, longitude: 1 });
  });

  it("uses explicit invalid duplicate values as missing barriers and preserves valid zero", () => {
    const index = buildPlaybackIndex([
      { timestamp: start, metrics: { power: 100 } },
      { timestamp: start, metrics: { power: null, cadence: 0 } },
    ]);
    expect(
      playbackFrameAt(index, 0).metrics.find((metric) => metric.key === "power")?.sample,
    ).toBeNull();
    expect(
      playbackFrameAt(index, 0).metrics.find((metric) => metric.key === "cadence")?.sample?.value,
    ).toBe(0);
  });

  it("clamps seek, applies speed at time boundaries, and ends without looping", () => {
    expect(clampPlaybackElapsed(-1, 1000)).toBe(0);
    expect(clampPlaybackElapsed(2000, 1000)).toBe(1000);
    expect(advancePlayback(500, 100, 2, 1000)).toBe(700);
    expect(advancePlayback(700, 200, 0.5, 1000)).toBe(800);
    expect(advancePlayback(900, 1000, 4, 1000)).toBe(1000);
    expect(advancePlayback(500, -100, 1, 1000)).toBe(500);
    expect(advancePlayback(500, NaN, 1, 1000)).toBe(500);
    expect(playbackFrameAt(buildPlaybackIndex([]), 100)).toMatchObject({
      elapsedMs: 0,
      timestampMs: null,
      position: null,
    });
  });
});
