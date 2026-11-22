import { describe, expect, it } from "vitest";

import { planningLedgerSchema } from "./planning-ledger";

const unavailable = { status: "unavailable" as const, value: null };

function ledgerFixture() {
  return {
    contractVersion: "planning-ledger-v3" as const,
    period: "week" as const,
    anchorDate: "2026-04-15",
    periodStart: "2026-04-13",
    periodEnd: "2026-04-19",
    planningTimezone: "UTC",
    asOf: "2026-04-15T12:00:00.000Z",
    load: {
      completed: unavailable,
      planned: unavailable,
      remaining: unavailable,
      effective: unavailable,
    },
    intensity: unavailable,
    contributingDurationSeconds: unavailable,
    trainingState: {
      actual: {
        fitness: { status: "unavailable" as const, value: null, observedOn: null, source: null },
        fatigue: { status: "unavailable" as const, value: null, observedOn: null, source: null },
      },
      planned: {
        fitness: { status: "unavailable" as const, value: null, observedOn: null, source: null },
        fatigue: { status: "unavailable" as const, value: null, observedOn: null, source: null },
      },
    },
    dailyBreakdown: [
      {
        date: "2026-04-15",
        completed: unavailable,
        planned: unavailable,
        remaining: unavailable,
        effective: unavailable,
        intensity: unavailable,
        contributingDurationSeconds: unavailable,
      },
    ],
    entries: [],
    entriesTruncated: false,
    milestones: [],
    sourceCoverage: {
      activities: null,
      scheduledItems: null,
      calendarEvents: null,
      groupEvents: null,
    },
    modelContext: {
      commonLoadModel: "gradientpeak_relative_load" as const,
      commonLoadVersion: "1",
      publishedRevision: null,
      algorithmVersion: null,
    },
  };
}

describe("planningLedgerSchema", () => {
  it("accepts the firm-only v3 contract", () => {
    expect(planningLedgerSchema.parse(ledgerFixture()).contractVersion).toBe("planning-ledger-v3");
  });

  it("rejects removed tentative load, daily, and entry fields", () => {
    const fixture = ledgerFixture();

    expect(
      planningLedgerSchema.safeParse({
        ...fixture,
        load: { ...fixture.load, tentative: unavailable },
      }).success,
    ).toBe(false);
    expect(
      planningLedgerSchema.safeParse({
        ...fixture,
        dailyBreakdown: [{ ...fixture.dailyBreakdown[0], tentative: unavailable }],
      }).success,
    ).toBe(false);
    expect(
      planningLedgerSchema.safeParse({
        ...fixture,
        entries: [
          {
            id: "tentative-entry",
            date: "2026-04-15",
            startsAt: null,
            kind: "tentative",
            title: "Tentative session",
            status: "Tentative",
            load: unavailable,
            intensity: unavailable,
            contributingDurationSeconds: unavailable,
            navigation: null,
          },
        ],
      }).success,
    ).toBe(false);
  });
});
