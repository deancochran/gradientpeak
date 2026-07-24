import { describe, expect, it } from "vitest";
import { buildServerEffectiveLoadSummaries } from "./serverEffectiveLoadSummaries";

const availableLoad = {
  model: "gradientpeak_relative_load" as const,
  version: "1" as const,
  status: "complete" as const,
  load: 50,
  intensity: 0.8,
  contributingDurationSeconds: 3600,
  knownDurationSeconds: 3600,
  contributingActivityCount: 1,
  partialActivityCount: 0,
  unavailableActivityCount: 0,
  unknownDurationActivityCount: 0,
  totalActivityCount: 1,
  activityCountCoverage: 1,
  knownDurationCoverage: 1,
};

describe("buildServerEffectiveLoadSummaries", () => {
  it("keeps firm and tentative server-composed Load separate", () => {
    const summaries = buildServerEffectiveLoadSummaries({
      periods: [{ key: "week", startDate: "2026-07-20", endDate: "2026-07-26" }],
      response: {
        status: "available",
        completed: { status: "unavailable", reason: "no_load_data" },
        remaining: { status: "unavailable", reason: "no_load_data" },
        tentative: { status: "unavailable", reason: "no_load_data" },
        effective: {
          status: "available",
          firm: availableLoad,
          firmItems: [
            {
              kind: "scheduled",
              date: "2026-07-22",
              scheduledItemId: "firm",
              commonLoad: availableLoad,
            },
          ],
          tentativeItems: [
            {
              kind: "scheduled",
              date: "2026-07-23",
              scheduledItemId: "tentative",
              commonLoad: availableLoad,
            },
          ],
        },
      } as never,
    });

    expect(summaries.get("week")).toMatchObject({
      status: "complete",
      commonLoad: 50,
      intensity: Math.SQRT1_2,
      tentativeLoad: 50,
    });
  });

  it("does not turn an unavailable server composition into zero Load", () => {
    const summaries = buildServerEffectiveLoadSummaries({
      periods: [{ key: "day", startDate: "2026-07-23", endDate: "2026-07-23" }],
      response: { status: "unavailable" },
    });

    expect(summaries.get("day")).toMatchObject({ status: "unavailable", commonLoad: null });
  });

  it("keeps an empty day unavailable when the server reports a partial source", () => {
    const summaries = buildServerEffectiveLoadSummaries({
      periods: [{ key: "empty-day", startDate: "2026-07-23", endDate: "2026-07-23" }],
      response: {
        status: "available",
        completed: { status: "unavailable", reason: "no_load_data" },
        remaining: { status: "unavailable", reason: "no_load_data" },
        tentative: { status: "unavailable", reason: "no_load_data" },
        effective: {
          status: "available",
          firm: { ...availableLoad, status: "partial", partialActivityCount: 1 },
          firmItems: [],
          tentativeItems: [],
        },
      } as never,
    });

    expect(summaries.get("empty-day")).toMatchObject({ status: "unavailable", commonLoad: null });
  });

  it("keeps an empty tentative subset unavailable until scheduled coverage is complete", () => {
    const summaries = buildServerEffectiveLoadSummaries({
      periods: [{ key: "empty-day", startDate: "2026-07-23", endDate: "2026-07-23" }],
      response: {
        status: "available",
        completed: { status: "unavailable", reason: "no_load_data" },
        remaining: { status: "unavailable", reason: "no_load_data" },
        tentative: { status: "unavailable", reason: "no_load_data" },
        effective: {
          status: "available",
          firm: availableLoad,
          firmItems: [],
          tentativeItems: [],
        },
        sourceCoverage: {
          activities: null,
          scheduledItems: { startDate: "2026-07-20", endDate: "2026-07-26", status: "partial" },
        },
      } as never,
    });

    expect(summaries.get("empty-day")).toMatchObject({
      status: "known_zero",
      commonLoad: 0,
      tentativeLoad: null,
    });
  });

  it("recognizes an empty tentative subset as zero after complete scheduled coverage", () => {
    const summaries = buildServerEffectiveLoadSummaries({
      periods: [{ key: "empty-day", startDate: "2026-07-23", endDate: "2026-07-23" }],
      response: {
        status: "available",
        completed: { status: "unavailable", reason: "no_load_data" },
        remaining: { status: "unavailable", reason: "no_load_data" },
        tentative: { status: "unavailable", reason: "no_load_data" },
        effective: {
          status: "available",
          firm: availableLoad,
          firmItems: [],
          tentativeItems: [],
        },
        sourceCoverage: {
          activities: null,
          scheduledItems: { startDate: "2026-07-20", endDate: "2026-07-26", status: "complete" },
        },
      } as never,
    });

    expect(summaries.get("empty-day")).toMatchObject({
      status: "known_zero",
      commonLoad: 0,
      tentativeLoad: 0,
    });
  });
});
