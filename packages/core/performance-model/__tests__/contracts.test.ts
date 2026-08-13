import { describe, expect, it } from "vitest";

import { prescribedActivityIntensitySchema } from "../../activity-quantification";
import { calculateSwimmingDurationPerformance } from "../../duration-performance";
import { SWIMMING_DURATION_PERFORMANCE_FIXTURE_V1 } from "../../duration-performance/__tests__/fixtures/duration-performance-v1";
import { resolvePrescriptionSpeedMetersPerSecond } from "../../plan/activity-plan-planning-estimate";
import { buildPerformanceModelSnapshotFixture } from "../../testing/performance-model";
import {
  athletePerformanceTargetFactsSchema,
  createUnavailableAthletePerformanceTargetFacts,
  getAvailablePerformanceTargetValue,
  performanceTargetEvidenceTimeSchema,
  projectAthletePerformanceTargetFacts,
} from "..";

const asOf = "2026-07-31T12:00:00.000Z";

describe("performance-model target contracts", () => {
  it("defaults unavailable and non-calibration target metadata compatibly", () => {
    const targets = createUnavailableAthletePerformanceTargetFacts(asOf, "athlete-1");
    expect(targets.cycling.planningThresholdPower).toMatchObject({
      evidenceCount: 0,
      trend: "unavailable",
    });
    expect(targets.heartRate.run.lthr).toMatchObject({
      evidenceCount: 0,
      trend: "unavailable",
    });
  });

  it("projects typed model values into their exact target slots", () => {
    const targets = projectAthletePerformanceTargetFacts(
      buildPerformanceModelSnapshotFixture({ asOf, athleteId: "athlete-1" }),
    );

    expect(targets.cycling.planningThresholdPower).toMatchObject({
      status: "available",
      unit: "watts",
      evidenceTime: {
        observedFrom: "2026-07-30T12:00:00.000Z",
        observedThrough: "2026-07-30T12:00:00.000Z",
        computedAt: asOf,
      },
    });
    if (targets.cycling.planningThresholdPower.status !== "unavailable") {
      expect(targets.cycling.planningThresholdPower.value).toBeCloseTo(247, 6);
    }
    expect(targets.running.planningThresholdPace.status).toBe("unavailable");
    expect(targets.swimming.css.status).toBe("unavailable");
  });

  it("keeps provisional and stale source-valid numeric thresholds usable", () => {
    const provisionalSnapshot = buildPerformanceModelSnapshotFixture({
      asOf,
      athleteId: "athlete-1",
    });
    const provisionalCalibration = provisionalSnapshot.calibrations[0];
    if (!provisionalCalibration) throw new Error("Expected bike calibration fixture");
    provisionalCalibration.selectionDiagnostics.selectionReason = "first_qualifying_evidence";
    const provisional = projectAthletePerformanceTargetFacts(provisionalSnapshot);

    expect(provisional.cycling.planningThresholdPower).toMatchObject({
      status: "available",
      calibrationState: "provisional",
      confidence: "low",
    });
    expect(
      getAvailablePerformanceTargetValue(provisional.cycling.planningThresholdPower),
    ).toBeCloseTo(247, 6);

    provisionalCalibration.expiresAt = asOf;
    const stale = projectAthletePerformanceTargetFacts(provisionalSnapshot);
    expect(stale.cycling.planningThresholdPower).toMatchObject({
      status: "available",
      calibrationState: "stale",
      reasons: ["stale_evidence"],
    });
    expect(getAvailablePerformanceTargetValue(stale.cycling.planningThresholdPower)).toBeCloseTo(
      247,
      6,
    );
  });

  it("keeps missing, malformed, and wrong-sport thresholds unusable", () => {
    const unavailable = createUnavailableAthletePerformanceTargetFacts(asOf, "athlete-1");
    expect(
      getAvailablePerformanceTargetValue(unavailable.cycling.planningThresholdPower),
    ).toBeNull();
    expect(getAvailablePerformanceTargetValue({ status: "partial", value: Number.NaN })).toBeNull();
    expect(getAvailablePerformanceTargetValue({ status: "available", value: -1 })).toBeNull();

    const wrongSport = buildPerformanceModelSnapshotFixture({ asOf, athleteId: "athlete-1" });
    const calibration = wrongSport.calibrations[0];
    if (!calibration) throw new Error("Expected bike calibration fixture");
    calibration.identity.activityCategory = "run";
    expect(
      projectAthletePerformanceTargetFacts(wrongSport).cycling.planningThresholdPower,
    ).toMatchObject({
      status: "unavailable",
      value: null,
    });
  });

  it("projects swimming CSS only from canonical protocol-backed model output", () => {
    const swimFixture = SWIMMING_DURATION_PERFORMANCE_FIXTURE_V1;
    const snapshot = buildPerformanceModelSnapshotFixture({
      asOf: swimFixture.input.assessmentAsOf,
      athleteId: swimFixture.input.athleteId,
    });
    snapshot.categories.swim = calculateSwimmingDurationPerformance(swimFixture.input);
    snapshot.calibrations.push({
      id: "swim-css-calibration",
      identity: { metricKey: "threshold_speed", activityCategory: "swim" },
      value: 100 / swimFixture.expected.cssSecondsPer100Meters,
      unit: "meters_per_second",
      effectiveAt:
        swimFixture.input.cssProtocols[0]?.recordedAt ?? swimFixture.input.assessmentAsOf,
      expiresAt: new Date(
        Date.parse(swimFixture.input.assessmentAsOf) + 90 * 86_400_000,
      ).toISOString(),
      policyVersion: "performance-calibration-v1",
      selectionDiagnostics: {
        selectedEvidenceIds: [swimFixture.input.cssProtocols[0]?.evidenceId ?? "css-evidence"],
        selectedActivityIds: ["swim-css-activity"],
        evidenceCount: 1,
        selectionReason: "complete_protocol",
        trend: "initial",
        tolerance: 0.03,
        policyVersion: "performance-calibration-v1",
      },
    });

    const targets = projectAthletePerformanceTargetFacts(snapshot);

    expect(targets.swimming.css).toMatchObject({
      status: "available",
      value: swimFixture.expected.cssSecondsPer100Meters,
      sourceEvidenceIds: [swimFixture.input.cssProtocols[0]?.evidenceId],
      evidenceCount: 1,
      trend: "initial",
      evidenceTime: {
        observedFrom: swimFixture.input.cssProtocols[0]?.recordedAt,
        observedThrough: swimFixture.input.cssProtocols[0]?.recordedAt,
        computedAt: swimFixture.input.assessmentAsOf,
      },
    });
    const prescribedIntensity = prescribedActivityIntensitySchema.parse({
      status: "available",
      evidenceRole: "prescribed",
      values: [
        {
          metric: "relative_threshold",
          reference: "css",
          unit: "percent",
          magnitude: { kind: "point", value: 100 },
        },
      ],
    });
    expect(
      resolvePrescriptionSpeedMetersPerSecond({
        activityCategory: "swim",
        prescribedIntensity,
        performanceTargets: targets,
      }),
    ).toEqual({
      status: "available",
      value: 100 / swimFixture.expected.cssSecondsPer100Meters,
      unit: "meters_per_second",
      source: "relative_category_calibration",
    });
    const withoutProtocol = calculateSwimmingDurationPerformance({
      ...swimFixture.input,
      cssProtocols: [],
    });
    snapshot.categories.swim = withoutProtocol;
    snapshot.calibrations = snapshot.calibrations.filter(
      ({ identity }) => identity.activityCategory !== "swim",
    );
    expect(projectAthletePerformanceTargetFacts(snapshot).swimming.css).toMatchObject({
      status: "unavailable",
      value: null,
      reasons: ["calibration_unavailable"],
    });
  });

  it("keeps observation bounds stable while a later as-of model gets a new computation instant", () => {
    const evidenceRecordedAt = "2026-07-29T09:30:00.000Z";
    const first = projectAthletePerformanceTargetFacts(
      buildPerformanceModelSnapshotFixture({
        asOf: "2026-07-30T12:00:00.000Z",
        athleteId: "athlete-1",
        evidenceRecordedAt,
      }),
    );
    const second = projectAthletePerformanceTargetFacts(
      buildPerformanceModelSnapshotFixture({
        asOf: "2026-07-31T12:00:00.000Z",
        athleteId: "athlete-1",
        evidenceRecordedAt,
      }),
    );

    expect(second.cycling.planningThresholdPower.evidenceTime).toEqual({
      observedFrom: evidenceRecordedAt,
      observedThrough: evidenceRecordedAt,
      computedAt: "2026-07-31T12:00:00.000Z",
    });
    expect(second.cycling.planningThresholdPower.evidenceTime.observedThrough).toBe(
      first.cycling.planningThresholdPower.evidenceTime.observedThrough,
    );
  });

  it("uses the immutable calibration effective instant instead of mutable raw effort times", () => {
    const snapshot = buildPerformanceModelSnapshotFixture({ asOf, athleteId: "athlete-1" });
    const curve = snapshot.categories.bike.maximalMeanPowerCurve;
    const threshold = snapshot.categories.bike.parameters.planningThresholdPower;
    if (curve.status === "unavailable" || threshold.status === "unavailable") {
      throw new Error("Expected available cycling evidence");
    }
    const supportingEvidenceIds = new Set(threshold.sourceEvidenceIds);
    const supportingPoints = curve.value.points.filter((point) =>
      supportingEvidenceIds.has(point.sourceEvidenceId),
    );
    supportingPoints.forEach((point, index) => {
      point.recordedAt = new Date(
        Date.parse("2026-07-28T08:00:00.000Z") + index * 3_600_000,
      ).toISOString();
    });
    const supportingTimes = supportingPoints
      .map((point) => point.recordedAt)
      .sort((left, right) => Date.parse(left) - Date.parse(right));

    const targets = projectAthletePerformanceTargetFacts(snapshot);

    expect(targets.cycling.planningThresholdPower.evidenceTime).toMatchObject({
      observedFrom: "2026-07-30T12:00:00.000Z",
      observedThrough: "2026-07-30T12:00:00.000Z",
      computedAt: asOf,
    });
    expect(supportingTimes[0]).not.toBe(supportingTimes.at(-1));
  });

  it("rejects partial, inverted, future, and non-strict evidence-time contracts", () => {
    expect(
      performanceTargetEvidenceTimeSchema.safeParse({
        observedFrom: "2026-07-30T00:00:00.000Z",
        observedThrough: null,
        computedAt: asOf,
      }).success,
    ).toBe(false);
    expect(
      performanceTargetEvidenceTimeSchema.safeParse({
        observedFrom: "2026-07-31T00:00:00.000Z",
        observedThrough: "2026-07-30T00:00:00.000Z",
        computedAt: asOf,
      }).success,
    ).toBe(false);
    expect(
      performanceTargetEvidenceTimeSchema.safeParse({
        observedFrom: "2026-07-31T13:00:00.000Z",
        observedThrough: "2026-07-31T13:00:00.000Z",
        computedAt: asOf,
      }).success,
    ).toBe(false);
    expect(
      performanceTargetEvidenceTimeSchema.safeParse({
        observedFrom: null,
        observedThrough: null,
        computedAt: asOf,
        refreshedAt: asOf,
      }).success,
    ).toBe(false);
  });

  it("rejects status and confidence combinations that claim unavailable evidence is usable", () => {
    const targets = createUnavailableAthletePerformanceTargetFacts(asOf, "athlete-1");
    const invalid = {
      ...targets,
      cycling: {
        planningThresholdPower: {
          ...targets.cycling.planningThresholdPower,
          status: "available",
          value: 250,
        },
      },
    };

    expect(athletePerformanceTargetFactsSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects target facts whose evidence IDs and observation bounds disagree", () => {
    const targets = createUnavailableAthletePerformanceTargetFacts(asOf, "athlete-1");
    const missingBounds = {
      ...targets,
      cycling: {
        planningThresholdPower: {
          ...targets.cycling.planningThresholdPower,
          sourceEvidenceIds: ["unbounded-evidence"],
        },
      },
    };
    const orphanedBounds = {
      ...targets,
      running: {
        planningThresholdPace: {
          ...targets.running.planningThresholdPace,
          evidenceTime: {
            observedFrom: "2026-07-30T12:00:00.000Z",
            observedThrough: "2026-07-30T12:00:00.000Z",
            computedAt: asOf,
          },
        },
      },
    };

    expect(athletePerformanceTargetFactsSchema.safeParse(missingBounds).success).toBe(false);
    expect(athletePerformanceTargetFactsSchema.safeParse(orphanedBounds).success).toBe(false);
  });

  it("rejects heart-rate facts placed in the wrong category or metric slot", () => {
    const targets = createUnavailableAthletePerformanceTargetFacts(asOf, "athlete-1");
    const invalid = {
      ...targets,
      heartRate: {
        ...targets.heartRate,
        bike: {
          ...targets.heartRate.bike,
          lthr: {
            ...targets.heartRate.bike.lthr,
            activityCategory: "run",
          },
        },
      },
    };

    expect(athletePerformanceTargetFactsSchema.safeParse(invalid).success).toBe(false);
  });
});
