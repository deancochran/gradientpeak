export const AEROBIC_ANALYSIS_REFERENCE_VERSION = "direct-duration-weighted-aerobic-reference-v1";

export interface ReferenceAerobicAnalysisSample {
  timestampSeconds: number;
  output: number | null;
  heartRateBpm: number | null;
  included?: boolean;
}

interface ReferencePart {
  durationSeconds: number;
  output: number;
  heartRateBpm: number;
}

export interface ReferenceAerobicStatistics {
  durationSeconds: number;
  averageOutput: number;
  averageHeartRateBpm: number;
  efficiencyFactor: number;
  outputCoefficientOfVariation: number;
}

export interface ReferenceAerobicAnalysisResult {
  contributingDurationSeconds: number;
  eligibleDurationSeconds: number;
  outputCoverage: number;
  heartRateCoverage: number;
  pairedCoverage: number;
  efficiency: ReferenceAerobicStatistics | null;
  firstHalf: ReferenceAerobicStatistics | null;
  secondHalf: ReferenceAerobicStatistics | null;
  decoupling: number | null;
}

function statistics(parts: readonly ReferencePart[]): ReferenceAerobicStatistics | null {
  let durationSeconds = 0;
  let weightedOutput = 0;
  let weightedHeartRate = 0;
  let weightedOutputSquared = 0;
  for (const part of parts) {
    durationSeconds += part.durationSeconds;
    weightedOutput += part.output * part.durationSeconds;
    weightedHeartRate += part.heartRateBpm * part.durationSeconds;
    weightedOutputSquared += part.output ** 2 * part.durationSeconds;
  }
  if (durationSeconds <= 0) return null;
  const averageOutput = weightedOutput / durationSeconds;
  const averageHeartRateBpm = weightedHeartRate / durationSeconds;
  if (averageHeartRateBpm <= 0) return null;
  const variance = Math.max(0, weightedOutputSquared / durationSeconds - averageOutput ** 2);
  return {
    durationSeconds,
    averageOutput,
    averageHeartRateBpm,
    efficiencyFactor: averageOutput / averageHeartRateBpm,
    outputCoefficientOfVariation: averageOutput > 0 ? Math.sqrt(variance) / averageOutput : 0,
  };
}

/**
 * Clarity-first independent oracle. It imports no production schema or
 * calculation helper and directly materializes accepted weighted intervals.
 */
export function calculateReferenceAerobicAnalysis(input: {
  samples: readonly ReferenceAerobicAnalysisSample[];
  maxGapSeconds?: number;
}): ReferenceAerobicAnalysisResult {
  const maxGapSeconds = input.maxGapSeconds ?? 5;
  if (!Number.isFinite(maxGapSeconds) || maxGapSeconds <= 0) {
    throw new Error("Reference maximum gap must be finite and positive");
  }

  const contributing: ReferencePart[] = [];
  let previousTimestampSeconds: number | null = null;
  let eligibleDurationSeconds = 0;
  let outputDurationSeconds = 0;
  let heartRateDurationSeconds = 0;

  for (const sample of input.samples) {
    if (!Number.isFinite(sample.timestampSeconds)) {
      throw new Error("Reference timestamps must be finite");
    }
    if (sample.output !== null && (!Number.isFinite(sample.output) || sample.output < 0)) {
      throw new Error("Reference output must be finite, nonnegative, or missing");
    }
    if (
      sample.heartRateBpm !== null &&
      (!Number.isFinite(sample.heartRateBpm) || sample.heartRateBpm < 0)
    ) {
      throw new Error("Reference heart rate must be finite, nonnegative, or missing");
    }
    const previousTimestamp = previousTimestampSeconds;
    if (previousTimestamp !== null && sample.timestampSeconds <= previousTimestamp) continue;
    previousTimestampSeconds = sample.timestampSeconds;
    if (previousTimestamp === null) continue;

    const intervalSeconds = sample.timestampSeconds - previousTimestamp;
    if (sample.included === false) continue;
    eligibleDurationSeconds += intervalSeconds;

    const output = sample.output;
    const heartRateBpm = sample.heartRateBpm;
    const outputPresent = output !== null;
    const heartRateUsable = heartRateBpm !== null && heartRateBpm > 0;
    if (!outputPresent || !heartRateUsable) {
      if (outputPresent) outputDurationSeconds += intervalSeconds;
      if (heartRateUsable) heartRateDurationSeconds += intervalSeconds;
      continue;
    }
    if (intervalSeconds > maxGapSeconds) continue;

    outputDurationSeconds += intervalSeconds;
    heartRateDurationSeconds += intervalSeconds;
    contributing.push({
      durationSeconds: intervalSeconds,
      output,
      heartRateBpm,
    });
  }

  const efficiency = statistics(contributing);
  const contributingDurationSeconds = efficiency?.durationSeconds ?? 0;
  const targetHalfDurationSeconds = contributingDurationSeconds / 2;
  const firstParts: ReferencePart[] = [];
  const secondParts: ReferencePart[] = [];
  let firstDurationSeconds = 0;
  for (const part of contributing) {
    const firstPartDuration = Math.min(
      part.durationSeconds,
      Math.max(0, targetHalfDurationSeconds - firstDurationSeconds),
    );
    if (firstPartDuration > 0) {
      firstParts.push({ ...part, durationSeconds: firstPartDuration });
      firstDurationSeconds += firstPartDuration;
    }
    const secondPartDuration = part.durationSeconds - firstPartDuration;
    if (secondPartDuration > 0) {
      secondParts.push({ ...part, durationSeconds: secondPartDuration });
    }
  }
  const firstHalf = statistics(firstParts);
  const secondHalf = statistics(secondParts);
  const decoupling =
    firstHalf === null || secondHalf === null || firstHalf.efficiencyFactor <= 0
      ? null
      : (firstHalf.efficiencyFactor - secondHalf.efficiencyFactor) / firstHalf.efficiencyFactor;

  return {
    contributingDurationSeconds,
    eligibleDurationSeconds,
    outputCoverage:
      eligibleDurationSeconds > 0 ? outputDurationSeconds / eligibleDurationSeconds : 0,
    heartRateCoverage:
      eligibleDurationSeconds > 0 ? heartRateDurationSeconds / eligibleDurationSeconds : 0,
    pairedCoverage:
      eligibleDurationSeconds > 0 ? contributingDurationSeconds / eligibleDurationSeconds : 0,
    efficiency,
    firstHalf,
    secondHalf,
    decoupling,
  };
}
