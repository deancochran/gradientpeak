import {
  COMMON_LOAD_HISTORY_BASIS,
  COMMON_LOAD_HISTORY_CALCULATION_MODEL,
  COMMON_LOAD_HISTORY_CALCULATION_VERSION,
  COMMON_LOAD_HISTORY_MATURE_DAYS,
  COMMON_LOAD_HISTORY_POLICY_VERSION,
  COMMON_LOAD_HISTORY_REQUIRED_DAYS,
  COMMON_RELATIVE_LOAD_MODEL,
  COMMON_RELATIVE_LOAD_VERSION,
  type CommonLoadHistoryResult,
} from "@repo/core/load";
import { describe, expect, it } from "vitest";
import { buildTrendInsights } from "./trend-insights";

const availableLoadHistory: CommonLoadHistoryResult = {
  status: "available",
  policyVersion: COMMON_LOAD_HISTORY_POLICY_VERSION,
  coverageStatus: "complete",
  maturity: {
    status: "mature",
    replayedDays: COMMON_LOAD_HISTORY_MATURE_DAYS,
    requiredMatureDays: COMMON_LOAD_HISTORY_MATURE_DAYS,
    coverage: { completeDays: COMMON_LOAD_HISTORY_MATURE_DAYS, partialDays: 0, ratio: 1 },
  },
  identity: {
    policyVersion: COMMON_LOAD_HISTORY_POLICY_VERSION,
    basis: COMMON_LOAD_HISTORY_BASIS,
    calculationIdentity: {
      model: COMMON_LOAD_HISTORY_CALCULATION_MODEL,
      version: COMMON_LOAD_HISTORY_CALCULATION_VERSION,
      asOf: "2026-08-01T00:00:00.000Z",
    },
    planningTimezone: "UTC",
    startDate: "2026-05-10",
    endDate: "2026-08-01",
    commonLoad: { model: COMMON_RELATIVE_LOAD_MODEL, version: COMMON_RELATIVE_LOAD_VERSION },
    evidenceFingerprints: ["test-evidence"],
  },
  points: Array.from({ length: COMMON_LOAD_HISTORY_REQUIRED_DAYS }, (_, index) => ({
    date: new Date(Date.UTC(2026, 4, 10 + index)).toISOString().slice(0, 10),
    coverageStatus: "complete",
    dailyLoad: index === COMMON_LOAD_HISTORY_REQUIRED_DAYS - 1 ? 20 : 10,
    longTermLoad: index === COMMON_LOAD_HISTORY_REQUIRED_DAYS - 1 ? 40 : 30,
    recentLoad: index === COMMON_LOAD_HISTORY_REQUIRED_DAYS - 1 ? 50 : 35,
    loadBalance: index === COMMON_LOAD_HISTORY_REQUIRED_DAYS - 1 ? -10 : -5,
  })),
};

describe("buildTrendInsights", () => {
  it("owns profile and activity insight semantics in the server read model", () => {
    const result = buildTrendInsights({
      analytics: { status: "unavailable", reason: "row_limit_exceeded" },
      loadHistory: null,
      observations: [
        {
          metric_type: "weight_kg",
          recorded_at: new Date("2026-08-01T08:00:00.000Z"),
          value: 72.4,
        },
      ],
    });

    expect(result.status).toBe("partial");
    expect(result.items).toHaveLength(11);
    expect(result.items.find((item) => item.id === "profile-weight_kg")).toMatchObject({
      source: "profileMetric",
      value: "72.4 kg",
      visualType: "line",
    });
    expect(result.items.find((item) => item.id === "training-load")).toMatchObject({
      source: "activityAnalysis",
      value: "--",
      visualType: "loadMultiLine",
    });
  });

  it("names the canonical long-term load line Fitness without changing its presentation", () => {
    const result = buildTrendInsights({
      analytics: { status: "unavailable", reason: "row_limit_exceeded" },
      loadHistory: availableLoadHistory,
      observations: [],
    });

    const trainingLoad = result.items.find((item) => item.id === "training-load");
    expect(trainingLoad?.series?.map(({ label, tone }) => ({ label, tone }))).toEqual([
      { label: "Daily Load", tone: "orange" },
      { label: "Fitness", tone: "blue" },
      { label: "Recent Load", tone: "green" },
      { label: "Load Balance", tone: "purple" },
    ]);
    expect(trainingLoad?.rows.map(({ label }) => label)).toEqual([
      "Daily Load",
      "Fitness",
      "Recent Load",
      "Load Balance",
    ]);
    expect(trainingLoad?.series?.[1]?.points.at(-1)).toMatchObject({
      value: 40,
      date: "2026-08-01T00:00:00.000Z",
    });
    expect(trainingLoad?.rows[1]).toEqual({ label: "Fitness", value: "40" });
  });
});
