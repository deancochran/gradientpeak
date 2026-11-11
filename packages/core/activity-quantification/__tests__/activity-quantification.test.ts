import { describe, expect, expectTypeOf, it } from "vitest";

import { activityCalibrationQualitySchema } from "../../activity-analysis/calibration-quality";
import {
  COMMON_RELATIVE_LOAD_MODEL,
  COMMON_RELATIVE_LOAD_VERSION,
  type CommonLoadResult,
  calculateAvailableCommonLoad,
  commonLoadResultSchema,
  commonThresholdEvidenceSchema,
  getNormalizedIntensity,
} from "../../load/common-relative-load";
import {
  type ActivityDistance,
  type ActivityDuration,
  type ActivityObservationQuantification,
  type ActivityPrescriptionQuantification,
  type ActivityQuantification,
  type ActivityQuantificationSubjectIdentity,
  activityDistanceSchema,
  activityDurationSchema,
  activityObservationQuantificationSchema,
  activityPlanPrescriptionQuantificationBundleSchema,
  activityPrescriptionQuantificationSchema,
  activityQuantificationBundleSchema,
  activityQuantificationSchema,
  aggregateActivityQuantificationSchema,
  aggregateObservations,
  aggregatePrescriptions,
  comparePlannedToCompleted,
  createActivityPlanPrescriptionQuantificationBundle,
  createActivityQuantificationCalculationIdentity,
  createActivityQuantificationEvidenceIdentity,
  createCompletedActivityQuantificationSubjectIdentity,
  createObservationQuantificationBundle,
  createPlanActivityQuantificationSubjectIdentity,
  createPlanOccurrenceActivityQuantificationSubjectIdentity,
  createPrescriptionQuantificationBundle,
  fingerprintActivityQuantification,
  observedActivityIntensitySchema,
  prescribedActivityIntensitySchema,
} from "../index";

const computedAsOf = "2026-07-31T12:00:00.000Z";

function availableCommonLoad(intensity = 0.8): CommonLoadResult {
  const thresholdEvidence = commonThresholdEvidenceSchema.parse({
    type: "ftp_watts",
    value: 250,
    unit: "watts",
    source: "manual",
    observedAt: "2026-07-20T10:00:00.000Z",
    validAt: "2026-07-20T10:00:00.000Z",
    freshness: "current",
    calculationVersion: "manual-threshold-v1",
    sourceFingerprint: "ftp-observation-1",
  });
  const quality = activityCalibrationQualitySchema.parse({
    source: "manual",
    observed_at: thresholdEvidence.observedAt,
    valid_at: thresholdEvidence.validAt,
    confidence: "high",
    stale: false,
    estimate: false,
    calculation_version: thresholdEvidence.calculationVersion,
    evidence_fingerprint: thresholdEvidence.sourceFingerprint,
  });
  return calculateAvailableCommonLoad({
    activity_category: "bike",
    method: "power_threshold",
    quality,
    thresholdEvidence,
    evidenceFingerprint: "available-common-load-1",
    computedAsOf,
    estimated: true,
    contributingDurationSeconds: 3_600,
    intensity,
  });
}

function unavailableCommonLoad(): CommonLoadResult {
  return commonLoadResultSchema.parse({
    status: "unavailable",
    model: COMMON_RELATIVE_LOAD_MODEL,
    version: COMMON_RELATIVE_LOAD_VERSION,
    activity_category: "bike",
    method: "power_threshold",
    quality: null,
    thresholdEvidence: null,
    evidenceFingerprint: null,
    computedAsOf,
    contributingDurationSeconds: 3_600,
    reason: "threshold_missing",
  });
}

function nonnumericPartialCommonLoad(): CommonLoadResult {
  return commonLoadResultSchema.parse({
    status: "partial",
    model: COMMON_RELATIVE_LOAD_MODEL,
    version: COMMON_RELATIVE_LOAD_VERSION,
    activity_category: "bike",
    method: null,
    quality: null,
    thresholdEvidence: null,
    evidenceFingerprint: null,
    computedAsOf,
    load: null,
    intensity: null,
    contributingDurationSeconds: 0,
    eligibleDurationSeconds: 3_600,
    sourceTimeCoverage: 0,
    reason: "insufficient_coverage",
  });
}

function prescribedDuration(): ActivityDuration {
  return activityDurationSchema.parse({
    elapsed: {
      status: "available",
      evidenceRole: "prescribed",
      value: 3_600,
      unit: "seconds",
    },
    active: {
      status: "available",
      evidenceRole: "prescribed",
      value: 3_300,
      unit: "seconds",
    },
    moving: {
      status: "unavailable",
      evidenceRole: "prescribed",
      value: null,
      unit: "seconds",
      reason: "not_prescribed",
    },
  });
}

function unavailableDuration(evidenceRole: "prescribed" | "measured"): ActivityDuration {
  const reason = evidenceRole === "prescribed" ? "not_prescribed" : "not_observed";
  return activityDurationSchema.parse({
    elapsed: { status: "unavailable", evidenceRole, value: null, unit: "seconds", reason },
    active: { status: "unavailable", evidenceRole, value: null, unit: "seconds", reason },
    moving: { status: "unavailable", evidenceRole, value: null, unit: "seconds", reason },
  });
}

function unavailableDistance(evidenceRole: "prescribed" | "measured"): ActivityDistance {
  return activityDistanceSchema.parse({
    status: "unavailable",
    evidenceRole,
    value: null,
    unit: "meters",
    reason: evidenceRole === "prescribed" ? "not_prescribed" : "not_observed",
  });
}

function nativeIntensity(evidenceRole: "prescribed" | "measured" = "prescribed") {
  const input = {
    status: "available",
    evidenceRole,
    values: [
      {
        metric: "relative_threshold",
        reference: "ftp",
        unit: "percent",
        magnitude: { kind: "point", value: 80 },
      },
    ],
  } as const;
  return evidenceRole === "prescribed"
    ? prescribedActivityIntensitySchema.parse(input)
    : observedActivityIntensitySchema.parse(input);
}

type QuantificationFixtureOptions = {
  sequence?: number;
  kind?: "prescription" | "observation";
  commonLoad?: CommonLoadResult;
  duration?: ActivityDuration;
  distance?: ActivityDistance;
};

function quantification(options: QuantificationFixtureOptions = {}): ActivityQuantification {
  const sequence = options.sequence ?? 1;
  const kind = options.kind ?? "prescription";
  const activityId = `activity-${sequence}`;
  const segmentId = `segment-${sequence}`;
  const commonLoad = options.commonLoad ?? availableCommonLoad();
  const evidenceRole = kind === "prescription" ? "prescribed" : "measured";
  const subjectIdentity =
    kind === "prescription"
      ? createPlanActivityQuantificationSubjectIdentity({ planId: `plan-${sequence}` })
      : createCompletedActivityQuantificationSubjectIdentity({
          activityId,
        });
  const evidenceIdentity = createActivityQuantificationEvidenceIdentity({
    evidenceType: kind === "prescription" ? "plan_revision" : "segment_facts",
    sourceIds:
      kind === "prescription"
        ? [`source-${sequence}`]
        : [`source-${sequence}`, activityId, segmentId],
    revisionFingerprint: `revision-${sequence}`,
    details: { kind, sequence },
  });
  const shared = {
    subjectIdentity,
    evidenceIdentity,
    calculationIdentity: createActivityQuantificationCalculationIdentity({
      model: commonLoad.model,
      version: commonLoad.version,
      computedAt: commonLoad.computedAsOf,
      calibrationEvidenceFingerprint: commonLoad.evidenceFingerprint,
    }),
    activity_category: "bike",
    duration:
      options.duration ??
      (kind === "prescription" ? prescribedDuration() : unavailableDuration("measured")),
    distance: options.distance ?? unavailableDistance(evidenceRole),
    commonLoad,
  };

  return kind === "prescription"
    ? activityQuantificationSchema.parse({
        kind,
        stage: "plan",
        ...shared,
        intensity: { prescribed: nativeIntensity(evidenceRole) },
      })
    : activityQuantificationSchema.parse({
        kind,
        stage: "final",
        ...shared,
        intensity: { observed: nativeIntensity(evidenceRole) },
        completedProvenance: {
          activityId,
          segmentId,
          source: "unknown",
          artifactIdentity: null,
          providerIdentity: null,
          segmentRevision: null,
          observedAt: computedAsOf,
          computedAt: computedAsOf,
          calculationVersion: "activity-quantification-test-v1",
        },
      });
}

function prescriptionWithSubject(
  sequence: number,
  subjectIdentity: ActivityQuantificationSubjectIdentity,
): ActivityPrescriptionQuantification {
  const value = quantification({ sequence });
  if (value.kind !== "prescription") throw new Error("Expected prescription fixture");
  return activityPrescriptionQuantificationSchema.parse({
    ...value,
    subjectIdentity,
  });
}

function observationWithSubject(
  sequence: number,
  subjectIdentity: ActivityQuantificationSubjectIdentity,
): ActivityObservationQuantification {
  const value = quantification({ sequence, kind: "observation" });
  if (value.kind !== "observation") throw new Error("Expected observation fixture");
  const activityId =
    subjectIdentity.subjectType === "activity"
      ? subjectIdentity.activityId
      : subjectIdentity.subjectType === "segment" &&
          subjectIdentity.parentSubjectIdentity.subjectType === "activity"
        ? subjectIdentity.parentSubjectIdentity.activityId
        : null;
  if (activityId === null) throw new Error("Expected an activity observation subject fixture");
  const segmentId =
    subjectIdentity.subjectType === "segment"
      ? subjectIdentity.segmentId
      : value.completedProvenance.segmentId;
  return activityObservationQuantificationSchema.parse({
    ...value,
    subjectIdentity,
    evidenceIdentity: createActivityQuantificationEvidenceIdentity({
      evidenceType: "segment_facts",
      sourceIds: [`source-${sequence}`, activityId, segmentId],
      revisionFingerprint: `revision-${sequence}`,
      details: { kind: "observation", sequence },
    }),
    completedProvenance: {
      ...value.completedProvenance,
      activityId,
      segmentId,
    },
  });
}

describe("activity quantification contracts", () => {
  it("validates strict prescription and observation variants with canonical quantities", () => {
    const prescription = quantification();
    const observation = quantification({ sequence: 2, kind: "observation" });

    expect(prescription).toMatchObject({ kind: "prescription", stage: "plan" });
    expect(observation).toMatchObject({ kind: "observation", stage: "final" });
    expect(prescription.duration.moving).toMatchObject({
      status: "unavailable",
      reason: "not_prescribed",
    });
    expectTypeOf(prescription).toMatchTypeOf<ActivityQuantification>();

    expect(
      activityQuantificationSchema.safeParse({ ...prescription, legacyLoad: 50 }).success,
    ).toBe(false);
    expect(
      activityQuantificationSchema.safeParse({
        ...prescription,
        intensity: {
          ...prescription.intensity,
          normalized: { status: "available", value: 0.81 },
        },
      }).success,
    ).toBe(false);
    expect(
      activityDurationSchema.safeParse({
        ...prescription.duration,
        moving: {
          status: "available",
          evidenceRole: "measured",
          value: 3_301,
          unit: "seconds",
        },
      }).success,
    ).toBe(false);
    expect(
      activityDurationSchema.safeParse({
        ...prescription.duration,
        active: {
          status: "unavailable",
          evidenceRole: "measured",
          value: null,
          unit: "seconds",
          reason: "not_observed",
        },
        moving: {
          status: "available",
          evidenceRole: "measured",
          value: 3_301,
          unit: "seconds",
        },
      }).success,
    ).toBe(true);
    expect(aggregateActivityQuantificationSchema.safeParse(prescription).success).toBe(false);
  });

  it("derives normalized intensity only from resolved Common Load", () => {
    const commonLoad = availableCommonLoad(0.875);

    expect(commonLoad).toMatchObject({ status: "available", intensity: 0.875 });
    expect(getNormalizedIntensity(commonLoad)).toBe(0.875);
    expect(getNormalizedIntensity(unavailableCommonLoad())).toBeNull();
  });

  it("preserves prescribed native intensity when Common Load normalization is unavailable", () => {
    const result = quantification({ commonLoad: unavailableCommonLoad() });
    if (result.kind !== "prescription") throw new Error("Expected prescription fixture");

    expect(result.intensity.prescribed).toMatchObject({
      status: "available",
      evidenceRole: "prescribed",
      values: [
        {
          metric: "relative_threshold",
          unit: "percent",
          magnitude: { kind: "point", value: 80 },
        },
      ],
    });
    expect(getNormalizedIntensity(result.commonLoad)).toBeNull();
    expect(result.commonLoad).toMatchObject({
      status: "unavailable",
      reason: "threshold_missing",
      method: "power_threshold",
    });
  });

  it("propagates unavailable and nonnumeric partial members without zero aggregation", () => {
    const noDuration = unavailableDuration("prescribed");
    const noDistance = unavailableDistance("prescribed");
    const unavailable = quantification({
      sequence: 1,
      commonLoad: unavailableCommonLoad(),
      duration: noDuration,
      distance: noDistance,
    });
    const partial = quantification({
      sequence: 2,
      commonLoad: nonnumericPartialCommonLoad(),
      duration: noDuration,
      distance: noDistance,
    });
    if (unavailable.kind !== "prescription" || partial.kind !== "prescription") {
      throw new Error("Expected prescription fixtures");
    }
    const aggregate = aggregatePrescriptions([unavailable, partial]);

    expect(aggregate.commonLoad).toMatchObject({
      status: "unavailable",
      reason: "no_load_data",
    });
    expect(getNormalizedIntensity(aggregate.commonLoad)).toBeNull();
    expect(aggregate.duration.elapsed).toMatchObject({
      status: "unavailable",
      value: null,
      reason: "no_available_values",
    });
    expect(aggregate.distance).toMatchObject({
      status: "unavailable",
      value: null,
      reason: "no_available_values",
    });

    const available = quantification({ sequence: 3 });
    if (available.kind !== "prescription") throw new Error("Expected prescription fixture");
    const mixed = aggregatePrescriptions([available, unavailable]);
    expect(mixed.commonLoad.status).toBe("partial");
    if (mixed.commonLoad.status !== "partial") throw new Error("Expected partial Common Load");
    expect(mixed.commonLoad.load).toBeCloseTo(64, 12);
    expect(mixed.commonLoad.load).not.toBe(0);
    expect(mixed.duration.elapsed).toMatchObject({ status: "partial", value: 3_600 });
  });

  it("creates equal fingerprints for equivalent key order and aggregate member order", () => {
    const first = fingerprintActivityQuantification({
      source: { id: "plan-1", revision: 2 },
      evidence: ["duration-1", "threshold-1"],
    });
    const equivalent = fingerprintActivityQuantification({
      evidence: ["duration-1", "threshold-1"],
      source: { revision: 2, id: "plan-1" },
    });
    const withUndefinedObjectProperty = fingerprintActivityQuantification({
      evidence: ["duration-1", "threshold-1"],
      source: { id: "plan-1", optionalEvidence: undefined, revision: 2 },
    });
    expect(first).toEqual(equivalent);
    expect(first).toEqual(withUndefinedObjectProperty);
    expect(first).toBe("activity-quantification:v1:fnv1a64:a99083388ebf5637");

    const left = quantification({ sequence: 10 });
    const right = quantification({ sequence: 11, commonLoad: unavailableCommonLoad() });
    if (left.kind !== "prescription" || right.kind !== "prescription") {
      throw new Error("Expected prescription fixtures");
    }
    expect(aggregatePrescriptions([left, right]).subjectIdentity).toEqual(
      aggregatePrescriptions([right, left]).subjectIdentity,
    );
  });

  it("rejects evidence fingerprints that do not cover their readable details", () => {
    const canonical = quantification({ sequence: 12 });

    expect(
      activityQuantificationSchema.safeParse({
        ...canonical,
        evidenceIdentity: {
          ...canonical.evidenceIdentity,
          details: { kind: "tampered", sequence: 12 },
        },
      }).success,
    ).toBe(false);
  });

  it("names prescription native intensity as prescribed and completed native intensity as observed", () => {
    const prescription = quantification({ sequence: 20 });
    const observation = quantification({ sequence: 21, kind: "observation" });
    if (prescription.kind !== "prescription" || observation.kind !== "observation") {
      throw new Error("Expected lifecycle fixtures");
    }

    expect(prescription.intensity.prescribed.evidenceRole).toBe("prescribed");
    expect(observation.intensity.observed.evidenceRole).toBe("measured");
  });

  it("carries readable completed provenance alongside evidence and calculation fingerprints", () => {
    const observation = observationWithSubject(
      22,
      createCompletedActivityQuantificationSubjectIdentity({ activityId: "activity-readable" }),
    );
    const withProvenance = activityObservationQuantificationSchema.parse({
      ...observation,
      evidenceIdentity: createActivityQuantificationEvidenceIdentity({
        evidenceType: "provider_summary",
        sourceIds: ["activity-readable", "segment-readable", "provider-a", "provider-activity-1"],
        revisionFingerprint: "readable-revision",
        details: { activityId: "activity-readable", segmentId: "segment-readable" },
      }),
      completedProvenance: {
        activityId: "activity-readable",
        segmentId: "segment-readable",
        source: "provider_summary",
        artifactIdentity: null,
        providerIdentity: { provider: "provider-a", externalId: "provider-activity-1" },
        segmentRevision: 3,
        observedAt: "2026-07-30T10:00:00.000Z",
        computedAt: computedAsOf,
        calculationVersion: "completed-segment-v1",
      },
    });

    expect(withProvenance.completedProvenance).toMatchObject({
      activityId: "activity-readable",
      segmentId: "segment-readable",
      source: "provider_summary",
      segmentRevision: 3,
    });
    expect(withProvenance.evidenceIdentity.fingerprint).toMatch(/^activity-quantification:/);
    expect(withProvenance.calculationIdentity.computedAt).toBe(computedAsOf);
  });

  it("requires final completed provenance and rejects provisional observations", () => {
    const observation = quantification({ sequence: 23, kind: "observation" });
    if (observation.kind !== "observation") throw new Error("Expected observation fixture");
    const { completedProvenance: _completedProvenance, ...withoutProvenance } = observation;

    expect(activityObservationQuantificationSchema.safeParse(withoutProvenance).success).toBe(
      false,
    );
    expect(
      activityObservationQuantificationSchema.safeParse({
        ...observation,
        stage: "provisional",
      }).success,
    ).toBe(false);
    expect(
      activityObservationQuantificationSchema.safeParse({
        ...observation,
        duration: {
          ...observation.duration,
          active: {
            status: "available",
            evidenceRole: "measured",
            value: 3_000,
            unit: "seconds",
          },
          moving: {
            status: "available",
            evidenceRole: "measured",
            value: 3_001,
            unit: "seconds",
          },
        },
      }).success,
    ).toBe(false);
  });

  it("rejects duplicate subjects and compares lifecycles without mixing them", () => {
    const planSubject = createPlanActivityQuantificationSubjectIdentity({ planId: "plan-1" });
    const prescription = prescriptionWithSubject(30, planSubject);
    const observation = observationWithSubject(
      31,
      createCompletedActivityQuantificationSubjectIdentity({ activityId: "activity-1" }),
    );

    expect(() => aggregatePrescriptions([prescription, prescription])).toThrow(
      /Duplicate activity quantification subject identity/,
    );
    const comparison = comparePlannedToCompleted({
      prescriptions: [prescription],
      observations: [observation],
    });
    expect(comparison).toMatchObject({
      kind: "planned_vs_completed_comparison",
      prescriptions: { lifecycle: "prescription", summaryScope: "collection" },
      observations: { lifecycle: "observation", summaryScope: "collection" },
    });
  });

  it("derives validated component and collection bundles with distinct coverage semantics", () => {
    const planSubject = createPlanActivityQuantificationSubjectIdentity({ planId: "plan-bundle" });
    const firstOccurrence = createPlanOccurrenceActivityQuantificationSubjectIdentity({
      occurrenceId: "occurrence-1",
      parentSubjectIdentity: planSubject,
    });
    const secondOccurrence = createPlanOccurrenceActivityQuantificationSubjectIdentity({
      occurrenceId: "occurrence-2",
      parentSubjectIdentity: planSubject,
    });
    const componentBundle = createActivityPlanPrescriptionQuantificationBundle({
      members: [
        prescriptionWithSubject(40, firstOccurrence),
        prescriptionWithSubject(41, secondOccurrence),
      ],
    });

    expect(componentBundle.summary).toMatchObject({
      lifecycle: "prescription",
      summaryScope: "components",
      subjectIdentity: { subjectType: "plan", planId: "plan-bundle" },
      commonLoad: { totalActivityCount: 2 },
    });
    expect(componentBundle.summary.duration.elapsed.totalCount).toBe(2);
    expect(getNormalizedIntensity(componentBundle.summary.commonLoad)).toBeCloseTo(0.8);
    const oneOccurrence = createActivityPlanPrescriptionQuantificationBundle({
      members: [prescriptionWithSubject(40, firstOccurrence)],
    });
    expect(oneOccurrence).toMatchObject({
      members: [{ subjectIdentity: { subjectType: "plan_occurrence" } }],
      summary: {
        summaryScope: "components",
        subjectIdentity: { subjectType: "plan", planId: "plan-bundle" },
      },
    });

    const collection = createPrescriptionQuantificationBundle({
      members: [
        prescriptionWithSubject(
          42,
          createPlanActivityQuantificationSubjectIdentity({ planId: "plan-a" }),
        ),
        prescriptionWithSubject(
          43,
          createPlanActivityQuantificationSubjectIdentity({ planId: "plan-b" }),
        ),
      ],
    });
    expect(collection.summary).toMatchObject({
      summaryScope: "collection",
      subjectIdentity: { subjectType: "collection", lifecycle: "prescription" },
      commonLoad: { totalActivityCount: 2 },
    });
    expect(activityPlanPrescriptionQuantificationBundleSchema.safeParse(collection).success).toBe(
      false,
    );

    const observationBundle = createObservationQuantificationBundle({
      members: [
        observationWithSubject(
          44,
          createCompletedActivityQuantificationSubjectIdentity({ activityId: "activity-a" }),
        ),
      ],
    });
    expect(observationBundle.summary.lifecycle).toBe("observation");
    expect(aggregateObservations(observationBundle.members)).toEqual(observationBundle.summary);

    expect(
      activityQuantificationBundleSchema.safeParse({
        members: componentBundle.members,
        summary: collection.summary,
      }).success,
    ).toBe(false);
  });

  it("rejects a standalone aggregate whose calculation identity disagrees with Common Load", () => {
    const first = quantification({ sequence: 50 });
    if (first.kind !== "prescription") throw new Error("Expected prescription fixture");
    const aggregate = aggregatePrescriptions([first]);
    const inconsistentCalculation = createActivityQuantificationCalculationIdentity({
      model: "different_common_load_model",
      version: aggregate.calculationIdentity.version,
      computedAt: aggregate.calculationIdentity.computedAt,
      calibrationEvidenceFingerprint: aggregate.calculationIdentity.calibrationEvidenceFingerprint,
      memberCalculationFingerprints: aggregate.calculationIdentity.memberCalculationFingerprints,
    });

    expect(
      aggregateActivityQuantificationSchema.safeParse({
        ...aggregate,
        calculationIdentity: inconsistentCalculation,
      }).success,
    ).toBe(false);
  });
});
