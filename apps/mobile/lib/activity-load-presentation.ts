import {
  activityQuantificationBundleSchema,
  activityQuantificationSchema,
  aggregateActivityQuantificationSchema,
  type CommonLoadAggregate,
  type CommonLoadResult,
  commonLoadAggregateSchema,
  commonLoadResultSchema,
} from "@repo/core";
import { getTrainingIntensityZone } from "@repo/core/zones";
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

/** Returns a numeric Load only when the envelope is complete and authoritative. */
export function getCompleteCommonLoad(value: unknown): number | null {
  const result = commonLoadResultSchema.safeParse(value);
  if (result.success) {
    return result.data.status === "available" ? result.data.load : null;
  }

  const aggregate = commonLoadAggregateSchema.safeParse(value);
  return aggregate.success && aggregate.data.status === "complete" ? aggregate.data.load : null;
}

/** Returns Common Load only from a complete canonical activity quantification. */
export function getCompleteActivityQuantificationCommonLoad(value: unknown): number | null {
  const bundle = activityQuantificationBundleSchema.safeParse(value);
  if (bundle.success) {
    return bundle.data.summary.commonLoad.status === "complete"
      ? bundle.data.summary.commonLoad.load
      : null;
  }
  const item = activityQuantificationSchema.safeParse(value);
  if (item.success) {
    return item.data.commonLoad.status === "available" ? item.data.commonLoad.load : null;
  }

  const aggregate = aggregateActivityQuantificationSchema.safeParse(value);
  return aggregate.success && aggregate.data.commonLoad.status === "complete"
    ? aggregate.data.commonLoad.load
    : null;
}

/** Returns intensity only when its Common Load envelope is complete and authoritative. */
export function getCompleteCommonLoadIntensity(value: unknown): number | null {
  const result = commonLoadResultSchema.safeParse(value);
  if (result.success) {
    return result.data.status === "available" ? result.data.intensity : null;
  }

  const aggregate = commonLoadAggregateSchema.safeParse(value);
  return aggregate.success && aggregate.data.status === "complete"
    ? aggregate.data.intensity
    : null;
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

export type MobileCommonLoadPresentation = {
  status: CommonLoadResult["status"] | CommonLoadAggregate["status"];
  load: string | null;
  intensity: string | null;
  unavailableText: string | null;
  diagnostic: CommonLoadDiagnostic | null;
};

function formatCommonLoad(value: number): string {
  return Math.round(value).toString();
}

function formatCommonIntensity(value: number): string {
  return `${intensityLabels[getTrainingIntensityZone(value)]} · ${value.toFixed(2)}`;
}

export function getCommonLoadPresentation(
  value: unknown,
  context: CommonLoadDiagnosticContext = {},
): MobileCommonLoadPresentation | null {
  const parsed = commonLoadResultSchema.safeParse(value);
  if (!parsed.success) {
    const aggregate = commonLoadAggregateSchema.safeParse(value);
    if (!aggregate.success) return null;
    if (aggregate.data.status === "unavailable") {
      return {
        status: aggregate.data.status,
        load: null,
        intensity: null,
        unavailableText: "Unavailable",
        diagnostic: getAggregateCommonLoadDiagnostic(context),
      };
    }
    const incomplete = aggregate.data.status === "partial" ? " · Incomplete" : "";
    return {
      status: aggregate.data.status,
      load: `${formatCommonLoad(aggregate.data.load)}${incomplete}`,
      intensity: `${formatCommonIntensity(aggregate.data.intensity)}${incomplete}`,
      unavailableText: null,
      diagnostic: null,
    };
  }

  const result = parsed.data;
  if (result.status === "available") {
    return {
      status: result.status,
      load: formatCommonLoad(result.load),
      intensity: formatCommonIntensity(result.intensity),
      unavailableText: null,
      diagnostic: null,
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
      diagnostic: null,
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
