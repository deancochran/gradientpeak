import {
  type ActivityNativeIntensityValue,
  type ActivityQuantification,
  type ActivityQuantificationEvidenceRole,
  type AggregateActivityQuantification,
  activityQuantificationBundleSchema,
} from "@repo/core/activity-quantification";

import {
  type CommonLoadDiagnostic,
  type CommonLoadDiagnosticContext,
  getAggregateCommonLoadDiagnostic,
  getCommonLoadDiagnostic,
} from "./common-load-diagnostics";

export const activityQuantificationLabels = {
  commonLoad: "Common Load",
  nativeIntensity: "Native intensity",
  normalizedIntensity: "Normalized intensity",
  observedIntensity: "Observed intensity",
  prescribedIntensity: "Prescribed intensity",
} as const;

export type ActivityQuantificationPresentationStatus =
  | "available"
  | "complete"
  | "partial"
  | "unavailable";

export type ActivityQuantificationMetricPresentation = {
  diagnostic: CommonLoadDiagnostic | null;
  evidence: string;
  explanation: string;
  label: string;
  method: string | null;
  status: ActivityQuantificationPresentationStatus;
  unavailableReason: string | null;
  value: string;
};

export type ActivityNativeIntensityPresentation = Omit<
  ActivityQuantificationMetricPresentation,
  "diagnostic" | "method" | "unavailableReason"
> & {
  values: readonly string[];
};

export type ActivityQuantificationPresentation = {
  commonLoad: ActivityQuantificationMetricPresentation;
  kind: ActivityQuantification["kind"] | AggregateActivityQuantification["kind"] | "unavailable";
  nativeIntensity: ActivityNativeIntensityPresentation;
  normalizedIntensity: ActivityQuantificationMetricPresentation;
};

export type ActivityQuantificationPresentationContext = Pick<
  CommonLoadDiagnosticContext,
  "hasHeartRateSummary"
>;

type ParsedQuantification = ActivityQuantification | AggregateActivityQuantification;
type ParsedQuantificationInput = {
  members: ActivityQuantification[];
  quantification: ParsedQuantification;
};
type NativeMagnitude =
  | { kind: "point"; value: number }
  | { kind: "range"; lower: number; upper: number };

function parseQuantification(value: unknown): ParsedQuantificationInput | null {
  const bundle = activityQuantificationBundleSchema.safeParse(value);
  return bundle.success
    ? { members: bundle.data.members, quantification: bundle.data.summary }
    : null;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
}

function formatMagnitude(magnitude: NativeMagnitude, suffix: string): string {
  if (magnitude.kind === "point") return `${formatNumber(magnitude.value)}${suffix}`;
  return `${formatNumber(magnitude.lower)}–${formatNumber(magnitude.upper)}${suffix}`;
}

function thresholdReferenceLabel(
  reference: Extract<ActivityNativeIntensityValue, { metric: "relative_threshold" }>["reference"],
): string {
  switch (reference) {
    case "ftp":
      return "FTP";
    case "critical_power":
      return "Critical Power";
    case "threshold_speed":
      return "threshold speed";
    case "lthr":
      return "LTHR";
    case "provider_threshold":
      return "provider threshold";
    case "unspecified_threshold":
      return "threshold";
  }
}

/** Formats the native unit without converting it into normalized intensity. */
export function formatActivityNativeIntensity(value: ActivityNativeIntensityValue): string {
  switch (value.metric) {
    case "relative_threshold":
      return `${formatMagnitude(value.magnitude, value.unit === "percent" ? "%" : "×")} ${thresholdReferenceLabel(value.reference)}`;
    case "power":
      return formatMagnitude(value.magnitude, " W");
    case "speed": {
      const unit =
        value.unit === "meters_per_second"
          ? " m/s"
          : value.unit === "kilometers_per_hour"
            ? " km/h"
            : " mph";
      return formatMagnitude(value.magnitude, unit);
    }
    case "pace": {
      const unit =
        value.unit === "seconds_per_kilometer"
          ? " s/km"
          : value.unit === "seconds_per_mile"
            ? " s/mi"
            : " s/100 m";
      return formatMagnitude(value.magnitude, unit);
    }
    case "heart_rate":
      return formatMagnitude(value.magnitude, " bpm");
    case "perceived_exertion":
      return `RPE ${formatMagnitude(value.magnitude, "/10")}`;
    case "zone":
      return `${value.scale === "heart_rate" ? "Heart-rate" : `${value.scale.charAt(0).toUpperCase()}${value.scale.slice(1)}`} zone ${value.value}`;
  }
}

export function getCommonLoadMethodLabel(method: string | null | undefined): string | null {
  switch (method) {
    case "heart_rate_zones":
      return "Heart-rate zones";
    case "power_threshold":
      return "Power threshold";
    case "run_pace_threshold":
      return "Run pace threshold";
    case "swim_pace_threshold":
      return "Swim pace threshold";
    default:
      return null;
  }
}

function evidenceRoleLabel(role: ActivityQuantificationEvidenceRole): string {
  switch (role) {
    case "prescribed":
      return "Prescribed";
    case "measured":
      return "Observed";
    case "estimated":
      return "Estimated";
    case "derived":
      return "Derived";
  }
}

function uniqueLabels(labels: readonly (string | null | undefined)[]): string[] {
  return [...new Set(labels.filter((label): label is string => Boolean(label)))];
}

function presentationUnavailableReason(
  quantification: ParsedQuantification,
  members: readonly ActivityQuantification[],
): string | null {
  if (quantification.commonLoad.status !== "unavailable") return null;
  if (quantification.kind !== "aggregate") return quantification.commonLoad.reason;

  const unavailableMembers = members.filter((member) => member.commonLoad.status === "unavailable");
  if (unavailableMembers.length !== members.length || unavailableMembers.length === 0) {
    return quantification.commonLoad.reason;
  }
  const reasons = uniqueLabels(
    unavailableMembers.map((member) =>
      member.commonLoad.status === "unavailable" ? member.commonLoad.reason : null,
    ),
  );
  return reasons.length === 1 ? (reasons[0] ?? null) : quantification.commonLoad.reason;
}

function appendStatusEvidence(
  labels: readonly string[],
  status: ActivityQuantificationPresentationStatus,
): string {
  const statusLabel =
    status === "partial" ? "Partial" : status === "unavailable" ? "Unavailable" : null;
  return uniqueLabels([...labels, statusLabel]).join(" · ");
}

function isEstimatedCommonLoad(quantification: ParsedQuantification): boolean {
  if (quantification.kind === "aggregate" || quantification.commonLoad.status === "unavailable") {
    return false;
  }
  return (
    quantification.commonLoad.quality?.estimate === true ||
    (quantification.commonLoad.status === "available" && quantification.commonLoad.estimated)
  );
}

function sourceEvidence(
  quantification: ParsedQuantification,
  status: ActivityQuantificationPresentationStatus,
): string {
  const labels =
    quantification.kind === "aggregate"
      ? ["Derived"]
      : quantification.kind === "prescription"
        ? ["Prescribed"]
        : ["Observed"];
  if (isEstimatedCommonLoad(quantification)) {
    labels.push("Estimated");
  }
  return appendStatusEvidence(labels, status);
}

function normalizedEvidence(
  quantification: ParsedQuantification,
  status: ActivityQuantificationPresentationStatus,
): string {
  const source =
    quantification.kind === "prescription"
      ? ["Prescribed"]
      : quantification.kind === "observation"
        ? ["Observed"]
        : [];
  if (isEstimatedCommonLoad(quantification)) {
    source.push("Estimated");
  }
  source.push("Derived from Common Load");
  return appendStatusEvidence(source, status);
}

function formatCommonLoad(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return rounded.toFixed(1).replace(/\.0$/, "");
}

function nativeIntensityLabel(quantification: ParsedQuantification): string {
  const lifecycle =
    quantification.kind === "aggregate" ? quantification.lifecycle : quantification.kind;
  return lifecycle === "prescription"
    ? activityQuantificationLabels.prescribedIntensity
    : activityQuantificationLabels.observedIntensity;
}

function getNativeIntensityPresentation(
  quantification: ParsedQuantification,
  members: readonly ActivityQuantification[],
  memberInputCount: number,
): ActivityNativeIntensityPresentation {
  const sources = quantification.kind === "aggregate" ? members : [quantification];
  const nativeIntensities = sources.map((source) =>
    source.kind === "prescription" ? source.intensity.prescribed : source.intensity.observed,
  );
  const values = uniqueLabels(
    nativeIntensities.flatMap((intensity) =>
      intensity.status === "unavailable" ? [] : intensity.values.map(formatActivityNativeIntensity),
    ),
  );
  const roles = uniqueLabels(
    nativeIntensities.map((intensity) => evidenceRoleLabel(intensity.evidenceRole)),
  );
  const hasIncompleteInput =
    (quantification.kind === "aggregate" && memberInputCount !== members.length) ||
    nativeIntensities.some((intensity) => intensity.status !== "available");
  const status: ActivityQuantificationPresentationStatus =
    values.length === 0 ? "unavailable" : hasIncompleteInput ? "partial" : "available";
  const evidence = appendStatusEvidence(roles, status);

  return {
    evidence: evidence || "Unavailable",
    explanation:
      values.length === 0
        ? "No prescribed or observed native intensity values are available."
        : "Native intensity is preserved independently of Common Load and normalized intensity.",
    label: nativeIntensityLabel(quantification),
    status,
    value: values.length > 0 ? values.join(" · ") : "Unavailable",
    values,
  };
}

function unavailablePresentation(): ActivityQuantificationPresentation {
  const explanation = "No canonical activity quantification was provided.";
  return {
    kind: "unavailable",
    nativeIntensity: {
      evidence: "Unavailable",
      explanation,
      label: activityQuantificationLabels.nativeIntensity,
      status: "unavailable",
      value: "Unavailable",
      values: [],
    },
    commonLoad: {
      diagnostic: null,
      evidence: "Unavailable",
      explanation,
      label: activityQuantificationLabels.commonLoad,
      method: null,
      status: "unavailable",
      unavailableReason: null,
      value: "Unavailable",
    },
    normalizedIntensity: {
      diagnostic: null,
      evidence: "Unavailable",
      explanation,
      label: activityQuantificationLabels.normalizedIntensity,
      method: null,
      status: "unavailable",
      unavailableReason: null,
      value: "Unavailable",
    },
  };
}

/**
 * Presents the canonical quantification envelope without inferring missing values or
 * converting native targets into a second normalized-intensity authority.
 */
export function getActivityQuantificationPresentation(
  value: unknown,
  context: ActivityQuantificationPresentationContext = {},
): ActivityQuantificationPresentation {
  const parsed = parseQuantification(value);
  if (!parsed) return unavailablePresentation();

  const { members, quantification } = parsed;
  const segmentCommonLoads = members.map((member) => member.commonLoad);
  const commonLoad = quantification.commonLoad;
  const memberMethods = uniqueLabels(
    members.map((member) => getCommonLoadMethodLabel(member.commonLoad.method)),
  );
  const method =
    quantification.kind === "aggregate"
      ? memberMethods.length === 1
        ? (memberMethods[0] ?? null)
        : null
      : getCommonLoadMethodLabel(quantification.commonLoad.method);
  const commonStatus = commonLoad.status;
  const unavailableReason = presentationUnavailableReason(quantification, members);
  const commonValue = commonLoad.status === "unavailable" ? null : commonLoad.load;
  const normalizedValue = commonLoad.status === "unavailable" ? null : commonLoad.intensity;
  const normalizedStatus: ActivityQuantificationPresentationStatus =
    normalizedValue === null ? "unavailable" : commonLoad.status;
  const commonContext: CommonLoadDiagnosticContext = {
    hasHeartRateSummary: context.hasHeartRateSummary,
    segmentCommonLoads,
  };
  let diagnostic: CommonLoadDiagnostic | null = null;
  if (quantification.kind === "aggregate") {
    if (quantification.commonLoad.status === "unavailable") {
      diagnostic = getAggregateCommonLoadDiagnostic(commonContext);
    }
  } else if (quantification.commonLoad.status === "unavailable") {
    diagnostic = getCommonLoadDiagnostic(quantification.commonLoad, commonContext);
  }
  const methodPhrase = method ? ` using ${method}` : "";

  return {
    kind: quantification.kind,
    nativeIntensity: getNativeIntensityPresentation(quantification, members, members.length),
    commonLoad: {
      diagnostic,
      evidence: sourceEvidence(quantification, commonStatus),
      explanation:
        commonStatus === "unavailable"
          ? `Common Load is unavailable${methodPhrase}.`
          : commonStatus === "partial"
            ? `Common Load is partial${methodPhrase}; missing evidence is not treated as zero.`
            : `Common Load is available${methodPhrase}.`,
      label: activityQuantificationLabels.commonLoad,
      method,
      status: commonStatus,
      unavailableReason,
      value: commonValue === null ? "Unavailable" : formatCommonLoad(commonValue),
    },
    normalizedIntensity: {
      diagnostic: null,
      evidence: normalizedEvidence(quantification, normalizedStatus),
      explanation:
        normalizedStatus === "unavailable"
          ? "Normalized intensity is unavailable because the canonical Common Load result is unavailable."
          : normalizedStatus === "partial"
            ? "Normalized intensity is partial and comes directly from the canonical Common Load result."
            : "Normalized intensity comes directly from the canonical Common Load result.",
      label: activityQuantificationLabels.normalizedIntensity,
      method,
      status: normalizedStatus,
      unavailableReason,
      value: normalizedValue === null ? "Unavailable" : normalizedValue.toFixed(2),
    },
  };
}
