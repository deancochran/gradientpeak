import { measuredNotificationSchema } from "@repo/core/recording/measured-journal";
import { describe, expect, it } from "vitest";
import { nextMeasuredCursor } from "./measured-commit";

const start = "2026-09-20T10:00:00.000Z";
const end = "2026-09-20T10:00:02.000Z";
const header = {
  version: 1 as const,
  provenance: "measured" as const,
  windows: [{ startedAt: start, endedAt: null }],
};
function entry(sequenceNumber: number) {
  return {
    sequenceNumber,
    windowIndex: 0,
    notification: measuredNotificationSchema.parse({
      origin: "bluetooth_notification",
      sourceId: "sensor",
      recordedAt: end,
      sequenceNumber,
      samples: [
        {
          metricFamily: "power",
          unit: "watts",
          value: 200,
          recordedAt: end,
          sequenceNumber,
          source: {
            sourceId: "sensor",
            sourceType: "trainer_power",
            provenance: "actual",
            adapterId: "web-bluetooth",
          },
        },
      ],
    }),
  };
}
describe("incremental measured commit validation", () => {
  it("validates cursor/source ordering without replaying previous entries", () => {
    const first = nextMeasuredCursor(
      null,
      { header, expectedCursor: 0, entries: [entry(1)] },
      start,
      end,
    );
    expect(first.cursor).toBe(1);
    expect(() =>
      nextMeasuredCursor(first, { header, expectedCursor: 0, entries: [entry(1)] }, start, end),
    ).toThrow("cursor conflict");
    expect(() =>
      nextMeasuredCursor(first, { header, expectedCursor: 1, entries: [entry(3)] }, start, end),
    ).toThrow("sequence");
    expect(() =>
      nextMeasuredCursor(first, { header, expectedCursor: 1, entries: [] }, start, start),
    ).toThrow("precede");
    expect(
      nextMeasuredCursor(first, { header, expectedCursor: 1, entries: [entry(2)] }, start, end)
        .cursor,
    ).toBe(2);
  });
  it("requires paused windows to close and never reopens a committed closed window", () => {
    expect(() =>
      nextMeasuredCursor(null, { header, expectedCursor: 0, entries: [] }, start, end, true),
    ).toThrow("window");
    const closed = { ...header, windows: [{ startedAt: start, endedAt: end }] };
    const first = nextMeasuredCursor(
      null,
      { header: closed, expectedCursor: 0, entries: [entry(1)] },
      start,
      end,
      true,
    );
    expect(() =>
      nextMeasuredCursor(first, { header, expectedCursor: 1, entries: [] }, start, end),
    ).toThrow("window");
  });
  it("rejects oversized batches and samples outside the checkpoint", () => {
    expect(() =>
      nextMeasuredCursor(
        null,
        {
          header,
          expectedCursor: 0,
          entries: Array.from({ length: 129 }, (_, index) => entry(index + 1)),
        },
        start,
        end,
      ),
    ).toThrow();
    expect(() =>
      nextMeasuredCursor(null, { header, expectedCursor: 0, entries: [entry(1)] }, start, start),
    ).toThrow("timing");
  });
});
