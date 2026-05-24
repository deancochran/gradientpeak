import type { NoHistoryProjectionMetadata, ProjectionChartPayload } from "@repo/core";

type ProjectionPoint = ProjectionChartPayload["points"][number];
type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return value as UnknownRecord;
};

const asFiniteNumber = (value: unknown): number | undefined => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  return value;
};

const asStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
};

const toBoundedPercent = (value: number): number => {
  const normalized = value <= 1 ? value * 100 : value;
  return Math.max(0, Math.min(100, normalized));
};

const readPercent = (value: unknown): number | undefined => {
  const numeric = asFiniteNumber(value);
  if (numeric !== undefined) {
    return toBoundedPercent(numeric);
  }

  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  const candidateKeys = [
    "score",
    "value",
    "percent",
    "percentage",
    "confidence",
    "confidence_score",
    "confidence_0_100",
    "uncertainty",
    "uncertainty_score",
    "uncertainty_0_100",
    "prediction_uncertainty",
    "prediction_confidence",
  ];

  for (const key of candidateKeys) {
    const candidate = asFiniteNumber(record[key]);
    if (candidate !== undefined) {
      return toBoundedPercent(candidate);
    }
  }

  return undefined;
};

const readFirstRecord = (
  source: UnknownRecord | undefined,
  keys: string[],
): UnknownRecord | undefined => {
  if (!source) {
    return undefined;
  }

  for (const key of keys) {
    const candidate = asRecord(source[key]);
    if (candidate) {
      return candidate;
    }
  }

  return undefined;
};

const readFirstNumber = (source: UnknownRecord | undefined, keys: string[]): number | undefined => {
  if (!source) {
    return undefined;
  }

  for (const key of keys) {
    const candidate = asFiniteNumber(source[key]);
    if (candidate !== undefined) {
      return candidate;
    }
  }

  return undefined;
};

const readFirstStringArray = (source: UnknownRecord | undefined, keys: string[]): string[] => {
  if (!source) {
    return [];
  }

  for (const key of keys) {
    const candidate = asStringArray(source[key]);
    if (candidate.length > 0) {
      return candidate;
    }
  }

  return [];
};

export const formatNoHistoryConfidence = (
  confidence: NoHistoryProjectionMetadata["projection_floor_confidence"],
) => confidence ?? "n/a";

export const resolveProjectionConfidenceHint = (
  projectionChart: ProjectionChartPayload | undefined,
  selectedPoint: ProjectionPoint | undefined,
) => {
  const selectedPointRecord = asRecord(selectedPoint as unknown);
  const uncertaintyPercent =
    readPercent(selectedPointRecord?.prediction_uncertainty) ??
    readPercent(selectedPointRecord?.predictionUncertainty) ??
    readPercent(asRecord(projectionChart as unknown)?.prediction_uncertainty) ??
    readPercent(asRecord(projectionChart as unknown)?.predictionUncertainty);
  if (uncertaintyPercent !== undefined) {
    return `Uncertainty hint: forecast spread ${Math.round(uncertaintyPercent)}%. Readiness remains the primary signal.`;
  }

  const confidencePercent =
    readPercent(selectedPointRecord?.prediction_confidence) ??
    readPercent(selectedPointRecord?.predictionConfidence) ??
    readPercent(projectionChart?.readiness_confidence) ??
    readPercent(projectionChart?.no_history?.evidence_confidence?.score);
  if (confidencePercent !== undefined) {
    return `Confidence hint: model confidence ${Math.round(confidencePercent)}%. Readiness remains the primary signal.`;
  }

  const confidenceState =
    projectionChart?.no_history?.evidence_confidence?.state ??
    projectionChart?.no_history?.projection_floor_confidence;
  if (confidenceState) {
    return `Confidence hint: evidence confidence ${confidenceState}. Readiness remains the primary signal.`;
  }

  return undefined;
};

export const toSentenceKey = (key: string) => key.replaceAll("_", " ").replaceAll("-", " ").trim();

export const formatDiagnosticNumber = (value: number) => {
  if (Math.abs(value) >= 100) return value.toFixed(0);
  if (Math.abs(value) >= 10) return value.toFixed(1);
  return value.toFixed(2);
};

export const summarizeNumericRecord = (record: UnknownRecord | undefined, limit: number) => {
  if (!record) {
    return "";
  }

  const entries = Object.entries(record)
    .map(([key, value]) => {
      const numeric = asFiniteNumber(value);
      if (numeric === undefined) {
        return null;
      }
      return `${toSentenceKey(key)} ${formatDiagnosticNumber(numeric)}`;
    })
    .filter((entry): entry is string => Boolean(entry));

  return entries.slice(0, limit).join(", ");
};

export const resolveContinuousProjectionDiagnostics = (
  projectionChart: ProjectionChartPayload | undefined,
) => {
  const baseDiagnostics = asRecord(projectionChart?.projection_diagnostics);
  const scopedDiagnostics =
    readFirstRecord(baseDiagnostics, [
      "continuous_projection_diagnostics",
      "continuous_projection",
      "continuous",
    ]) ?? baseDiagnostics;

  const effectiveOptimizer = readFirstRecord(scopedDiagnostics, [
    "effective_optimizer",
    "effectiveOptimizer",
    "effective_optimizer_values",
    "effectiveOptimizerValues",
  ]);
  const effectiveOptimizerConfig = readFirstRecord(scopedDiagnostics, [
    "effective_optimizer_config",
    "effectiveOptimizerConfig",
  ]);
  const objectiveContributions = readFirstRecord(scopedDiagnostics, [
    "objective_contributions",
    "objectiveContributions",
  ]);
  const objectiveComposition = readFirstRecord(scopedDiagnostics, [
    "objective_composition",
    "objectiveComposition",
  ]);
  const clampCounts = readFirstRecord(scopedDiagnostics, ["clamp_counts", "clampCounts"]);
  const sampledWeeks =
    readFirstNumber(objectiveContributions, ["sampled_weeks", "sampledWeeks"]) ?? undefined;
  const derivedClampPressure =
    clampCounts && sampledWeeks && sampledWeeks > 0
      ? ((readFirstNumber(clampCounts, ["tss"]) ?? 0) +
          (readFirstNumber(clampCounts, ["ctl"]) ?? 0)) /
        sampledWeeks
      : undefined;
  const effectiveOptimizerSummaryRecord =
    effectiveOptimizer ??
    readFirstRecord(effectiveOptimizerConfig, ["weights"]) ??
    effectiveOptimizerConfig;
  const objectiveSummaryRecord =
    objectiveComposition ??
    readFirstRecord(objectiveContributions, ["weighted_terms", "weightedTerms"]) ??
    objectiveContributions;
  const curvatureContribution =
    readFirstNumber(scopedDiagnostics, ["curvature_contribution", "curvatureContribution"]) ??
    readFirstNumber(objectiveSummaryRecord, [
      "curvature_contribution",
      "curvatureContribution",
      "curvature",
      "curve",
    ]);

  return {
    activeConstraints: readFirstStringArray(scopedDiagnostics, [
      "active_constraints",
      "activeConstraints",
    ]),
    bindingConstraints: readFirstStringArray(scopedDiagnostics, [
      "binding_constraints",
      "bindingConstraints",
    ]),
    clampPressure:
      readFirstNumber(scopedDiagnostics, ["clamp_pressure", "clampPressure"]) ??
      (derivedClampPressure !== undefined
        ? Math.max(0, Math.min(1, derivedClampPressure))
        : undefined),
    effectiveOptimizer: effectiveOptimizerSummaryRecord,
    objectiveComposition: objectiveSummaryRecord,
    curvatureContribution,
  };
};
