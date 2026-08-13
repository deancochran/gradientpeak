import { describe, expect, it } from "vitest";
import {
  type CalibrationCandidate,
  type CalibrationIdentity,
  type CalibrationRecord,
  evaluateCalibrationEvidence,
  getCalibrationRegistryEntry,
  performanceCalibrationRegistry,
  selectCalibration,
} from "./index";

const identity = {
  metricKey: "threshold_power",
  activityCategory: "bike",
} as const satisfies CalibrationIdentity;

function candidate(id: string, day: number, value: number): CalibrationCandidate {
  return {
    id,
    activityId: `activity-${id}`,
    observedAt: `2026-01-${String(day).padStart(2, "0")}T12:00:00.000Z`,
    value,
    state: "candidate",
    invalidatedAt: null,
  };
}

function current(overrides: Partial<CalibrationRecord> = {}): CalibrationRecord {
  return {
    id: "current",
    identity,
    value: 250,
    unit: "watts",
    effectiveAt: "2025-10-01T12:00:00.000Z",
    expiresAt: "2026-01-20T12:00:00.000Z",
    policyVersion: "performance-calibration-v1",
    selectionDiagnostics: {
      selectedEvidenceIds: ["old-evidence"],
      selectedActivityIds: ["old-activity"],
      evidenceCount: 1,
      selectionReason: "independent_confirmation",
      trend: "initial",
      tolerance: 0.03,
      policyVersion: "performance-calibration-v1",
    },
    ...overrides,
  };
}

function provisionalCurrent(): CalibrationRecord {
  const confirmed = current();
  return {
    ...confirmed,
    selectionDiagnostics: {
      ...confirmed.selectionDiagnostics,
      selectionReason: "first_qualifying_evidence",
    },
  };
}

function evaluation(identityValue: CalibrationIdentity, value: number) {
  return {
    identity: identityValue,
    sourceAccepted: true,
    candidateValue: value,
    streamCoverage: 0.95,
    supportingOutputCoverage: 0.95,
    maximumGapSeconds: 5,
    selectedWindowSeconds: 1_800,
    outputCoefficientOfVariation: 0.1,
    supportingThresholdIdentity: identity,
    supportingThresholdValue: 250,
    thresholdLike: true,
    modelQualitySufficient: true,
    modelFailureReason: null,
    modelDiagnostics: null,
    completeCssProtocol: true,
    gradeCoverage: 0.95,
  };
}

describe("performance calibration registry and qualification", () => {
  it("enables only the five accepted metric/category target consumers", () => {
    expect(performanceCalibrationRegistry).toHaveLength(5);
    expect(
      getCalibrationRegistryEntry({ metricKey: "threshold_power", activityCategory: "run" }),
    ).toBeNull();
    expect(
      getCalibrationRegistryEntry({ metricKey: "threshold_speed", activityCategory: "swim" }),
    ).toMatchObject({
      canonicalUnit: "meters_per_second",
      productLabel: "CSS",
      calculationEntrypoint: "swim_css_400m_200m",
      initialSelectionPolicy: "confirmed_complete_protocol",
    });
  });

  it("enforces exact HR window quality boundaries and never accepts labels", () => {
    const heartRate = evaluation(
      { metricKey: "threshold_heart_rate", activityCategory: "bike" },
      170,
    );
    expect(evaluateCalibrationEvidence(heartRate)).toMatchObject({
      state: "candidate",
      value: 170,
    });
    expect(evaluateCalibrationEvidence({ ...heartRate, maximumGapSeconds: 5.001 })).toMatchObject({
      state: "rejected",
      reason: "stream_gap_exceeded",
    });
    expect(
      evaluateCalibrationEvidence({ ...heartRate, supportingThresholdValue: null }),
    ).toMatchObject({ state: "rejected", reason: "supporting_threshold_unavailable" });
    expect(
      evaluateCalibrationEvidence({
        ...heartRate,
        supportingThresholdIdentity: {
          metricKey: "threshold_speed",
          activityCategory: "run",
        },
      }),
    ).toMatchObject({ state: "rejected", reason: "supporting_threshold_unavailable" });
  });

  it("requires complete CSS protocol and run grade coverage", () => {
    expect(
      evaluateCalibrationEvidence({
        ...evaluation({ metricKey: "threshold_speed", activityCategory: "swim" }, 1.3),
        completeCssProtocol: false,
      }),
    ).toMatchObject({ state: "rejected", reason: "protocol_incomplete" });
    expect(
      evaluateCalibrationEvidence({
        ...evaluation({ metricKey: "threshold_speed", activityCategory: "run" }, 4),
        gradeCoverage: 0.949,
      }),
    ).toMatchObject({ state: "rejected", reason: "grade_coverage_insufficient" });
  });

  it("qualifies direct evidence independently for all five registered identities", () => {
    for (const entry of performanceCalibrationRegistry) {
      const value =
        entry.identity.metricKey === "threshold_power"
          ? 250
          : entry.identity.metricKey === "threshold_heart_rate"
            ? 170
            : entry.identity.activityCategory === "swim"
              ? 1.3
              : 4;
      const supportingThresholdIdentity =
        entry.identity.metricKey === "threshold_heart_rate"
          ? {
              metricKey:
                entry.identity.activityCategory === "bike"
                  ? ("threshold_power" as const)
                  : ("threshold_speed" as const),
              activityCategory: entry.identity.activityCategory,
            }
          : identity;
      const direct = {
        ...evaluation(entry.identity, value),
        supportingThresholdIdentity,
      };
      expect(evaluateCalibrationEvidence(direct)).toMatchObject({ state: "candidate", value });
      expect(evaluateCalibrationEvidence({ ...direct, sourceAccepted: false })).toMatchObject({
        state: "rejected",
        reason: "source_not_accepted",
      });
    }
  });
});

describe("performance calibration selection", () => {
  it("confirms the first complete CSS protocol while other first evidence stays provisional", () => {
    for (const [index, entry] of performanceCalibrationRegistry.entries()) {
      const value =
        entry.identity.metricKey === "threshold_power"
          ? 250
          : entry.identity.metricKey === "threshold_heart_rate"
            ? 170
            : entry.identity.activityCategory === "swim"
              ? 1.3
              : 4;
      const selected = selectCalibration({
        identity: entry.identity,
        asOf: "2026-01-02T12:00:00.000Z",
        candidates: [candidate(`first-${index}`, 1, value)],
        current: null,
        nextId: `next-${index}`,
      });
      expect(selected).toMatchObject(
        entry.initialSelectionPolicy === "confirmed_complete_protocol"
          ? {
              state: "confirmed",
              calibration: {
                value,
                selectionDiagnostics: { selectionReason: "complete_protocol" },
              },
            }
          : {
              state: "provisional",
              calibration: {
                value,
                selectionDiagnostics: { selectionReason: "first_qualifying_evidence" },
              },
            },
      );
      expect(
        selectCalibration({
          identity: entry.identity,
          asOf: "2026-01-02T12:00:00.000Z",
          candidates: [],
          current: null,
          nextId: `none-${index}`,
        }),
      ).toEqual({ state: "unavailable", reason: "no_qualifying_evidence" });
    }
  });

  it("uses late provisional evidence only in a later non-backdated current evaluation", () => {
    const provisional = current({
      effectiveAt: "2026-01-09T12:00:00.000Z",
      expiresAt: "2026-04-09T12:00:00.000Z",
      selectionDiagnostics: {
        ...provisionalCurrent().selectionDiagnostics,
        selectedEvidenceIds: ["current-evidence"],
        selectedActivityIds: ["activity-current-evidence"],
      },
    });

    expect(
      selectCalibration({
        identity,
        asOf: "2026-01-10T12:00:00.000Z",
        candidates: [candidate("late-evidence", 1, 250), candidate("current-evidence", 9, 251)],
        current: provisional,
        nextId: "confirmed-with-late",
      }),
    ).toMatchObject({
      state: "confirmed",
      calibration: {
        id: "confirmed-with-late",
        effectiveAt: "2026-01-09T12:00:00.000Z",
        selectionDiagnostics: {
          selectedEvidenceIds: ["late-evidence", "current-evidence"],
          selectionReason: "independent_confirmation",
        },
      },
    });
  });

  it("reports bike model history and fit quality before generic value range failures", () => {
    const power = evaluation(identity, 250);
    expect(
      evaluateCalibrationEvidence({
        ...power,
        candidateValue: null,
        modelQualitySufficient: false,
        modelFailureReason: "model_history_insufficient",
      }),
    ).toMatchObject({ state: "rejected", reason: "model_history_insufficient" });
    expect(
      evaluateCalibrationEvidence({
        ...power,
        candidateValue: null,
        modelQualitySufficient: false,
        modelFailureReason: "model_quality_insufficient",
      }),
    ).toMatchObject({ state: "rejected", reason: "model_quality_insufficient" });
  });

  it("confirms and increases only with separate-day mutually supported evidence", () => {
    const evidence = [candidate("a", 1, 260), candidate("b", 9, 262)];
    expect(
      selectCalibration({
        identity,
        asOf: "2026-01-10T12:00:00.000Z",
        candidates: evidence,
        current: provisionalCurrent(),
        nextId: "confirmed",
      }),
    ).toMatchObject({ state: "confirmed", calibration: { value: 261 } });
    expect(
      selectCalibration({
        identity,
        asOf: "2026-01-10T12:00:00.000Z",
        candidates: evidence,
        current: current(),
        nextId: "increase",
      }),
    ).toMatchObject({
      calibration: { value: 261, selectionDiagnostics: { selectionReason: "supported_increase" } },
    });
  });

  it("does not let one easy effort lower power and requires three supported decreases", () => {
    const easy = [candidate("easy", 15, 180)];
    expect(
      selectCalibration({
        identity,
        asOf: "2026-01-16T12:00:00.000Z",
        candidates: easy,
        current: current({ expiresAt: "2026-02-01T00:00:00.000Z" }),
        nextId: "unchanged",
      }),
    ).toMatchObject({ calibration: { id: "current", value: 250 } });
    const supported = [
      candidate("low-a", 1, 240),
      candidate("low-b", 15, 241),
      candidate("low-c", 29, 239),
    ];
    expect(
      selectCalibration({
        identity,
        asOf: "2026-01-30T12:00:00.000Z",
        candidates: supported,
        current: current({ expiresAt: "2026-02-01T00:00:00.000Z" }),
        nextId: "decrease",
      }),
    ).toMatchObject({
      calibration: { value: 240, selectionDiagnostics: { selectionReason: "supported_decrease" } },
    });
  });

  it("never moves an active supported identity from one later activity", () => {
    for (const [index, entry] of performanceCalibrationRegistry.entries()) {
      const value =
        entry.identity.metricKey === "threshold_power"
          ? 250
          : entry.identity.metricKey === "threshold_heart_rate"
            ? 160
            : entry.identity.activityCategory === "swim"
              ? 1.3
              : 4;
      const unit = entry.canonicalUnit;
      const active = current({
        id: `active-${index}`,
        identity: entry.identity,
        value,
        unit,
        effectiveAt: "2026-01-01T12:00:00.000Z",
        expiresAt: "2026-04-01T12:00:00.000Z",
      });
      const changedValue =
        entry.identity.metricKey === "threshold_heart_rate" ? value + 10 : value * 1.05;
      expect(
        selectCalibration({
          identity: entry.identity,
          asOf: "2026-01-16T12:00:00.000Z",
          candidates: [candidate(`single-${index}`, 15, changedValue)],
          current: active,
          nextId: `must-not-move-${index}`,
        }),
      ).toMatchObject({ calibration: { id: `active-${index}`, value } });
    }
  });

  it("updates run speed and both sport-specific HR identities only with separate-day support", () => {
    const runSpeed = {
      metricKey: "threshold_speed",
      activityCategory: "run",
    } as const satisfies CalibrationIdentity;
    expect(
      selectCalibration({
        identity: runSpeed,
        asOf: "2026-01-10T12:00:00.000Z",
        candidates: [candidate("run-a", 1, 4.2), candidate("run-b", 9, 4.22)],
        current: current({
          identity: runSpeed,
          value: 4,
          unit: "meters_per_second",
          effectiveAt: "2026-01-01T00:00:00.000Z",
          expiresAt: "2026-04-01T00:00:00.000Z",
        }),
        nextId: "run-supported",
      }),
    ).toMatchObject({
      calibration: {
        id: "run-supported",
        selectionDiagnostics: { selectionReason: "supported_increase" },
      },
    });

    for (const sport of ["bike", "run"] as const) {
      const hrIdentity = {
        metricKey: "threshold_heart_rate",
        activityCategory: sport,
      } as const satisfies CalibrationIdentity;
      expect(
        selectCalibration({
          identity: hrIdentity,
          asOf: "2026-01-30T12:00:00.000Z",
          candidates: [
            candidate(`${sport}-hr-a`, 1, 170),
            candidate(`${sport}-hr-b`, 15, 171),
            candidate(`${sport}-hr-c`, 29, 172),
          ],
          current: current({
            identity: hrIdentity,
            value: 160,
            unit: "beats_per_minute",
            effectiveAt: "2026-01-01T00:00:00.000Z",
            expiresAt: "2026-04-01T00:00:00.000Z",
          }),
          nextId: `${sport}-hr-supported`,
        }),
      ).toMatchObject({
        calibration: {
          id: `${sport}-hr-supported`,
          selectionDiagnostics: { selectionReason: "supported_increase" },
        },
      });
    }
  });

  it("refreshes confirmed freshness only with independent support and ignores pre-selection lows", () => {
    const supporting = [candidate("support-a", 1, 250), candidate("support-b", 9, 251)];
    expect(
      selectCalibration({
        identity,
        asOf: "2026-01-10T12:00:00.000Z",
        candidates: supporting,
        current: current({ effectiveAt: "2026-01-01T12:00:00.000Z" }),
        nextId: "refreshed",
      }),
    ).toMatchObject({
      calibration: {
        id: "refreshed",
        value: 250,
        effectiveAt: "2026-01-09T12:00:00.000Z",
        selectionDiagnostics: { selectionReason: "unchanged" },
      },
    });

    expect(
      selectCalibration({
        identity,
        asOf: "2026-01-30T12:00:00.000Z",
        candidates: [
          candidate("old-low-a", 1, 230),
          candidate("old-low-b", 15, 231),
          candidate("old-low-c", 29, 229),
        ],
        current: current({
          effectiveAt: "2026-01-30T12:00:00.000Z",
          expiresAt: "2026-04-30T12:00:00.000Z",
        }),
        nextId: "must-not-decrease",
      }),
    ).toMatchObject({ calibration: { id: "current", value: 250 } });
  });

  it("reopens stale calibration provisionally from one new qualifying observation", () => {
    expect(
      selectCalibration({
        identity,
        asOf: "2026-01-25T12:00:00.000Z",
        candidates: [candidate("new", 25, 255)],
        current: current({
          effectiveAt: "2026-01-20T12:00:00.000Z",
          expiresAt: "2026-01-20T12:00:00.000Z",
        }),
        nextId: "reopened",
      }),
    ).toMatchObject({ state: "provisional", calibration: { id: "reopened", value: 255 } });
  });

  it("deterministically bounds long history instead of failing future ingestion", () => {
    const history = Array.from({ length: 200 }, (_, index) => ({
      id: `evidence-${String(index).padStart(3, "0")}`,
      activityId: `activity-${index}`,
      observedAt: new Date(Date.UTC(2025, 0, index + 1, 12)).toISOString(),
      value: 250,
      state: "candidate" as const,
      invalidatedAt: null,
    }));

    expect(() =>
      selectCalibration({
        identity,
        asOf: "2026-01-01T12:00:00.000Z",
        candidates: history,
        current: null,
        nextId: "bounded",
      }),
    ).not.toThrow();
    expect(
      selectCalibration({
        identity,
        asOf: "2026-01-01T12:00:00.000Z",
        candidates: history,
        current: null,
        nextId: "bounded",
      }),
    ).toMatchObject({ calibration: { id: "bounded", value: 250 } });
  });

  it("uses the HR median rather than maximum and becomes stale at expiry", () => {
    const hrIdentity = {
      metricKey: "threshold_heart_rate",
      activityCategory: "run",
    } as const;
    const hrCurrent = current({
      identity: hrIdentity,
      value: 160,
      unit: "beats_per_minute",
      expiresAt: "2026-02-20T12:00:00.000Z",
    });
    const result = selectCalibration({
      identity: hrIdentity,
      asOf: "2026-01-30T12:00:00.000Z",
      candidates: [
        candidate("hr-a", 1, 165),
        candidate("hr-b", 15, 166),
        candidate("hr-c", 29, 167),
      ],
      current: hrCurrent,
      nextId: "hr-change",
    });
    expect(result).toMatchObject({ calibration: { value: 166 } });
    expect(
      selectCalibration({
        identity,
        asOf: "2026-01-20T12:00:00.000Z",
        candidates: [],
        current: current(),
        nextId: "stale",
      }),
    ).toMatchObject({
      state: "stale",
      calibration: { id: "current", expiresAt: "2026-01-20T12:00:00.000Z" },
    });
  });
});
