import {
  advanceAthleteStateTo,
  athleteStateBaselineSchema,
  calculateLongTermLoad,
  calculateRecentLoad,
} from "@repo/core";
import { describe, expect, it } from "vitest";
import {
  addDailyAthleteStateCommonLoad,
  planningLocalDate,
  safeDailyEvidenceInstant,
} from "./athlete-state-worker";

describe("athlete-state planning-day replay", () => {
  it("safely aggregates two valid 6000-load sessions on one worker day", () => {
    const first = addDailyAthleteStateCommonLoad(0, 6_000);
    expect(addDailyAthleteStateCommonLoad(first, 6_000)).toBe(12_000);
    expect(() => addDailyAthleteStateCommonLoad(Number.MAX_VALUE, Number.MAX_VALUE)).toThrow();
  });

  it("uses a non-future observed instant for a partial current planning day", () => {
    const now = new Date("2026-08-06T16:00:00.000Z");
    const observedAt = new Date("2026-08-06T15:30:00.000Z");
    const occurredAt = safeDailyEvidenceInstant(observedAt, now);
    const baseline = athleteStateBaselineSchema.parse({
      contractVersion: "athlete-state-projection-v1",
      athleteId: "11111111-1111-4111-8111-111111111111",
      stateRevision: 1,
      asOf: occurredAt.toISOString(),
      longTermLoad: 1,
      recentLoad: 1,
      loadBalance: 0,
      evidenceConfidence: 0.9,
      capabilities: [],
      athleteAgeYears: null,
    });

    expect(occurredAt.getTime()).toBeLessThanOrEqual(now.getTime());
    expect(() => advanceAthleteStateTo(baseline, now.toISOString())).not.toThrow();
  });

  it.each([
    ["spring forward", "2026-03-08T09:30:00.000Z", "2026-03-08T10:30:00.000Z", "2026-03-08"],
    ["fall back", "2026-11-01T08:30:00.000Z", "2026-11-01T09:30:00.000Z", "2026-11-01"],
  ])("groups both sides of the Los Angeles %s transition into one local day", (_name, a, b, expectedDay) => {
    expect(planningLocalDate(new Date(a), "America/Los_Angeles")).toBe(expectedDay);
    expect(planningLocalDate(new Date(b), "America/Los_Angeles")).toBe(
      planningLocalDate(new Date(a), "America/Los_Angeles"),
    );
  });

  it.each([
    ["local midnight before UTC midnight", "2026-03-08T07:30:00.000Z", "2026-03-08T08:30:00.000Z"],
    ["spring DST offset transition", "2026-03-08T08:30:00.000Z", "2026-03-09T07:30:00.000Z"],
  ])("produces one numerical planning-day progression across %s", (_name, from, to) => {
    const baseline = athleteStateBaselineSchema.parse({
      contractVersion: "athlete-state-projection-v1",
      athleteId: "11111111-1111-4111-8111-111111111111",
      stateRevision: 1,
      asOf: from,
      longTermLoad: 50,
      recentLoad: 40,
      loadBalance: 10,
      evidenceConfidence: 0.9,
      capabilities: [],
      athleteAgeYears: null,
    });
    const state = advanceAthleteStateTo(baseline, to, {
      fromDay: planningLocalDate(new Date(from), "America/Los_Angeles"),
      toDay: planningLocalDate(new Date(to), "America/Los_Angeles"),
    }).state;

    expect(state.longTermLoad).toBe(calculateLongTermLoad(50, 0));
    expect(state.recentLoad).toBe(calculateRecentLoad(40, 0));
  });
});
