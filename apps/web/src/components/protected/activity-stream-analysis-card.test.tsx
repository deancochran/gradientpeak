// @vitest-environment jsdom

import type { ActivityStreamAnalysis } from "@repo/core";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ActivityStreamAnalysisCard } from "./activity-stream-analysis-card";

const quality = {
  status: "sufficient" as const,
  reason: null,
  sample_count: 4,
  observed_span_seconds: 180,
  integrated_seconds: 180,
  coverage_ratio: 1,
  accepted_interval_count: 3,
  rejected_gap_count: 0,
  rejected_gap_seconds: 0,
};

const sufficient = {
  quality,
  threshold: 170,
  threshold_identity: {
    source: "manual" as const,
    observed_at: "2026-03-01T00:00:00.000Z",
    confidence: "high" as const,
    stale: false,
    estimate: false,
    calculation_version: "1",
  },
  time_weighted_average: 155,
  zones: [{ zone: 2, seconds: 180, percentage: 100 }],
};

const analysis: ActivityStreamAnalysis = {
  version: "2",
  sport: "run",
  policy: { max_accepted_gap_seconds: 30, minimum_coverage_ratio: 0.7 },
  distributions: {
    heart_rate: sufficient,
    power: {
      ...sufficient,
      quality: { ...quality, status: "insufficient", reason: "sport_mismatch" },
      threshold: null,
      threshold_identity: null,
      zones: [],
    },
    run_pace: { ...sufficient, threshold: 4.2 },
    swim_pace: {
      ...sufficient,
      quality: { ...quality, status: "insufficient", reason: "sport_mismatch" },
      threshold: null,
      threshold_identity: null,
      zones: [],
    },
  },
  heart_rate_load: {
    value: 73.6,
    reason: null,
    lthr_bpm: 170,
    calculation_version: "lthr_normalized_squared_v1",
    max_heart_rate_bpm: 250,
  },
};

afterEach(cleanup);

describe("ActivityStreamAnalysisCard", () => {
  it("shows LTHR-normalized stream HR load separately from summary load", () => {
    render(<ActivityStreamAnalysisCard analysis={analysis} artifactState="ready" />);

    expect(screen.getByText("Stream HR Load")).toBeTruthy();
    expect(screen.getByText("74")).toBeTruthy();
    expect(screen.getByText(/LTHR-normalized from accepted stream intervals/)).toBeTruthy();
    expect(screen.getByText(/does not replace summary training load/)).toBeTruthy();
    expect(screen.getByText("Heart rate zones")).toBeTruthy();
    expect(screen.getByText("Power zones")).toBeTruthy();
    expect(screen.getByText("Run pace zones")).toBeTruthy();
    expect(screen.getByText("Swim pace zones")).toBeTruthy();
    expect(screen.getAllByText(/100% coverage/).length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("Not applicable to this activity sport. 100% coverage.").length,
    ).toBe(2);
  });

  it.each([
    ["missing", "No activity file is available for stream analysis."],
    ["processing", "The activity file is still processing"],
    ["private", "Stream analysis is private to the activity owner."],
  ] as const)("renders the %s artifact state", (artifactState, copy) => {
    render(<ActivityStreamAnalysisCard artifactState={artifactState} />);
    expect(screen.getByText(new RegExp(copy))).toBeTruthy();
  });
});
