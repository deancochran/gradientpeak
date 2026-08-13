import {
  type CanonicalCyclingDurationEffortEvidence,
  CYCLING_DURATION_PERFORMANCE_INPUT_VERSION,
  calculateCyclingDurationPerformance,
  canonicalQualifiedDurationEffortEvidenceSchema,
  evaluateCssFrom400m200mTest,
} from "@repo/core";
import {
  type CalibrationEvidenceEvaluationInput,
  type CalibrationIdentity,
  type CalibrationRegistryEntry,
  evaluateRegisteredCalibrationEvidence,
  getCalibrationRegistryEntriesForCategory,
  getCalibrationRegistryEntry,
} from "@repo/core/performance-calibration";
import type { activityEfforts } from "@repo/db";
import type { DrizzleTransactionClient } from "../../db";
import { markAthleteStateDirty } from "../../repositories/athlete-state-repository";
import {
  insertCalibrationEvidenceEvaluation,
  invalidateCalibrationEvidenceForActivitySources,
  readBikeCalibrationModelEfforts,
  readCalibrationAsOf,
  readCalibrationEvidenceSource,
  resolveCalibrationWithProfileLockHeld,
} from "../../repositories/performance-calibration-repository";
import type { GeneratedActivityLthrEvidence } from "../activities/reconcile-activity-evidence";
import type { SwimmingCssProtocolReconciliationResult } from "./reconcile-swimming-css-protocol-evidence";

type EffortInsert = typeof activityEfforts.$inferInsert;
type BikeCalibrationModelEffortRow = Awaited<
  ReturnType<typeof readBikeCalibrationModelEfforts>
>["rows"][number];

function isCalibrationSource(
  source: Awaited<ReturnType<typeof readCalibrationEvidenceSource>>[number] | undefined,
): source is Awaited<ReturnType<typeof readCalibrationEvidenceSource>>[number] & {
  activityCategory: "bike" | "run" | "swim";
  sourceArtifactId: string;
} {
  return Boolean(
    source &&
      (source.activityCategory === "bike" ||
        source.activityCategory === "run" ||
        source.activityCategory === "swim") &&
      typeof source.sourceArtifactId === "string" &&
      typeof source.segmentId === "string" &&
      Number.isInteger(source.segmentsRevision) &&
      source.finishedAt instanceof Date &&
      Number.isFinite(source.finishedAt.getTime()),
  );
}

function baseEvaluation(
  candidateValue: number | null,
): Omit<CalibrationEvidenceEvaluationInput, "identity"> {
  return {
    sourceAccepted: true,
    candidateValue,
    streamCoverage: null,
    supportingOutputCoverage: null,
    maximumGapSeconds: null,
    selectedWindowSeconds: null,
    outputCoefficientOfVariation: null,
    supportingThresholdIdentity: null,
    supportingThresholdValue: null,
    thresholdLike: false,
    modelQualitySufficient: false,
    modelFailureReason: null,
    modelDiagnostics: null,
    completeCssProtocol: false,
    gradeCoverage: null,
  };
}

function canonicalBikeModelEffort(
  effort: BikeCalibrationModelEffortRow,
  input: { profileId: string },
): CanonicalCyclingDurationEffortEvidence | null {
  if (
    effort.start_offset === null ||
    effort.provenance === null ||
    typeof effort.provenance !== "object" ||
    Array.isArray(effort.provenance)
  ) {
    return null;
  }
  const provenance = effort.provenance as Record<string, unknown>;
  if (effort.activity_category !== "bike" || effort.effort_type !== "power") return null;
  const parsed = canonicalQualifiedDurationEffortEvidenceSchema.safeParse({
    observationId: effort.id,
    evidenceId: effort.id,
    evidenceRevision: effort.segment_revision,
    athleteId: input.profileId,
    activityId: effort.activity_id,
    segmentId: effort.segment_id,
    recordedAt: effort.recorded_at.toISOString(),
    activityCategory: "bike",
    metric: "power",
    durationSeconds: effort.duration_seconds,
    value: effort.value,
    unit: "watts",
    evidenceContext: { kind: "cycling_power" },
    source: "imported",
    method: "activity_file_best_effort",
    calculationVersion: effort.calculation_version,
    provenance: {
      observationId: effort.id,
      activityId: effort.activity_id,
      segmentId: effort.segment_id,
      derivedFrom: "activity_file_stream",
      sourceSeries: provenance.source_series,
      exactWindowStartOffsetSeconds: provenance.exact_window_start_offset_seconds,
      exactWindowEndOffsetSeconds: provenance.exact_window_end_offset_seconds,
      durationSeconds: provenance.duration_seconds,
      contributingDurationSeconds: provenance.contributing_duration_seconds,
      windowCoverage: provenance.window_coverage,
      sourceTimeCoverage: provenance.source_time_coverage,
      extractionStatus: provenance.extraction_status,
      extractionReason: provenance.extraction_reason,
      calculationVersion: provenance.calculation_version,
    },
  });
  return parsed.success && parsed.data.activityCategory === "bike" ? parsed.data : null;
}

const BIKE_MODEL_HISTORY_REASONS = new Set([
  "no_eligible_efforts",
  "critical_power_insufficient_points",
  "critical_power_missing_duration_band",
  "critical_power_insufficient_independent_activities",
  "planning_threshold_power_twenty_minute_evidence_missing",
]);

export function evaluateBikeThresholdPowerEvidence(input: {
  entry: CalibrationRegistryEntry;
  efforts: CanonicalCyclingDurationEffortEvidence[];
  effortReadTruncated: boolean;
  profileId: string;
  asOf: Date;
}) {
  const model = calculateCyclingDurationPerformance({
    contractVersion: CYCLING_DURATION_PERFORMANCE_INPUT_VERSION,
    assessmentAsOf: input.asOf.toISOString(),
    athleteId: input.profileId,
    effortReadCoverage: input.effortReadTruncated
      ? { state: "truncated", reason: "query_limit_reached" }
      : { state: "complete", reason: null },
    efforts: input.efforts,
  });
  const outcome = model.parameters.planningThresholdPower;
  const value = outcome.status === "unavailable" ? null : outcome.value.watts;
  const modelReasons = [
    ...new Set([...model.parameters.criticalPower.reasons, ...outcome.reasons]),
  ];
  const sourceEvidenceIds = [
    ...new Set([...model.parameters.criticalPower.sourceEvidenceIds, ...outcome.sourceEvidenceIds]),
  ];
  const effortsById = new Map(input.efforts.map((effort) => [effort.evidenceId, effort]));
  const sourceActivityIds = [
    ...new Set(
      sourceEvidenceIds.flatMap((evidenceId) => {
        const effort = effortsById.get(evidenceId);
        return effort ? [effort.activityId] : [];
      }),
    ),
  ];
  const modelQualitySufficient = outcome.status === "available" && outcome.confidence !== "low";
  const evaluation = evaluateRegisteredCalibrationEvidence(input.entry, {
    ...baseEvaluation(value),
    modelQualitySufficient,
    modelFailureReason: modelQualitySufficient
      ? null
      : modelReasons.some((reason) => BIKE_MODEL_HISTORY_REASONS.has(reason))
        ? "model_history_insufficient"
        : "model_quality_insufficient",
    modelDiagnostics: {
      calculationFingerprint: model.calculationIdentity.calculationFingerprint,
      status: outcome.status,
      reasons: modelReasons,
      sourceEvidenceIds,
      sourceActivityIds,
      evidenceCount: sourceEvidenceIds.length,
      activityCount: sourceActivityIds.length,
    },
  });
  return { evaluation, modelSourceEffortIds: sourceEvidenceIds };
}

export function evaluateRunThresholdSpeedEvidence(input: {
  entry: CalibrationRegistryEntry;
  efforts: EffortInsert[];
}) {
  const runWindow = (durationSeconds: number) =>
    input.efforts.find((effort) => {
      if (
        effort.activity_category !== "run" ||
        effort.duration_seconds !== durationSeconds ||
        effort.provenance === null ||
        typeof effort.provenance !== "object" ||
        Array.isArray(effort.provenance)
      ) {
        return false;
      }
      return (
        (effort.provenance as Record<string, unknown>).source_series === "grade_adjusted_speed"
      );
    });
  const thirtyMinuteRow = runWindow(1_800);
  const twentyMinuteRow = runWindow(1_200);
  const windowProvenance =
    thirtyMinuteRow?.provenance &&
    typeof thirtyMinuteRow.provenance === "object" &&
    !Array.isArray(thirtyMinuteRow.provenance)
      ? (thirtyMinuteRow.provenance as Record<string, unknown>)
      : null;
  const finiteNumber = (value: unknown): number | null =>
    typeof value === "number" && Number.isFinite(value) ? value : null;
  const value = finiteNumber(thirtyMinuteRow?.value);
  const twentyMinuteValue = finiteNumber(twentyMinuteRow?.value);
  const athleteRelativeRatio =
    value !== null && twentyMinuteValue !== null && twentyMinuteValue > 0
      ? value / twentyMinuteValue
      : null;
  return evaluateRegisteredCalibrationEvidence(input.entry, {
    ...baseEvaluation(value),
    selectedWindowSeconds: thirtyMinuteRow?.duration_seconds ?? null,
    streamCoverage: finiteNumber(windowProvenance?.output_window_coverage),
    maximumGapSeconds: finiteNumber(windowProvenance?.maximum_gap_seconds),
    outputCoefficientOfVariation: finiteNumber(windowProvenance?.output_coefficient_of_variation),
    gradeCoverage: finiteNumber(windowProvenance?.output_window_coverage),
    supportingThresholdIdentity: input.entry.identity,
    supportingThresholdValue: twentyMinuteValue,
    thresholdLike:
      athleteRelativeRatio !== null && athleteRelativeRatio >= 0.9 && athleteRelativeRatio <= 1.001,
  });
}

function evaluationForHeartRate(
  entry: CalibrationRegistryEntry,
  detected: GeneratedActivityLthrEvidence | null,
  supporting: Awaited<ReturnType<typeof readCalibrationAsOf>>,
  source: { activityId: string; segmentId: string },
) {
  const matchedDetected =
    detected?.provenance.activity_id === source.activityId &&
    detected.provenance.segment_id === source.segmentId
      ? detected
      : null;
  const supportingOutput = matchedDetected?.provenance.supporting_output_value ?? null;
  const thresholdLike =
    supporting !== null &&
    supportingOutput !== null &&
    supportingOutput >= supporting.value * 0.9 &&
    supportingOutput <= supporting.value * 1.1;
  return evaluateRegisteredCalibrationEvidence(entry, {
    ...baseEvaluation(matchedDetected?.valueBpm ?? null),
    selectedWindowSeconds: matchedDetected?.provenance.duration_seconds ?? null,
    streamCoverage: matchedDetected?.provenance.hr_coverage ?? null,
    supportingOutputCoverage: matchedDetected?.provenance.supporting_output_coverage ?? null,
    maximumGapSeconds: matchedDetected?.provenance.maximum_gap_seconds ?? null,
    outputCoefficientOfVariation:
      matchedDetected?.provenance.output_coefficient_of_variation ?? null,
    supportingThresholdIdentity: supporting?.identity ?? null,
    supportingThresholdValue: supporting?.value ?? null,
    gradeCoverage: matchedDetected?.provenance.grade_coverage ?? null,
    thresholdLike,
  });
}

function evaluationForCss(
  entry: CalibrationRegistryEntry,
  result: SwimmingCssProtocolReconciliationResult | null,
) {
  const css =
    result?.status === "qualified"
      ? evaluateCssFrom400m200mTest({
          time400Seconds: result.evidence.efforts[0].activeDurationSeconds,
          time200Seconds: result.evidence.efforts[1].activeDurationSeconds,
        })
      : null;
  const value = css?.status === "available" ? 100 / css.cssSecondsPer100m : null;
  return evaluateRegisteredCalibrationEvidence(entry, {
    ...baseEvaluation(value),
    completeCssProtocol: css?.status === "available",
  });
}

/** Accepted-file extension: invalidate superseded source, evaluate, select, and dirty atomically. */
export async function reconcilePerformanceCalibrationsWithProfileLockHeld(
  tx: DrizzleTransactionClient,
  input: {
    profileId: string;
    activityId: string;
    efforts: EffortInsert[];
    detectedLTHR: GeneratedActivityLthrEvidence | null;
    swimmingCssResult: SwimmingCssProtocolReconciliationResult | null;
    preInvalidatedIdentities?: CalibrationIdentity[];
    now: Date;
  },
) {
  const sources = await readCalibrationEvidenceSource(tx, input);
  const calibrationSources = sources.filter(isCalibrationSource);
  const primary = calibrationSources[0];
  if (!primary) {
    return {
      changed: false,
      identities: [] as CalibrationIdentity[],
      deferredIdentities: [] as CalibrationIdentity[],
    };
  }
  const affected = await invalidateCalibrationEvidenceForActivitySources(tx, {
    profileId: input.profileId,
    activityId: input.activityId,
    acceptedSources: calibrationSources.map((source) => ({
      segmentId: source.segmentId,
      segmentRevision: source.segmentsRevision,
      sourceArtifactId: source.sourceArtifactId,
    })),
    now: input.now,
    reason: "accepted_source_revision_replaced",
  });
  const identities = new Map<string, CalibrationIdentity>();
  const invalidatedIdentityKeys = new Set<string>();
  for (const identity of [...(input.preInvalidatedIdentities ?? []), ...affected]) {
    if (
      identity.activityCategory === "bike" ||
      identity.activityCategory === "run" ||
      identity.activityCategory === "swim"
    ) {
      identities.set(`${identity.metricKey}/${identity.activityCategory}`, {
        metricKey: identity.metricKey,
        activityCategory: identity.activityCategory,
      });
      invalidatedIdentityKeys.add(`${identity.metricKey}/${identity.activityCategory}`);
    }
  }
  for (const source of calibrationSources) {
    const segmentEfforts = input.efforts.filter((effort) => effort.segment_id === source.segmentId);
    const evaluations: Array<{
      identity: CalibrationIdentity;
      evaluation: ReturnType<typeof evaluateRegisteredCalibrationEvidence>;
      modelSourceEffortIds: string[];
    }> = [];
    for (const entry of getCalibrationRegistryEntriesForCategory(source.activityCategory)) {
      switch (entry.calculationEntrypoint) {
        case "bike_duration_performance":
          {
            const read = await readBikeCalibrationModelEfforts(tx, {
              profileId: input.profileId,
              asOf: source.finishedAt,
            });
            const efforts = read.rows.flatMap((effort) => {
              const adapted = canonicalBikeModelEffort(effort, input);
              return adapted?.activityCategory === "bike" ? [adapted] : [];
            });
            const power = evaluateBikeThresholdPowerEvidence({
              entry,
              efforts,
              effortReadTruncated: read.truncated,
              profileId: input.profileId,
              asOf: source.finishedAt,
            });
            evaluations.push({
              identity: entry.identity,
              evaluation: power.evaluation,
              modelSourceEffortIds: power.modelSourceEffortIds,
            });
          }
          break;
        case "run_threshold_speed_30m":
          evaluations.push({
            identity: entry.identity,
            evaluation: evaluateRunThresholdSpeedEvidence({
              entry,
              efforts: segmentEfforts,
            }),
            modelSourceEffortIds: [],
          });
          break;
        case "swim_css_400m_200m":
          evaluations.push({
            identity: entry.identity,
            evaluation: evaluationForCss(entry, input.swimmingCssResult),
            modelSourceEffortIds: [],
          });
          break;
        case "threshold_heart_rate_30m": {
          const supportingIdentity: CalibrationIdentity = {
            metricKey: source.activityCategory === "bike" ? "threshold_power" : "threshold_speed",
            activityCategory: source.activityCategory,
          };
          const supporting = await readCalibrationAsOf(tx, {
            profileId: input.profileId,
            identity: supportingIdentity,
            asOf: source.finishedAt,
            excludedActivityId: input.activityId,
          });
          evaluations.push({
            identity: entry.identity,
            evaluation: evaluationForHeartRate(entry, input.detectedLTHR, supporting, {
              activityId: input.activityId,
              segmentId: source.segmentId,
            }),
            modelSourceEffortIds: [],
          });
          break;
        }
      }
    }
    for (const { identity, evaluation, modelSourceEffortIds } of evaluations) {
      const registryEntry = getCalibrationRegistryEntry(identity);
      if (!registryEntry) throw new Error("Calibration evaluation identity is not registered");
      await insertCalibrationEvidenceEvaluation(tx, {
        profileId: input.profileId,
        identity,
        value: evaluation.state === "candidate" ? evaluation.value : null,
        observedAt: source.finishedAt,
        activityId: input.activityId,
        segmentId: source.segmentId,
        segmentRevision: source.segmentsRevision,
        sourceArtifactId: source.sourceArtifactId,
        state: evaluation.state,
        rejectionReason: evaluation.state === "rejected" ? evaluation.reason : null,
        sourceSemantics:
          registryEntry.canonicalUnit === "beats_per_minute" ? "measured" : "derived",
        diagnostics: evaluation.diagnostics,
        modelSourceEffortIds,
        now: input.now,
      });
      identities.set(`${identity.metricKey}/${identity.activityCategory}`, identity);
    }
  }
  let changed = false;
  const deferredIdentities: CalibrationIdentity[] = [];
  for (const identity of identities.values()) {
    const resolved = await resolveCalibrationWithProfileLockHeld(tx, {
      profileId: input.profileId,
      identity,
      asOf: primary.finishedAt,
      now: input.now,
    });
    if (resolved.disposition === "deferred_newer_history") deferredIdentities.push(identity);
    const identityKey = `${identity.metricKey}/${identity.activityCategory}`;
    if (resolved.changed || invalidatedIdentityKeys.has(identityKey)) {
      changed = true;
      await markAthleteStateDirty(tx, {
        profileId: input.profileId,
        effectiveAt: resolved.calibration ? new Date(resolved.calibration.effectiveAt) : input.now,
        now: input.now,
      });
    }
  }
  return { changed, identities: [...identities.values()], deferredIdentities };
}

/**
 * Final history-import pass. Imported files may arrive newest-first, while per-file reconciliation
 * intentionally refuses to append calibration history behind a newer row. Re-resolving every
 * registered identity at the completed evidence horizon makes the current selection independent
 * of provider page order. Caller must hold the profile advisory fence.
 */
export async function finalizePerformanceCalibrationsAfterHistoryImport(
  tx: DrizzleTransactionClient,
  input: { profileId: string; asOf: Date; now: Date },
) {
  const identities = (["bike", "run", "swim"] as const).flatMap((activityCategory) =>
    getCalibrationRegistryEntriesForCategory(activityCategory).map((entry) => entry.identity),
  );
  let changed = false;
  for (const identity of identities) {
    const resolved = await resolveCalibrationWithProfileLockHeld(tx, { ...input, identity });
    if (!resolved.changed) continue;
    changed = true;
    await markAthleteStateDirty(tx, {
      profileId: input.profileId,
      effectiveAt: resolved.calibration ? new Date(resolved.calibration.effectiveAt) : input.asOf,
      now: input.now,
    });
  }
  return { changed, identities };
}
