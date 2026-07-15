import type { ActivityStreamAnalysis, StreamAnalysisInsufficientReason } from "@repo/core";

type Distribution =
  ActivityStreamAnalysis["distributions"][keyof ActivityStreamAnalysis["distributions"]];

export type StreamZonePresentation = {
  key: keyof ActivityStreamAnalysis["distributions"];
  title: string;
  zones: Array<{ label: string; time: number; zone: number }>;
  qualityCopy: string;
};

const DISTRIBUTIONS = [
  { key: "heart_rate", title: "Heart Rate Zones" },
  { key: "power", title: "Power Zones" },
  { key: "run_pace", title: "Run Pace Zones" },
  { key: "swim_pace", title: "Swim Pace Zones" },
] as const;

export function getStreamUnavailableCopy(reason: StreamAnalysisInsufficientReason | null): string {
  switch (reason) {
    case "invalid_timestamps":
      return "Unavailable because stream timestamps are invalid.";
    case "insufficient_samples":
      return "Unavailable because too few stream samples were recorded.";
    case "threshold_missing":
      return "Unavailable because no prior sport-specific threshold was available.";
    case "low_coverage":
      return "Unavailable because stream coverage is too low for a reliable result.";
    case "sport_mismatch":
      return "Not applicable to this activity sport.";
    default:
      return "Stream analysis is unavailable.";
  }
}

function getQualityCopy(distribution: Distribution): string {
  const coverage = Math.round(distribution.quality.coverage_ratio * 100);
  if (distribution.quality.status === "insufficient") {
    return `${getStreamUnavailableCopy(distribution.quality.reason)} ${coverage}% coverage.`;
  }

  const thresholdIdentity = distribution.threshold_identity;
  const calibration = thresholdIdentity
    ? ` ${thresholdIdentity.estimate ? "Estimated" : "Measured"} ${thresholdIdentity.source.replaceAll("_", " ")} threshold, ${thresholdIdentity.confidence} confidence${thresholdIdentity.stale ? ", stale" : ""}.`
    : "";
  return `Sufficient stream quality · ${coverage}% coverage.${calibration}`;
}

export function presentActivityStreamAnalysis(analysis: ActivityStreamAnalysis) {
  return {
    heartRateLoad: {
      value:
        analysis.heart_rate_load.value == null
          ? "Unavailable"
          : `${Math.round(analysis.heart_rate_load.value)}`,
      copy:
        analysis.heart_rate_load.value == null
          ? getStreamUnavailableCopy(analysis.heart_rate_load.reason)
          : `LTHR-normalized from accepted stream intervals${analysis.heart_rate_load.lthr_bpm ? ` (${analysis.heart_rate_load.lthr_bpm} bpm LTHR)` : ""}.`,
    },
    distributions: DISTRIBUTIONS.map(({ key, title }): StreamZonePresentation => {
      const distribution = analysis.distributions[key];
      return {
        key,
        title,
        qualityCopy: getQualityCopy(distribution),
        zones: distribution.zones.map((zone) => ({
          zone: zone.zone,
          time: Math.round(zone.seconds),
          label: `Zone ${zone.zone}`,
        })),
      };
    }),
  };
}

export function getStreamArtifactMessage(
  state: "error" | "loading" | "missing" | "private" | "processing",
  errorMessage?: string,
): string {
  switch (state) {
    case "missing":
      return "No activity file is available for stream analysis.";
    case "processing":
      return "The activity file is still processing. Stream analysis will appear when it is ready.";
    case "private":
      return "Stream analysis is private to the activity owner.";
    case "loading":
      return "Loading stream analysis...";
    case "error":
      return errorMessage
        ? `Stream analysis is unavailable: ${errorMessage}`
        : "The activity file could not be loaded for stream analysis.";
  }
}
