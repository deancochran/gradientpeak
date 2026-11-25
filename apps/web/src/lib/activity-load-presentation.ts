import {
  type CommonLoadAggregate,
  type CommonLoadResult,
  commonLoadAggregateSchema,
  commonLoadResultSchema,
} from "@repo/core";
import {
  type CommonLoadDiagnostic,
  type CommonLoadDiagnosticContext,
  getAggregateCommonLoadDiagnostic,
  getCommonLoadDiagnostic,
} from "@repo/ui/lib/common-load-diagnostics";

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
  return { load: "Common Load", intensity: "Normalized intensity" };
}

export type WebCommonLoadPresentation = {
  status: CommonLoadResult["status"] | CommonLoadAggregate["status"];
  load: string;
  intensity: string;
  explanation: string;
  diagnostic: CommonLoadDiagnostic | null;
};

const unavailableReasons: Record<
  Extract<CommonLoadResult, { status: "unavailable" }>["reason"],
  string
> = {
  activity_data_missing: "required activity data is missing",
  ambiguous_target: "multiple authored targets imply different intensities",
  duration_missing: "eligible duration is missing",
  evidence_truncated: "the bounded calibration evidence read was incomplete",
  insufficient_coverage: "activity data coverage is insufficient",
  intensity_out_of_range: "the calculated normalized intensity is outside the supported range",
  invalid_data: "the available activity data is invalid",
  private_data: "the required activity data is private",
  stale_threshold: "the applicable threshold is stale",
  threshold_missing: "no applicable threshold is available",
  unsupported_modality: "this activity category is not supported",
};

export function getCommonLoadPresentation(
  value: unknown,
  context: CommonLoadDiagnosticContext = {},
): WebCommonLoadPresentation {
  const parsed = commonLoadResultSchema.safeParse(value);
  if (!parsed.success) {
    const aggregate = commonLoadAggregateSchema.safeParse(value);
    if (aggregate.success) {
      if (aggregate.data.status === "unavailable") {
        return {
          status: aggregate.data.status,
          load: "—",
          intensity: "—",
          explanation:
            "Common Load and normalized intensity are unavailable for this activity aggregate.",
          diagnostic: getAggregateCommonLoadDiagnostic(context),
        };
      }
      const approximationPrefix = aggregate.data.status === "partial" ? "~" : "";
      return {
        status: aggregate.data.status,
        load: `${approximationPrefix}${Math.round(aggregate.data.load)}`,
        intensity: `${approximationPrefix}${aggregate.data.intensity.toFixed(2)}`,
        explanation:
          "Common Load and normalized intensity aggregated across this activity's segments.",
        diagnostic: null,
      };
    }
    return {
      status: "unavailable",
      load: "—",
      intensity: "—",
      explanation:
        "Common Load and normalized intensity are unavailable because no current result was provided.",
      diagnostic: null,
    };
  }

  const result = parsed.data;
  if (result.status === "available") {
    return {
      status: result.status,
      load: Math.round(result.load).toString(),
      intensity: result.intensity.toFixed(2),
      explanation:
        "Complete Common Load and normalized intensity from this activity's eligible duration.",
      diagnostic: null,
    };
  }
  if (result.status === "partial") {
    return {
      status: result.status,
      load: result.load === null ? "—" : `~${Math.round(result.load)}`,
      intensity: result.intensity === null ? "—" : `~${result.intensity.toFixed(2)}`,
      explanation: "Common Load and normalized intensity are based on available activity evidence.",
      diagnostic: null,
    };
  }
  return {
    status: result.status,
    load: "—",
    intensity: "—",
    explanation: `Common Load and normalized intensity are unavailable because ${unavailableReasons[result.reason]}.`,
    diagnostic: getCommonLoadDiagnostic(result, context),
  };
}

export function getThresholdNextAction(activityCategory?: string | null): string {
  if (activityCategory === "bike") {
    return "Record qualifying bike activities to build a reliable power curve or establish bike LTHR.";
  }
  if (activityCategory === "run") {
    return "Record a qualifying 20-minute run effort or activity-derived run LTHR.";
  }
  if (activityCategory === "swim") {
    return "Record a qualifying 20-minute swim effort or activity-derived swim LTHR.";
  }
  return "Establish an activity-category-specific LTHR.";
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
