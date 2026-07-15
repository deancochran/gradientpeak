import type { ActivityStreamAnalysis } from "@repo/core";
import {
  getStreamArtifactMessage,
  presentActivityStreamAnalysis,
} from "./activity-stream-presentation";

const quality = {
  status: "sufficient" as const,
  reason: null,
  sample_count: 4,
  observed_span_seconds: 180,
  integrated_seconds: 180,
  coverage_ratio: 0.8,
  accepted_interval_count: 3,
  rejected_gap_count: 1,
  rejected_gap_seconds: 20,
};

const distribution = {
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
    heart_rate: distribution,
    power: {
      ...distribution,
      quality: { ...quality, status: "insufficient", reason: "low_coverage" },
      zones: [],
    },
    run_pace: { ...distribution, threshold: 4.2 },
    swim_pace: {
      ...distribution,
      quality: { ...quality, status: "insufficient", reason: "sport_mismatch" },
      zones: [],
    },
  },
  heart_rate_load: {
    value: 82.046,
    reason: null,
    lthr_bpm: 170,
    calculation_version: "lthr_normalized_squared_v1",
    max_heart_rate_bpm: 250,
  },
};

describe("activity stream presentation", () => {
  it("presents API-owned Stream HR Load and separate zone distributions", () => {
    const result = presentActivityStreamAnalysis(analysis);

    expect(result.heartRateLoad).toEqual({
      value: "82",
      copy: "LTHR-normalized from accepted stream intervals (170 bpm LTHR).",
    });
    expect(result.distributions.map(({ title }) => title)).toEqual([
      "Heart Rate Zones",
      "Power Zones",
      "Run Pace Zones",
      "Swim Pace Zones",
    ]);
    expect(result.distributions[0]?.zones).toEqual([{ zone: 2, time: 180, label: "Zone 2" }]);
    expect(result.distributions[0]?.qualityCopy).toContain("80% coverage");
    expect(result.distributions[1]?.qualityCopy).toContain("coverage is too low");
    expect(result.distributions[3]?.qualityCopy).toContain("Not applicable");
  });

  it("provides explicit artifact state copy", () => {
    expect(getStreamArtifactMessage("missing")).toContain("No activity file");
    expect(getStreamArtifactMessage("processing")).toContain("still processing");
    expect(getStreamArtifactMessage("private")).toContain("private to the activity owner");
  });
});
