import { type CommonLoadResult, commonLoadResultSchema } from "@repo/core/load";

type UnavailableCommonLoad = Extract<CommonLoadResult, { status: "unavailable" }>;

export type CommonLoadDiagnosticContext = {
  hasHeartRateSummary?: boolean | null;
  segmentCommonLoads?: readonly unknown[] | undefined;
};

export type CommonLoadDiagnostic = {
  summary: string;
  action: string;
  coveragePercent: number | null;
};

function thresholdLabel(method: UnavailableCommonLoad["method"]): string {
  switch (method) {
    case "heart_rate_zones":
      return "sport-specific LTHR";
    case "power_threshold":
      return "FTP";
    case "critical_power_threshold":
      return "Critical Power";
    case "run_pace_threshold":
      return "run threshold pace";
    case "swim_pace_threshold":
      return "swim threshold pace";
    default:
      return "required threshold";
  }
}

function thresholdAction(method: UnavailableCommonLoad["method"], stale: boolean): string {
  const verb = stale ? "Update" : "Add";
  switch (method) {
    case "heart_rate_zones":
      return `${verb} a current sport-specific LTHR.`;
    case "power_threshold":
      return `${verb} a current FTP measurement.`;
    case "critical_power_threshold":
      return `${verb} a current Critical Power measurement.`;
    case "run_pace_threshold":
      return `${verb} a current run threshold pace.`;
    case "swim_pace_threshold":
      return `${verb} a current swim threshold pace.`;
    default:
      return `${verb} the required threshold measurement.`;
  }
}

function coveragePercent(result: UnavailableCommonLoad): number | null {
  return result.sourceTimeCoverage === null || result.sourceTimeCoverage === undefined
    ? null
    : Math.round(result.sourceTimeCoverage * 100);
}

/** User-facing explanation for an already-validated unavailable canonical Load result. */
export function getCommonLoadDiagnostic(
  result: UnavailableCommonLoad,
  context: CommonLoadDiagnosticContext = {},
): CommonLoadDiagnostic {
  const coverage = coveragePercent(result);
  const threshold = thresholdLabel(result.method);

  switch (result.reason) {
    case "threshold_missing":
      return {
        summary: `${threshold} is missing for this activity.`,
        action: thresholdAction(result.method, false),
        coveragePercent: null,
      };
    case "stale_threshold":
      return {
        summary: `${threshold} is stale for this activity.`,
        action: thresholdAction(result.method, true),
        coveragePercent: null,
      };
    case "activity_data_missing":
      return result.method === "heart_rate_zones" && context.hasHeartRateSummary
        ? {
            summary:
              "Average heart rate alone is insufficient; time-weighted heart-rate samples are required.",
            action: "Import activity data with time-weighted heart-rate samples.",
            coveragePercent: null,
          }
        : {
            summary:
              result.method === "heart_rate_zones"
                ? "Time-weighted heart-rate samples are missing."
                : "Required activity measurements are missing.",
            action:
              result.method === "heart_rate_zones"
                ? "Import activity data with time-weighted heart-rate samples."
                : "Import activity data with the required measurements.",
            coveragePercent: null,
          };
    case "insufficient_coverage":
      return {
        summary:
          result.method === "heart_rate_zones" && coverage !== null
            ? `Heart-rate samples cover ${coverage}% of eligible duration; at least 50% is required.`
            : result.method === "heart_rate_zones"
              ? "Heart-rate sample coverage is insufficient; at least 50% is required."
              : "Activity measurement coverage is insufficient.",
        action:
          result.method === "heart_rate_zones"
            ? "Import activity data with more time-weighted heart-rate samples."
            : "Import activity data with more complete measurements.",
        coveragePercent: coverage,
      };
    case "duration_missing":
      return {
        summary: "Eligible activity duration is missing.",
        action: "Import activity data with a valid duration.",
        coveragePercent: null,
      };
    case "invalid_data":
      return {
        summary: "The activity data is invalid for Load calculation.",
        action: "Correct or re-import the activity data.",
        coveragePercent: null,
      };
    case "private_data":
      return {
        summary: "Required activity data is private.",
        action: "Allow access to the required activity data.",
        coveragePercent: null,
      };
    case "unsupported_modality":
      return {
        summary: "This activity type is not supported for canonical Load.",
        action: "Canonical Load is not available for this activity type.",
        coveragePercent: null,
      };
    case "intensity_out_of_range":
      return {
        summary: "Calculated Intensity is outside the supported range.",
        action: "Review the activity measurements and threshold.",
        coveragePercent: null,
      };
  }
}

/** Resolves a parent aggregate to a truthful segment diagnostic when possible. */
export function getAggregateCommonLoadDiagnostic(
  context: CommonLoadDiagnosticContext = {},
): CommonLoadDiagnostic {
  const unavailableSegments = (context.segmentCommonLoads ?? []).flatMap((candidate) => {
    const parsed = commonLoadResultSchema.safeParse(candidate);
    return parsed.success && parsed.data.status === "unavailable" ? [parsed.data] : [];
  });
  const first = unavailableSegments[0];
  const sameReasonAndMethod =
    first !== undefined &&
    unavailableSegments.every(
      (segment) => segment.reason === first.reason && segment.method === first.method,
    );

  if (first && (unavailableSegments.length === 1 || sameReasonAndMethod)) {
    const diagnostic = getCommonLoadDiagnostic(first, context);
    if (unavailableSegments.length > 1 && diagnostic.coveragePercent !== null) {
      return {
        ...diagnostic,
        summary:
          "Heart-rate sample coverage is insufficient across activity segments; at least 50% is required.",
        coveragePercent: null,
      };
    }
    return diagnostic;
  }

  return {
    summary: "Canonical Load is unavailable for this activity aggregate.",
    action: "Review the activity segments for their Load requirements.",
    coveragePercent: null,
  };
}
