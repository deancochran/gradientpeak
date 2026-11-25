import type {
  InferredCurrentState,
  InferredCurrentStateEvidenceQuality,
  InferredCurrentStateMean,
  InferredCurrentStateUncertainty,
  InferredStateSnapshotMetadata,
} from "../../schemas/training-plan-structure";
import { diffDateOnlyUtcDays } from "../dateOnlyUtc";

export interface PriorInferredStateSnapshotInput {
  mean?: Partial<InferredCurrentStateMean>;
  uncertainty?: Partial<InferredCurrentStateUncertainty>;
  evidence_quality?: Partial<InferredCurrentStateEvidenceQuality>;
  as_of?: string;
  metadata?: Partial<InferredStateSnapshotMetadata>;
}

export function inferCurrentState(input: {
  startDate: string;
  startingLongTermLoad: number;
  startingRecentLoad: number;
  evidenceScore: number;
  priorSnapshot?: PriorInferredStateSnapshotInput;
}): InferredCurrentState & { metadata: InferredStateSnapshotMetadata } {
  const asOf = toDateTimeUtc(input.startDate);
  const bootstrapLongTermLoad = Math.max(0, input.startingLongTermLoad);
  const bootstrapRecentLoad = Math.max(0, input.startingRecentLoad);
  const bootstrapLoadBalance = bootstrapLongTermLoad - bootstrapRecentLoad;
  const bootstrapSlb = bootstrapRecentLoad / Math.max(bootstrapLongTermLoad, 1);
  const bootstrapDurability = clamp01(input.evidenceScore) * 100;
  const bootstrapReadiness = Math.max(
    0,
    Math.min(100, Math.round(50 + bootstrapLoadBalance * 2 + (bootstrapDurability - 50) * 0.25)),
  );

  const hasPrior = input.priorSnapshot !== undefined;
  if (!hasPrior) {
    const bootstrapVariance = clamp01(0.8 - clamp01(input.evidenceScore) * 0.6);
    return {
      mean: {
        longTermLoad: round1(bootstrapLongTermLoad),
        recentLoad: round1(bootstrapRecentLoad),
        loadBalance: round1(bootstrapLoadBalance),
        slb: round3(Math.max(0, bootstrapSlb)),
        durability: round1(bootstrapDurability),
        readiness: bootstrapReadiness,
      },
      uncertainty: {
        state_variance: round3(bootstrapVariance),
        confidence: round3(clamp01(1 - bootstrapVariance)),
      },
      evidence_quality: {
        score: round3(clamp01(input.evidenceScore)),
        missingness_ratio: round3(clamp01(1 - input.evidenceScore)),
      },
      as_of: asOf,
      metadata: {
        updated_at: asOf,
        missingness_counter: Math.max(0, Math.round((1 - input.evidenceScore) * 10)),
        evidence_counter: Math.max(0, Math.round(input.evidenceScore * 10)),
      },
    };
  }

  const prior = input.priorSnapshot;
  const priorAsOf = prior?.as_of ?? prior?.metadata?.updated_at;
  const daysSincePrior =
    typeof priorAsOf === "string"
      ? Math.max(0, diffDateOnlyUtcDays(priorAsOf.slice(0, 10), input.startDate))
      : 0;
  const longTermLoadPredictBlend = 1 - Math.exp(-daysSincePrior / 42);
  const recentLoadPredictBlend = 1 - Math.exp(-daysSincePrior / 7);

  const priorLongTermLoad = Math.max(
    0,
    safeFinite(prior?.mean?.longTermLoad, bootstrapLongTermLoad),
  );
  const priorRecentLoad = Math.max(0, safeFinite(prior?.mean?.recentLoad, bootstrapRecentLoad));
  const predictedLongTermLoad =
    priorLongTermLoad + (bootstrapLongTermLoad - priorLongTermLoad) * longTermLoadPredictBlend;
  const predictedRecentLoad =
    priorRecentLoad + (bootstrapRecentLoad - priorRecentLoad) * recentLoadPredictBlend;

  const priorVariance = clamp01(safeFinite(prior?.uncertainty?.state_variance, 0.5));
  const priorMissingnessCounter = Math.max(
    0,
    Math.round(safeFinite(prior?.metadata?.missingness_counter, 0)),
  );
  const priorEvidenceCounter = Math.max(
    0,
    Math.round(safeFinite(prior?.metadata?.evidence_counter, 0)),
  );
  const predictedVariance = clamp01(
    priorVariance +
      daysSincePrior * 0.004 +
      priorMissingnessCounter * 0.01 -
      priorEvidenceCounter * 0.004,
  );
  const assimilationGain = 1 / (1 + predictedVariance * 6);

  const posteriorLongTermLoad =
    predictedLongTermLoad + (bootstrapLongTermLoad - predictedLongTermLoad) * assimilationGain;
  const posteriorRecentLoad =
    predictedRecentLoad + (bootstrapRecentLoad - predictedRecentLoad) * assimilationGain;
  const posteriorLoadBalance = posteriorLongTermLoad - posteriorRecentLoad;
  const posteriorSlb = posteriorRecentLoad / Math.max(1, posteriorLongTermLoad);
  const posteriorDurability = clamp01(
    safeFinite(prior?.mean?.durability, bootstrapDurability) / 100,
  );
  const posteriorReadiness = Math.max(
    0,
    Math.min(
      100,
      Math.round(50 + posteriorLoadBalance * 2 + (posteriorDurability * 100 - 50) * 0.25),
    ),
  );
  const posteriorVariance = clamp01(predictedVariance * (1 - assimilationGain * 0.5));
  const currentEvidenceScore = clamp01(
    safeFinite(prior?.evidence_quality?.score, input.evidenceScore) * 0.4 +
      clamp01(input.evidenceScore) * 0.6,
  );
  const missingnessRatio = clamp01(1 - currentEvidenceScore);
  const missingnessCounter =
    priorMissingnessCounter + Math.max(0, Math.round(missingnessRatio * 6));
  const evidenceCounter = priorEvidenceCounter + Math.max(0, Math.round(currentEvidenceScore * 6));

  return {
    mean: {
      longTermLoad: round1(posteriorLongTermLoad),
      recentLoad: round1(posteriorRecentLoad),
      loadBalance: round1(posteriorLoadBalance),
      slb: round3(Math.max(0, posteriorSlb)),
      durability: round1(posteriorDurability * 100),
      readiness: posteriorReadiness,
    },
    uncertainty: {
      state_variance: round3(posteriorVariance),
      confidence: round3(clamp01(1 - posteriorVariance)),
    },
    evidence_quality: {
      score: round3(currentEvidenceScore),
      missingness_ratio: round3(missingnessRatio),
    },
    as_of: asOf,
    metadata: {
      updated_at: asOf,
      missingness_counter: missingnessCounter,
      evidence_counter: evidenceCounter,
    },
  };
}

function toDateTimeUtc(date: string): string {
  const parsed = Date.parse(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed)) {
    return new Date(0).toISOString();
  }
  return new Date(parsed).toISOString();
}

function safeFinite(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return value;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
