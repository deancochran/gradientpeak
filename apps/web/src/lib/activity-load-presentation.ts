type CalibrationQuality = {
  source:
    | "manual"
    | "validated_test"
    | "observed_effort"
    | "provider"
    | "modeled"
    | "estimated"
    | "unknown";
  observed_at: string | null;
  stale: boolean;
  estimate: boolean;
};

export function getActivityLoadLabels(method?: string | null) {
  if (method === "heart_rate_threshold") {
    return { load: "Estimated HR Load", intensity: "HR IF" };
  }
  if (method === "run_pace_threshold") return { load: "rTSS", intensity: "Run IF" };
  if (method === "swim_pace_threshold") return { load: "sTSS", intensity: "Swim IF" };
  if (method === "power_threshold") return { load: "TSS", intensity: "IF" };
  return { load: "Load", intensity: "Intensity" };
}

export function getThresholdNextAction(activityType?: string | null): string {
  if (activityType === "bike") {
    return "Set FTP, complete a qualifying 20-minute power effort, or establish bike LTHR.";
  }
  if (activityType === "run") {
    return "Set threshold pace, complete a qualifying 20-minute run effort, or establish run LTHR.";
  }
  if (activityType === "swim") {
    return "Set CSS, complete a qualifying 20-minute swim effort, or establish swim LTHR.";
  }
  return "Establish a sport-specific LTHR.";
}

export function formatCalibrationQuality(
  quality: CalibrationQuality | null | undefined,
  asOf: string | Date | null | undefined,
): string | null {
  if (!quality) return null;
  const source =
    quality.source === "observed_effort"
      ? "20-minute effort estimate"
      : quality.source === "validated_test"
        ? "Validated threshold test"
        : quality.source === "manual"
          ? "Manual threshold"
          : quality.source === "provider"
            ? "Imported threshold"
            : quality.source === "modeled"
              ? "Modeled threshold estimate"
              : quality.source === "estimated"
                ? "Estimated threshold"
                : "Threshold source unknown";
  const observed = quality.observed_at ? Date.parse(quality.observed_at) : Number.NaN;
  const reference = asOf instanceof Date ? asOf.getTime() : asOf ? Date.parse(asOf) : Number.NaN;
  const ageDays =
    Number.isFinite(observed) && Number.isFinite(reference)
      ? Math.max(0, Math.floor((reference - observed) / 86_400_000))
      : null;
  const age = ageDays === null ? null : ageDays === 0 ? "today" : `${ageDays}d old`;
  return [source, age, quality.stale ? "stale" : null].filter(Boolean).join(" · ");
}
