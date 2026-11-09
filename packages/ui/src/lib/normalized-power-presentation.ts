import type { CyclingNormalizedPowerResult } from "@repo/core/calculations/normalized-power";

export interface NormalizedPowerPresentation {
  status: CyclingNormalizedPowerResult["status"];
  valueWatts: number | null;
  reason:
    | "source_incomplete"
    | "no_samples"
    | "no_contributing_intervals"
    | "insufficient_window"
    | null;
  calculationVersion: CyclingNormalizedPowerResult["calculationVersion"];
  sourceTimeCoverage: number;
  excludedGapDurationSeconds: number;
  label: string;
  evidence: string;
}

function unavailableReasonText(
  reason: Exclude<NormalizedPowerPresentation["reason"], "source_incomplete" | null>,
): string {
  switch (reason) {
    case "no_samples":
      return "no power samples";
    case "no_contributing_intervals":
      return "no contributing power intervals";
    case "insufficient_window":
      return "less than one complete 30-second window";
  }
}

/** Presents the structured result without inventing watts for unavailable evidence. */
export function getNormalizedPowerPresentation(
  result: CyclingNormalizedPowerResult | null | undefined,
): NormalizedPowerPresentation | null {
  if (result == null) return null;
  const sourceTimeCoverage = result.diagnostics.sourceTimeCoverage;
  const excludedGapDurationSeconds = result.diagnostics.excludedGapDurationSeconds;
  const coveragePercent = Math.round(sourceTimeCoverage * 100);
  const gapEvidence =
    excludedGapDurationSeconds > 0
      ? `; ${excludedGapDurationSeconds.toLocaleString("en-US", {
          maximumFractionDigits: 2,
        })} s excluded as gaps`
      : "; no excluded gaps";
  const versionEvidence = `; ${result.calculationVersion}`;

  if (result.status === "unavailable") {
    return {
      status: result.status,
      valueWatts: null,
      reason: result.reason,
      calculationVersion: result.calculationVersion,
      sourceTimeCoverage,
      excludedGapDurationSeconds,
      label: "Normalized power",
      evidence: `Unavailable: ${unavailableReasonText(result.reason)}; ${coveragePercent}% source-time coverage${gapEvidence}${versionEvidence}`,
    };
  }
  if (result.status === "partial") {
    return {
      status: result.status,
      valueWatts: result.valueWatts,
      reason: result.reason,
      calculationVersion: result.calculationVersion,
      sourceTimeCoverage,
      excludedGapDurationSeconds,
      label: "Normalized power",
      evidence: `${coveragePercent}% source-time coverage${gapEvidence}${versionEvidence}`,
    };
  }
  return {
    status: result.status,
    valueWatts: result.valueWatts,
    reason: null,
    calculationVersion: result.calculationVersion,
    sourceTimeCoverage,
    excludedGapDurationSeconds,
    label: "Normalized power",
    evidence: `Available; ${coveragePercent}% source-time coverage${gapEvidence}${versionEvidence}`,
  };
}
