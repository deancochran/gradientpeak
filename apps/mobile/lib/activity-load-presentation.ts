import {
  type CommonLoadResult,
  commonLoadResultSchema,
  getTrainingIntensityZone,
} from "@repo/core";

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
  calculation_version?: string | null;
};

export function getActivityLoadLabels(method?: string | null) {
  if (method === "heart_rate_threshold") {
    return { load: "Estimated HR Load", intensity: "HR IF" };
  }
  if (method === "run_pace_threshold") return { load: "rTSS", intensity: "Run IF" };
  if (method === "swim_pace_threshold") return { load: "sTSS", intensity: "Swim IF" };
  if (method === "power_threshold") return { load: "TSS", intensity: "IF" };
  if (method === "critical_power_threshold") {
    return { load: "Estimated CP Load", intensity: "CP IF" };
  }
  return { load: "Load", intensity: "Intensity" };
}

const intensityLabels = {
  recovery: "Recovery",
  endurance: "Endurance",
  tempo: "Tempo",
  threshold: "Threshold",
  vo2max: "VO2 Max",
  anaerobic: "Anaerobic",
  neuromuscular: "Neuromuscular",
} as const;

export type CommonLoadPresentation = {
  status: CommonLoadResult["status"];
  load: string | null;
  intensity: string | null;
  unavailableText: string | null;
};

function formatCommonLoad(value: number): string {
  return Math.round(value).toString();
}

function formatCommonIntensity(value: number): string {
  return `${intensityLabels[getTrainingIntensityZone(value)]} · ${value.toFixed(2)}`;
}

export function getCommonLoadPresentation(value: unknown): CommonLoadPresentation | null {
  const parsed = commonLoadResultSchema.safeParse(value);
  if (!parsed.success) return null;

  const result = parsed.data;
  if (result.status === "available") {
    return {
      status: result.status,
      load: formatCommonLoad(result.load),
      intensity: formatCommonIntensity(result.intensity),
      unavailableText: null,
    };
  }

  if (result.status === "partial") {
    return {
      status: result.status,
      load: result.load === null ? null : `${formatCommonLoad(result.load)} · Incomplete`,
      intensity:
        result.intensity === null
          ? null
          : `${formatCommonIntensity(result.intensity)} · Incomplete`,
      unavailableText: result.load === null ? "Incomplete" : null,
    };
  }

  return {
    status: result.status,
    load: null,
    intensity: null,
    unavailableText:
      result.reason === "unsupported_modality"
        ? null
        : result.reason === "private_data"
          ? "Private"
          : "Unavailable",
  };
}

export function getThresholdNextAction(activityType?: string | null): string {
  if (activityType === "bike") {
    return "Record qualifying bike activities to build a reliable power curve or establish bike LTHR.";
  }
  if (activityType === "run") {
    return "Record a qualifying 20-minute run effort or activity-derived run LTHR.";
  }
  if (activityType === "swim") {
    return "Record a qualifying 20-minute swim effort or activity-derived swim LTHR.";
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
      ? quality.calculation_version === "critical-power-curve-fit-v1"
        ? "Multi-ride Critical Power estimate"
        : "20-minute effort estimate"
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
