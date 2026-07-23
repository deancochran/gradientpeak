import {
  type CommonLoadAggregate,
  type CommonLoadResult,
  commonLoadAggregateSchema,
  commonLoadResultSchema,
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
  calculation_version?: string | null | undefined;
};

export function getActivityLoadLabels() {
  return { load: "Load", intensity: "Intensity" };
}

export type WebCommonLoadPresentation = {
  status: CommonLoadResult["status"] | CommonLoadAggregate["status"];
  load: string;
  intensity: string;
  explanation: string;
};

const unavailableReasons: Record<
  Extract<CommonLoadResult, { status: "unavailable" }>["reason"],
  string
> = {
  activity_data_missing: "required activity data is missing",
  duration_missing: "eligible duration is missing",
  insufficient_coverage: "activity data coverage is insufficient",
  intensity_out_of_range: "the calculated Intensity is outside the supported range",
  invalid_data: "the available activity data is invalid",
  private_data: "the required activity data is private",
  stale_threshold: "the applicable threshold is stale",
  threshold_missing: "no applicable threshold is available",
  unsupported_modality: "this activity type is not supported",
};

export function getCommonLoadPresentation(value: unknown): WebCommonLoadPresentation {
  const parsed = commonLoadResultSchema.safeParse(value);
  if (!parsed.success) {
    const aggregate = commonLoadAggregateSchema.safeParse(value);
    if (aggregate.success) {
      if (aggregate.data.status === "unavailable") {
        return {
          status: aggregate.data.status,
          load: "Unavailable",
          intensity: "Unavailable",
          explanation: "Common Load and Intensity are unavailable for this activity aggregate.",
        };
      }
      const coverage = aggregate.data.status === "partial" ? "Partial " : "Complete ";
      return {
        status: aggregate.data.status,
        load: Math.round(aggregate.data.load).toString(),
        intensity: aggregate.data.intensity.toFixed(2),
        explanation: `${coverage}common Load and Intensity aggregated across this activity's segments.`,
      };
    }
    return {
      status: "unavailable",
      load: "Unavailable",
      intensity: "Unavailable",
      explanation:
        "Common Load and Intensity are unavailable because no current result was provided.",
    };
  }

  const result = parsed.data;
  if (result.status === "available") {
    return {
      status: result.status,
      load: Math.round(result.load).toString(),
      intensity: result.intensity.toFixed(2),
      explanation: "Complete common Load and Intensity from this activity's eligible duration.",
    };
  }
  if (result.status === "partial") {
    const coverage = Math.round(result.sourceTimeCoverage * 100);
    return {
      status: result.status,
      load: result.load === null ? "Unavailable" : Math.round(result.load).toString(),
      intensity: result.intensity === null ? "Unavailable" : result.intensity.toFixed(2),
      explanation: `Partial common Load and Intensity: ${coverage}% of eligible duration contributed.`,
    };
  }
  return {
    status: result.status,
    load: "Unavailable",
    intensity: "Unavailable",
    explanation: `Common Load and Intensity are unavailable because ${unavailableReasons[result.reason]}.`,
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
