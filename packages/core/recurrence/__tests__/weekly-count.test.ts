import { describe, expect, it } from "vitest";
import {
  DEFAULT_WEEKLY_COUNT_RECURRENCE,
  deriveUtcRRuleWeekday,
  parseWeeklyCountRecurrenceRule,
  serializeWeeklyCountRecurrence,
  weeklyCountRecurrenceSchema,
} from "../weekly-count";

describe("weekly count recurrence", () => {
  it("roundtrips the supported semantic recurrence through the deterministic RRULE", () => {
    const recurrence = weeklyCountRecurrenceSchema.parse({
      ...DEFAULT_WEEKLY_COUNT_RECURRENCE,
      enabled: true,
      occurrenceCount: 12,
    });

    const payload = serializeWeeklyCountRecurrence({
      recurrence,
      startInstant: "2026-06-02T00:00:00.000Z",
    });

    expect(payload).toEqual({
      rule: "FREQ=WEEKLY;INTERVAL=1;COUNT=12;BYDAY=TU",
      timezone: "UTC",
    });
    expect(parseWeeklyCountRecurrenceRule(payload?.rule ?? "")).toEqual(recurrence);
  });

  it.each([1, 53, 2.5])("rejects unsupported occurrence count %s", (occurrenceCount) => {
    expect(() =>
      weeklyCountRecurrenceSchema.parse({
        ...DEFAULT_WEEKLY_COUNT_RECURRENCE,
        occurrenceCount,
      }),
    ).toThrow();
  });

  it.each([
    ["2026-06-07T23:30:00-07:00", "MO"],
    ["2026-06-02", "TU"],
    ["2026-06-06T23:59:59.999Z", "SA"],
  ] as const)("derives %s as UTC weekday %s", (startInstant, weekday) => {
    expect(deriveUtcRRuleWeekday(startInstant)).toBe(weekday);
  });

  it("omits recurrence when disabled", () => {
    expect(
      serializeWeeklyCountRecurrence({
        recurrence: DEFAULT_WEEKLY_COUNT_RECURRENCE,
        startInstant: "2026-06-02",
      }),
    ).toBeUndefined();
  });
});
