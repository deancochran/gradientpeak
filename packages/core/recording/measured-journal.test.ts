import { describe, expect, it } from "vitest";
import {
  appendMeasuredNotification,
  closeMeasuredWindow,
  emptyMeasuredJournal,
  MAX_MEASURED_NOTIFICATIONS,
  measuredJournalWithinBounds,
  measuredNotificationSchema,
  measuredRecordingJournalSchema,
  measuredRecordingPoints,
  openMeasuredWindow,
} from "./measured-journal";

const start = Date.parse("2026-09-20T10:00:00Z");
const time = (seconds: number) => new Date(start + seconds * 1000).toISOString();
function notification(
  seconds: number,
  sequenceNumber: number,
  distance: number,
  calories?: number,
  sourceId = "trainer-1",
) {
  const recordedAt = time(seconds);
  return measuredNotificationSchema.parse({
    origin: "bluetooth_notification",
    sourceId,
    recordedAt,
    sequenceNumber,
    samples: [
      {
        metricFamily: "distance",
        value: distance,
        unit: "meters",
        recordedAt,
        sequenceNumber,
        source: {
          sourceId,
          sourceType: "trainer_speed",
          adapterId: "web-bluetooth",
          provenance: "actual",
        },
      },
    ],
    ...(calories === undefined ? {} : { caloriesCounterKcal: calories }),
  });
}

describe("measured recording journal", () => {
  it("retains sparse cumulative counters while their source is continuously observed, but rebases after a source gap", () => {
    let journal = openMeasuredWindow(emptyMeasuredJournal(), time(0));
    journal = appendMeasuredNotification(journal, notification(1, 1, 100, 100));
    const power = (seconds: number, sequenceNumber: number) => {
      const base = notification(seconds, sequenceNumber, 100);
      const sample = base.samples[0];
      if (!sample) throw new Error("Expected sample");
      return measuredNotificationSchema.parse({
        ...base,
        samples: [
          {
            ...sample,
            metricFamily: "power",
            unit: "watts",
            value: 250,
            source: { ...sample.source, sourceType: "trainer_power" },
          },
        ],
      });
    };
    for (let second = 2; second < 10; second++)
      journal = appendMeasuredNotification(journal, power(second, second));
    journal = appendMeasuredNotification(journal, notification(10, 10, 110, 105));
    journal = appendMeasuredNotification(journal, power(20, 11));
    journal = appendMeasuredNotification(journal, notification(21, 12, 200, 200));
    journal = appendMeasuredNotification(journal, notification(22, 13, 205, 201));
    const result = measuredRecordingPoints(journal);
    expect(result.distanceMeters).toBe(15);
    expect(result.calories).toBe(6);
    expect(result.points.slice(1, 9).every((point) => point.values.distance === undefined)).toBe(
      true,
    );
    expect(result.points[11]?.values.distance).toBeUndefined();
  });
  it("counts only real active-window counter differences across pauses, gaps, resets and reconnects", () => {
    let journal = openMeasuredWindow(emptyMeasuredJournal(), time(0));
    journal = appendMeasuredNotification(journal, notification(1, 1, 1000, 100));
    journal = appendMeasuredNotification(journal, notification(2, 2, 1010, 105));
    journal = closeMeasuredWindow(journal, time(3));
    expect(appendMeasuredNotification(journal, notification(4, 3, 1500, 150))).toBe(journal);
    journal = openMeasuredWindow(journal, time(10));
    journal = appendMeasuredNotification(journal, notification(11, 4, 2000, 200));
    journal = appendMeasuredNotification(journal, notification(12, 5, 2005, 201));
    journal = appendMeasuredNotification(journal, notification(20, 6, 3000));
    journal = appendMeasuredNotification(journal, notification(21, 7, 3010));
    journal = appendMeasuredNotification(
      journal,
      notification(22, 1, 4000, undefined, "trainer-2"),
    );
    journal = appendMeasuredNotification(
      journal,
      notification(23, 2, 4003, undefined, "trainer-2"),
    );
    journal = appendMeasuredNotification(journal, notification(24, 3, 5, undefined, "trainer-2"));
    journal = appendMeasuredNotification(journal, notification(25, 4, 8, undefined, "trainer-2"));
    journal = closeMeasuredWindow(journal, time(26));
    expect(measuredRecordingJournalSchema.parse(JSON.parse(JSON.stringify(journal)))).toEqual(
      journal,
    );
    const result = measuredRecordingPoints(journal);
    expect(result.distanceMeters).toBe(31);
    expect(result.calories).toBe(6);
    expect(result.points.map((point) => point.values.distance)).toEqual([
      undefined,
      10,
      undefined,
      15,
      undefined,
      25,
      undefined,
      28,
      undefined,
      31,
    ]);
  });

  it("does not double count duplicates or accept samples outside a capture window", () => {
    let journal = emptyMeasuredJournal();
    expect(appendMeasuredNotification(journal, notification(1, 1, 100))).toBe(journal);
    journal = openMeasuredWindow(journal, time(2));
    expect(appendMeasuredNotification(journal, notification(1, 1, 100))).toBe(journal);
    journal = appendMeasuredNotification(journal, notification(3, 1, 100));
    expect(appendMeasuredNotification(journal, notification(3, 1, 100))).toBe(journal);
    expect(() => appendMeasuredNotification(journal, notification(2, 2, 150))).toThrow(
      "clock moved backwards",
    );
    expect(measuredRecordingPoints(journal).distanceMeters).toBeNull();
    expect(measuredJournalWithinBounds(journal, time(0), time(4), true)).toBe(false);
    expect(
      measuredJournalWithinBounds(closeMeasuredWindow(journal, time(4)), time(0), time(4), true),
    ).toBe(true);
  });

  it.each([
    { value: Infinity },
    { value: NaN },
    { value: -1 },
    { unit: "watts" },
    {
      source: {
        sourceId: "trainer-1",
        sourceType: "derived",
        provenance: "derived",
        adapterId: "simulation",
      },
    },
    {
      source: {
        sourceId: "trainer-1",
        sourceType: "gps",
        provenance: "actual",
        adapterId: "web-bluetooth",
      },
    },
    { metricFamily: "position", unit: "unknown" },
  ])("rejects malformed units/values and non-measured provenance: %j", (overrides) => {
    const input = notification(1, 1, 100);
    expect(
      measuredNotificationSchema.safeParse({
        ...input,
        samples: [{ ...input.samples[0], ...overrides }],
      }).success,
    ).toBe(false);
  });

  it("rejects forged windows, identity, and sequence and fails closed at the bounded journal limit", () => {
    let journal = openMeasuredWindow(emptyMeasuredJournal(), time(0));
    journal = appendMeasuredNotification(journal, notification(1, 1, 100));
    expect(
      measuredRecordingJournalSchema.safeParse({ ...journal, provenance: "synthetic" }).success,
    ).toBe(false);
    expect(
      measuredRecordingJournalSchema.safeParse({
        ...journal,
        windows: [{ startedAt: time(2), endedAt: time(3) }],
      }).success,
    ).toBe(false);
    expect(
      measuredNotificationSchema.safeParse({
        ...notification(1, 1, 100),
        sourceId: "another-device",
      }).success,
    ).toBe(false);
    expect(
      measuredNotificationSchema.safeParse({ ...notification(1, 1, 100), origin: "simulation" })
        .success,
    ).toBe(false);
    const full = {
      ...journal,
      entries: Array.from({ length: MAX_MEASURED_NOTIFICATIONS }, (_, index) => ({
        sequenceNumber: index + 1,
        windowIndex: 0,
        notification: notification(1, index + 1, 100),
      })),
    };
    expect(() =>
      appendMeasuredNotification(full, notification(2, MAX_MEASURED_NOTIFICATIONS + 1, 101)),
    ).toThrow("sample limit");
  });
});
