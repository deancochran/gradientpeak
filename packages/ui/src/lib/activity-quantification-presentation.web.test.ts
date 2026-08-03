import {
  type ActivityPrescriptionQuantification,
  activityPrescriptionQuantificationSchema,
  createActivityPlanPrescriptionQuantificationBundle,
  createActivityQuantificationCalculationIdentity,
  createActivityQuantificationEvidenceIdentity,
  createPlanActivityQuantificationSubjectIdentity,
  createPlanOccurrenceActivityQuantificationSubjectIdentity,
} from "@repo/core/activity-quantification";
import { calculateAvailableCommonLoad, commonLoadResultSchema } from "@repo/core/load";
import { describe, expect, it } from "vitest";

import {
  formatActivityNativeIntensity,
  getActivityQuantificationPresentation,
} from "./activity-quantification-presentation";

const computedAsOf = "2026-07-31T12:00:00.000Z";

function commonLoad() {
  return calculateAvailableCommonLoad({
    activity_category: "bike",
    method: "power_threshold",
    quality: {
      source: "manual",
      observed_at: "2026-07-20T10:00:00.000Z",
      valid_at: "2026-07-20T10:00:00.000Z",
      confidence: "high",
      stale: false,
      estimate: true,
      calculation_version: "manual-threshold-v1",
      evidence_fingerprint: "quality-1",
    },
    thresholdEvidence: {
      type: "ftp_watts",
      value: 250,
      unit: "watts",
      source: "manual",
      observedAt: "2026-07-20T10:00:00.000Z",
      validAt: "2026-07-20T10:00:00.000Z",
      freshness: "current",
      calculationVersion: "manual-threshold-v1",
      sourceFingerprint: "ftp-1",
    },
    evidenceFingerprint: "plan-1",
    computedAsOf,
    estimated: true,
    contributingDurationSeconds: 3_600,
    intensity: 0.8,
  });
}

function unavailableCommonLoad() {
  return commonLoadResultSchema.parse({
    status: "unavailable",
    model: "gradientpeak_relative_load",
    version: "1",
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

function prescription(resolvedCommonLoad = commonLoad()): ActivityPrescriptionQuantification {
  return activityPrescriptionQuantificationSchema.parse({
    kind: "prescription",
    stage: "plan",
    subjectIdentity: createPlanOccurrenceActivityQuantificationSubjectIdentity({
      occurrenceId: "plan-1-occurrence",
      parentSubjectIdentity: createPlanActivityQuantificationSubjectIdentity({ planId: "plan-1" }),
    }),
    evidenceIdentity: createActivityQuantificationEvidenceIdentity({
      evidenceType: "plan_revision",
      sourceIds: ["plan-1"],
      revisionFingerprint: "plan-1-revision-1",
      details: { planId: "plan-1", revision: 1 },
    }),
    calculationIdentity: createActivityQuantificationCalculationIdentity({
      model: resolvedCommonLoad.model,
      version: resolvedCommonLoad.version,
      computedAt: resolvedCommonLoad.computedAsOf,
      calibrationEvidenceFingerprint: resolvedCommonLoad.evidenceFingerprint,
    }),
    activity_category: "bike",
    duration: {
      elapsed: {
        status: "available",
        evidenceRole: "prescribed",
        value: 3_600,
        unit: "seconds",
      },
      active: {
        status: "available",
        evidenceRole: "prescribed",
        value: 3_600,
        unit: "seconds",
      },
      moving: {
        status: "unavailable",
        evidenceRole: "prescribed",
        value: null,
        unit: "seconds",
        reason: "not_prescribed",
      },
    },
    distance: {
      status: "unavailable",
      evidenceRole: "prescribed",
      value: null,
      unit: "meters",
      reason: "not_prescribed",
    },
    intensity: {
      prescribed: {
        status: "available",
        evidenceRole: "prescribed",
        values: [
          {
            metric: "relative_threshold",
            reference: "ftp",
            unit: "percent",
            magnitude: { kind: "range", lower: 75, upper: 85 },
          },
        ],
      },
    },
    commonLoad: resolvedCommonLoad,
  });
}

describe("activity quantification presentation", () => {
  it("uses canonical labels and exposes bundle-derived, prescribed, and method evidence", () => {
    const result = getActivityQuantificationPresentation(
      createActivityPlanPrescriptionQuantificationBundle({ members: [prescription()] }),
    );

    expect(result.commonLoad).toMatchObject({
      label: "Common Load",
      value: "64",
      evidence: "Derived",
      method: "Power threshold",
    });
    expect(result.normalizedIntensity).toMatchObject({
      label: "Normalized intensity",
      value: "0.80",
      evidence: "Derived from Common Load",
    });
    expect(result.nativeIntensity).toMatchObject({
      label: "Prescribed intensity",
      value: "75–85% FTP",
      evidence: "Prescribed",
    });
  });

  it("preserves authored native intensity when Common Load and normalized intensity are unavailable", () => {
    const result = getActivityQuantificationPresentation(
      createActivityPlanPrescriptionQuantificationBundle({
        members: [prescription(unavailableCommonLoad())],
      }),
    );

    expect(result.commonLoad).toMatchObject({ status: "unavailable", value: "Unavailable" });
    expect(result.normalizedIntensity).toMatchObject({
      status: "unavailable",
      value: "Unavailable",
    });
    expect(result.nativeIntensity).toMatchObject({
      status: "available",
      value: "75–85% FTP",
    });
    expect(result.commonLoad.diagnostic?.summary).toContain("FTP is missing");

    const bundled = getActivityQuantificationPresentation(
      createActivityPlanPrescriptionQuantificationBundle({
        members: [prescription(unavailableCommonLoad())],
      }),
    );
    expect(bundled.commonLoad.unavailableReason).toBe("threshold_missing");
    expect(bundled.commonLoad.diagnostic?.summary).toContain("FTP is missing");
  });

  it("recovers prescribed native targets from aggregate members and labels aggregate values derived", () => {
    const member = prescription();
    const bundle = createActivityPlanPrescriptionQuantificationBundle({
      members: [member],
    });
    const result = getActivityQuantificationPresentation(bundle);

    expect(result.commonLoad.evidence).toBe("Derived");
    expect(result.normalizedIntensity.evidence).toBe("Derived from Common Load");
    expect(result.nativeIntensity).toMatchObject({
      evidence: "Prescribed",
      value: "75–85% FTP",
    });
    expect(getActivityQuantificationPresentation(bundle.summary).kind).toBe("unavailable");
  });

  it("formats native units without inventing a normalized ratio", () => {
    expect(
      formatActivityNativeIntensity({
        metric: "perceived_exertion",
        unit: "rpe_0_10",
        magnitude: { kind: "point", value: 7 },
      }),
    ).toBe("RPE 7/10");
    expect(
      formatActivityNativeIntensity({
        metric: "heart_rate",
        unit: "beats_per_minute",
        magnitude: { kind: "range", lower: 145, upper: 155 },
      }),
    ).toBe("145–155 bpm");
  });

  it("keeps invalid input unavailable rather than zero and emits no retired aliases", () => {
    const result = getActivityQuantificationPresentation({ status: "available", load: 0 });

    expect(result).toMatchObject({
      kind: "unavailable",
      commonLoad: { value: "Unavailable" },
      normalizedIntensity: { value: "Unavailable" },
    });
    expect(JSON.stringify(result)).not.toMatch(/tss|intensityFactor|category_load/i);
  });
});
