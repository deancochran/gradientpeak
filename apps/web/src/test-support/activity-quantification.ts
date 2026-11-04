import {
  type ActivityQuantification,
  activityQuantificationSchema,
  calculateAvailableCommonLoad,
  commonLoadResultSchema,
  createActivityPlanPrescriptionQuantificationBundle,
  createActivityQuantificationCalculationIdentity,
  createActivityQuantificationEvidenceIdentity,
  createCompletedActivityQuantificationSubjectIdentity,
  createObservationQuantificationBundle,
  createPlanActivityQuantificationSubjectIdentity,
  createPlanOccurrenceActivityQuantificationSubjectIdentity,
  createPrescriptionQuantificationBundle,
} from "@repo/core";

type FixtureOptions = {
  activityCategory?: "bike" | "run";
  distanceMeters?: number | null;
  durationSeconds?: number;
  id?: string;
  kind?: "observation" | "prescription";
  load?: number | null;
  method?: "heart_rate_zones" | "power_threshold" | "run_pace_threshold";
  nativeIntensity?: number | null;
  unavailableReason?: "threshold_missing" | "unsupported_modality";
};

const computedAsOf = "2026-07-21T12:00:00.000Z";

function fixtureCommonLoad(options: Required<FixtureOptions>) {
  if (options.load === null) {
    return commonLoadResultSchema.parse({
      status: "unavailable",
      model: "gradientpeak_relative_load",
      version: "1",
      activity_category: options.activityCategory,
      method: options.method,
      quality: null,
      thresholdEvidence: null,
      evidenceFingerprint: null,
      computedAsOf,
      contributingDurationSeconds: options.durationSeconds,
      reason: options.unavailableReason,
    });
  }
  const durationHours = options.durationSeconds / 3_600;
  const intensity = Math.sqrt(options.load / (durationHours * 100));
  const thresholdEvidence =
    options.activityCategory === "bike"
      ? {
          type: "ftp_watts" as const,
          value: 250,
          unit: "watts" as const,
          source: "validated_test" as const,
          observedAt: "2026-07-20T12:00:00.000Z",
          validAt: "2026-07-20T12:00:00.000Z",
          freshness: "current" as const,
          calculationVersion: "fixture-v1",
          sourceFingerprint: `threshold-${options.id}`,
        }
      : {
          type: "threshold_speed_mps" as const,
          value: 4,
          unit: "meters_per_second" as const,
          source: "validated_test" as const,
          observedAt: "2026-07-20T12:00:00.000Z",
          validAt: "2026-07-20T12:00:00.000Z",
          freshness: "current" as const,
          calculationVersion: "fixture-v1",
          sourceFingerprint: `threshold-${options.id}`,
        };
  return calculateAvailableCommonLoad({
    activity_category: options.activityCategory,
    method: options.method,
    quality: {
      source: "validated_test",
      observed_at: "2026-07-20T12:00:00.000Z",
      valid_at: "2026-07-20T12:00:00.000Z",
      confidence: "high",
      stale: false,
      estimate: options.kind === "prescription",
      calculation_version: "fixture-v1",
      evidence_fingerprint: `quality-${options.id}`,
    },
    thresholdEvidence,
    evidenceFingerprint: `evidence-${options.id}`,
    computedAsOf,
    estimated: options.kind === "prescription",
    contributingDurationSeconds: options.durationSeconds,
    intensity,
  });
}

export function createActivityQuantificationFixture(
  input: FixtureOptions = {},
): ActivityQuantification {
  const options: Required<FixtureOptions> = {
    activityCategory: input.activityCategory ?? "bike",
    distanceMeters: input.distanceMeters ?? null,
    durationSeconds: input.durationSeconds ?? 3_600,
    id: input.id ?? "fixture-1",
    kind: input.kind ?? "prescription",
    load: input.load === undefined ? 100 : input.load,
    method:
      input.method ?? (input.activityCategory === "run" ? "run_pace_threshold" : "power_threshold"),
    nativeIntensity: input.nativeIntensity === undefined ? 100 : input.nativeIntensity,
    unavailableReason: input.unavailableReason ?? "threshold_missing",
  };
  const commonLoad = fixtureCommonLoad(options);
  const segmentId = `${options.id}-segment`;
  const evidenceRole = options.kind === "prescription" ? "prescribed" : "measured";
  const unavailableReason = options.kind === "prescription" ? "not_prescribed" : "not_observed";
  const subjectIdentity =
    options.kind === "prescription"
      ? createPlanOccurrenceActivityQuantificationSubjectIdentity({
          occurrenceId: `${options.id}-occurrence`,
          parentSubjectIdentity: createPlanActivityQuantificationSubjectIdentity({
            planId: options.id,
          }),
        })
      : createCompletedActivityQuantificationSubjectIdentity({ activityId: options.id });
  const evidenceIdentity = createActivityQuantificationEvidenceIdentity({
    evidenceType: options.kind === "prescription" ? "plan_revision" : "segment_facts",
    sourceIds: options.kind === "prescription" ? [options.id] : [options.id, segmentId],
    revisionFingerprint: `${options.id}-revision`,
    details: { id: options.id, kind: options.kind },
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
        reason: unavailableReason,
      },
    },
    distance:
      options.distanceMeters === null
        ? {
            status: "unavailable" as const,
            evidenceRole,
            value: null,
            unit: "meters" as const,
            reason: unavailableReason,
          }
        : {
            status: "available" as const,
            evidenceRole,
            value: options.distanceMeters,
            unit: "meters" as const,
          },
    commonLoad,
  };
  const nativeIntensity =
    options.nativeIntensity === null
      ? {
          status: "unavailable" as const,
          evidenceRole,
          values: [],
          reason: unavailableReason,
        }
      : {
          status: "available" as const,
          evidenceRole,
          values: [
            {
              metric: "relative_threshold" as const,
              reference: "ftp" as const,
              unit: "percent" as const,
              magnitude: { kind: "point" as const, value: options.nativeIntensity },
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
            calculationVersion: "web-quantification-fixture-v1",
          },
        },
  );
}

export function createActivityQuantificationBundle(input: FixtureOptions = {}) {
  const member = createActivityQuantificationFixture(input);
  return member.kind === "prescription"
    ? createActivityPlanPrescriptionQuantificationBundle({ members: [member] })
    : createObservationQuantificationBundle({ members: [member] });
}

export function createPrescriptionQuantificationBundleFixture(inputs: FixtureOptions[]) {
  const members = inputs.map((input) => {
    const member = createActivityQuantificationFixture({ ...input, kind: "prescription" });
    if (member.kind !== "prescription") throw new Error("Expected prescription fixture");
    return member;
  });
  return createPrescriptionQuantificationBundle({ members });
}
