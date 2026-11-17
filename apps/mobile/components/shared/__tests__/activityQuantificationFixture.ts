import {
  type ActivityObservationQuantificationBundle,
  type ActivityPrescriptionQuantificationBundle,
  type ActivityQuantification,
  activityQuantificationSchema,
  commonLoadResultSchema,
  createActivityPlanPrescriptionQuantificationBundle,
  createActivityQuantificationCalculationIdentity,
  createActivityQuantificationEvidenceIdentity,
  createCompletedActivityQuantificationSubjectIdentity,
  createObservationQuantificationBundle,
  createPlanActivityQuantificationSubjectIdentity,
  createPlanOccurrenceActivityQuantificationSubjectIdentity,
} from "@repo/core";

type QuantificationFixtureOptions = {
  activityCategory?: "bike" | "run" | "strength";
  authoredRpe?: number;
  durationSeconds?: number;
  estimated?: boolean;
  id?: string;
  kind?: "observation" | "prescription";
  load?: number;
  status?: "available" | "partial" | "private" | "threshold_missing" | "unsupported";
};

const computedAsOf = "2026-07-21T12:00:00.000Z";

function resolvedCommonLoad(options: Required<QuantificationFixtureOptions>) {
  const activityCategory = options.activityCategory;
  if (
    options.status === "private" ||
    options.status === "threshold_missing" ||
    options.status === "unsupported"
  ) {
    return commonLoadResultSchema.parse({
      status: "unavailable",
      model: "gradientpeak_relative_load",
      version: "1",
      activity_category: activityCategory,
      method: options.status === "threshold_missing" ? "heart_rate_zones" : null,
      quality: null,
      thresholdEvidence: null,
      evidenceFingerprint: null,
      computedAsOf,
      contributingDurationSeconds:
        options.status === "threshold_missing" ? null : options.durationSeconds,
      reason:
        options.status === "private"
          ? "private_data"
          : options.status === "threshold_missing"
            ? "threshold_missing"
            : "unsupported_modality",
    });
  }
  if (activityCategory === "strength") {
    throw new Error("Strength fixtures require an unavailable quantification status");
  }

  const provenance = {
    model: "gradientpeak_relative_load" as const,
    version: "1" as const,
    activity_category: activityCategory,
    method:
      activityCategory === "bike" ? ("power_threshold" as const) : ("run_pace_threshold" as const),
    quality: {
      source: "validated_test" as const,
      observed_at: "2026-07-20T12:00:00.000Z",
      valid_at: "2026-07-20T12:00:00.000Z",
      confidence: "high" as const,
      stale: false,
      estimate: options.estimated,
      calculation_version: "threshold-v1",
      evidence_fingerprint: "quality-run",
    },
    thresholdEvidence:
      activityCategory === "bike"
        ? {
            type: "ftp_watts" as const,
            value: 250,
            unit: "watts" as const,
            source: "validated_test" as const,
            observedAt: "2026-07-20T12:00:00.000Z",
            validAt: "2026-07-20T12:00:00.000Z",
            freshness: "current" as const,
            calculationVersion: "threshold-v1",
            sourceFingerprint: "threshold-bike",
          }
        : {
            type: "threshold_speed_mps" as const,
            value: 4,
            unit: "meters_per_second" as const,
            source: "validated_test" as const,
            observedAt: "2026-07-20T12:00:00.000Z",
            validAt: "2026-07-20T12:00:00.000Z",
            freshness: "current" as const,
            calculationVersion: "threshold-v1",
            sourceFingerprint: "threshold-run",
          },
    evidenceFingerprint: "activity-run",
    computedAsOf,
  };

  if (options.status === "partial") {
    return commonLoadResultSchema.parse({
      status: "partial",
      ...provenance,
      load: options.load / 2,
      intensity: Math.sqrt(options.load / 2 / ((options.durationSeconds / 2 / 3_600) * 100)),
      contributingDurationSeconds: options.durationSeconds / 2,
      eligibleDurationSeconds: options.durationSeconds,
      sourceTimeCoverage: 0.5,
      reason: "activity_data_partial",
    });
  }

  return commonLoadResultSchema.parse({
    status: "available",
    ...provenance,
    load: options.load,
    contributingDurationSeconds: options.durationSeconds,
    intensity: Math.sqrt(options.load / ((options.durationSeconds / 3_600) * 100)),
    estimated: options.estimated,
  });
}

export function createActivityQuantificationFixture(
  input: QuantificationFixtureOptions = {},
): ActivityQuantification {
  const options: Required<QuantificationFixtureOptions> = {
    activityCategory: input.activityCategory ?? "run",
    authoredRpe: input.authoredRpe ?? 7,
    durationSeconds: input.durationSeconds ?? 3_600,
    estimated: input.estimated ?? true,
    id: input.id ?? "activity-quantification-fixture",
    kind: input.kind ?? "prescription",
    load: input.load ?? 64,
    status: input.status ?? "available",
  };
  const commonLoad = resolvedCommonLoad(options);
  const segmentId = `${options.id}-segment`;
  const evidenceRole = options.kind === "prescription" ? "prescribed" : "measured";
  const unavailableDurationReason =
    options.kind === "prescription" ? "not_prescribed" : "not_observed";
  const subjectIdentity =
    options.kind === "prescription"
      ? createPlanOccurrenceActivityQuantificationSubjectIdentity({
          occurrenceId: `${options.id}-occurrence`,
          parentSubjectIdentity: createPlanActivityQuantificationSubjectIdentity({
            planId: options.id,
          }),
        })
      : createCompletedActivityQuantificationSubjectIdentity({ activityId: options.id });
  const shared = {
    subjectIdentity,
    evidenceIdentity: createActivityQuantificationEvidenceIdentity({
      evidenceType: options.kind === "prescription" ? "plan_revision" : "segment_facts",
      sourceIds: options.kind === "prescription" ? [options.id] : [options.id, segmentId],
      revisionFingerprint: `${options.id}-revision`,
      details: {
        activityCategory: options.activityCategory,
        kind: options.kind,
        status: options.status,
      },
    }),
    calculationIdentity: createActivityQuantificationCalculationIdentity({
      model: commonLoad.model,
      version: commonLoad.version,
      computedAt: commonLoad.computedAsOf,
      calibrationEvidenceFingerprint: commonLoad.evidenceFingerprint,
    }),
    activity_category: options.activityCategory,
    duration: {
      elapsed: {
        status: "available" as const,
        evidenceRole,
        value: options.durationSeconds,
        unit: "seconds" as const,
      },
      active: {
        status: "available" as const,
        evidenceRole,
        value: options.durationSeconds,
        unit: "seconds" as const,
      },
      moving: {
        status: "unavailable" as const,
        evidenceRole,
        value: null,
        unit: "seconds" as const,
        reason: unavailableDurationReason,
      },
    },
    distance: {
      status: "unavailable" as const,
      evidenceRole,
      value: null,
      unit: "meters" as const,
      reason: unavailableDurationReason,
    },
    commonLoad,
  };
  const nativeIntensity = {
    status: "available" as const,
    evidenceRole,
    values: [
      {
        metric: "perceived_exertion" as const,
        unit: "rpe_0_10" as const,
        magnitude: { kind: "point" as const, value: options.authoredRpe },
      },
    ],
  };

  return activityQuantificationSchema.parse(
    options.kind === "prescription"
      ? {
          kind: "prescription",
          stage: "plan",
          ...shared,
          intensity: { prescribed: nativeIntensity },
        }
      : {
          kind: "observation",
          stage: "final",
          ...shared,
          intensity: { observed: nativeIntensity },
          completedProvenance: {
            activityId: options.id,
            segmentId,
            source: "unknown",
            artifactIdentity: null,
            providerIdentity: null,
            segmentRevision: null,
            observedAt: computedAsOf,
            computedAt: computedAsOf,
            calculationVersion: "mobile-quantification-fixture-v1",
          },
        },
  );
}

export function createPrescriptionQuantificationBundleFixture(
  input: Omit<QuantificationFixtureOptions, "kind"> = {},
): ActivityPrescriptionQuantificationBundle {
  const member = createActivityQuantificationFixture({ ...input, kind: "prescription" });
  if (member.kind !== "prescription") throw new Error("Expected prescription fixture");
  return createActivityPlanPrescriptionQuantificationBundle({ members: [member] });
}

export function createObservationQuantificationBundleFixture(
  input: Omit<QuantificationFixtureOptions, "kind"> = {},
): ActivityObservationQuantificationBundle {
  const member = createActivityQuantificationFixture({ ...input, kind: "observation" });
  if (member.kind !== "observation") throw new Error("Expected observation fixture");
  return createObservationQuantificationBundle({ members: [member] });
}
