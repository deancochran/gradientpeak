import { describe, expect, it } from "vitest";

import {
  buildCanonicalDurationPerformanceCurve,
  canonicalRunningDurationEffortEvidenceSchema,
  createDurationPerformanceCalculationIdentity,
  durationPerformanceCurveValueSchema,
} from "..";
import {
  runningEffortFixture,
  RUNNING_DURATION_PERFORMANCE_FIXTURE_V1 as runningFixture,
} from "./fixtures/duration-performance-v1";

describe("duration-performance foundation contracts", () => {
  it("accepts qualified exact windows and rejects raw samples or identity drift", () => {
    const effort = runningEffortFixture({
      evidenceId: "contract-run",
      activityId: "contract-activity",
      durationSeconds: 300,
      speedMetersPerSecond: 5,
    });
    expect(canonicalRunningDurationEffortEvidenceSchema.parse(effort)).toEqual(effort);
    expect(
      canonicalRunningDurationEffortEvidenceSchema.safeParse({
        ...effort,
        rawSamples: [{ offsetSeconds: 0, speedMetersPerSecond: 5 }],
      }).success,
    ).toBe(false);
    expect(
      canonicalRunningDurationEffortEvidenceSchema.safeParse({
        ...effort,
        provenance: { ...effort.provenance, observationId: "different-observation" },
      }).success,
    ).toBe(false);
    expect(
      canonicalRunningDurationEffortEvidenceSchema.safeParse({
        ...effort,
        provenance: { ...effort.provenance, contributingDurationSeconds: 299 },
      }).success,
    ).toBe(false);
  });

  it("constructs one deterministic strongest point per exact duration with full identity", () => {
    const weaker = runningEffortFixture({
      evidenceId: "weaker-300",
      activityId: "weaker-activity",
      durationSeconds: 300,
      speedMetersPerSecond: 5.2,
    });
    const stronger = runningEffortFixture({
      evidenceId: "stronger-300",
      activityId: "stronger-activity",
      durationSeconds: 300,
      speedMetersPerSecond: 5.4,
    });
    const foundation = buildCanonicalDurationPerformanceCurve({
      efforts: [weaker, stronger],
      assessmentAsOf: "2026-07-01T00:00:00.000Z",
      readCoverage: { state: "complete", reason: null },
      requiredExactDurationsSeconds: [300],
    });

    expect(foundation.status).toBe("available");
    expect(foundation.curve?.points).toEqual([
      expect.objectContaining({
        observationId: stronger.observationId,
        sourceEvidenceId: stronger.evidenceId,
        evidenceRevision: 1,
        activityId: stronger.activityId,
        segmentId: stronger.segmentId,
        durationSeconds: 300,
        value: 5.4,
        unit: "meters_per_second",
      }),
    ]);
    expect(foundation.evidenceSummary.supersededEvidenceIds).toEqual([weaker.evidenceId]);
    expect(
      durationPerformanceCurveValueSchema.parse({
        points: foundation.curve?.points,
        selectionPolicy: "strongest_per_exact_duration_then_newest_then_evidence_id",
        monotonicityPolicy: "abstain_without_repair_on_increasing_value_with_duration",
      }),
    ).toBeTruthy();
  });

  it("keeps partial and unavailable states explicit", () => {
    const sparse = buildCanonicalDurationPerformanceCurve({
      efforts: [runningFixture.input.efforts[0]].filter(
        (effort): effort is NonNullable<typeof effort> => effort !== undefined,
      ),
      assessmentAsOf: runningFixture.input.assessmentAsOf,
      readCoverage: { state: "complete", reason: null },
      requiredExactDurationsSeconds: [30, 60],
    });
    expect(sparse).toMatchObject({
      status: "partial",
      reasons: ["missing_curve_anchors"],
      confidence: "low",
    });

    const truncated = buildCanonicalDurationPerformanceCurve({
      efforts: runningFixture.input.efforts,
      assessmentAsOf: runningFixture.input.assessmentAsOf,
      readCoverage: { state: "truncated", reason: "query_limit_reached" },
      requiredExactDurationsSeconds: [30],
    });
    expect(truncated).toMatchObject({
      status: "unavailable",
      reasons: ["evidence_read_truncated"],
      curve: null,
      confidence: "unavailable",
    });
  });

  it("publishes stable history/evidence/calculation fingerprints with different change scopes", () => {
    const effort = runningFixture.input.efforts[0];
    if (!effort) throw new Error("Running fixture requires one effort");
    const identityInput: Parameters<typeof createDurationPerformanceCalculationIdentity>[0] = {
      modelVersion: "running-duration-performance-v1",
      inputContractVersion: "running-duration-performance-input-v1",
      evidencePolicyVersion: "running-duration-performance-evidence-v1",
      assessmentAsOf: runningFixture.input.assessmentAsOf,
      athleteId: "athlete-1",
      activityCategory: "run",
      modelVariant: "running_raw_speed",
      sourceCalculationVersions: ["best-effort-extraction-v1"],
      evidence: [
        {
          evidenceId: effort.evidenceId,
          observationId: effort.observationId,
          evidenceRevision: effort.evidenceRevision,
          sourceCalculationVersion: effort.calculationVersion,
          facts: { durationSeconds: effort.durationSeconds, value: effort.value },
        },
      ],
    };
    const first = createDurationPerformanceCalculationIdentity(identityInput);
    const reordered = createDurationPerformanceCalculationIdentity({
      ...identityInput,
      sourceCalculationVersions: [...identityInput.sourceCalculationVersions].reverse(),
    });
    const changedEvidence = createDurationPerformanceCalculationIdentity({
      ...identityInput,
      evidence: identityInput.evidence.map((item) => ({
        ...item,
        evidenceRevision: item.evidenceRevision + 1,
      })),
    });
    const laterAssessment = createDurationPerformanceCalculationIdentity({
      ...identityInput,
      assessmentAsOf: "2026-07-02T00:00:00.000Z",
    });

    expect(reordered).toEqual(first);
    expect(changedEvidence.historySeriesFingerprint).toBe(first.historySeriesFingerprint);
    expect(changedEvidence.evidenceSetFingerprint).not.toBe(first.evidenceSetFingerprint);
    expect(laterAssessment.evidenceSetFingerprint).toBe(first.evidenceSetFingerprint);
    expect(laterAssessment.calculationFingerprint).not.toBe(first.calculationFingerprint);
  });
});
