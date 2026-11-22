import { describe, expect, it } from "vitest";

import {
  deriveThresholdFreshness,
  resolveThresholdLifecycle as resolveThresholdLifecycleWithMetric,
  selectThresholdCandidate as selectThresholdCandidateWithMetric,
  THRESHOLD_PLAUSIBILITY_VERSION,
  THRESHOLD_POLICY_SCHEMA_VERSION,
  THRESHOLD_POLICY_VERSION,
  type ThresholdCandidate,
  type ThresholdEvidence,
  thresholdActivityCategoryPolicies,
  thresholdActivityCategoryPolicySchema,
} from "./index";

function selectThresholdCandidate(
  input: Omit<Parameters<typeof selectThresholdCandidateWithMetric>[0], "metric">,
) {
  return selectThresholdCandidateWithMetric({ ...input, metric: "power" });
}

function resolveThresholdLifecycle(
  input: Omit<Parameters<typeof resolveThresholdLifecycleWithMetric>[0], "metric">,
) {
  return resolveThresholdLifecycleWithMetric({ ...input, metric: "power" });
}

function evidence(
  candidate: ThresholdCandidate,
  evidenceId: string,
  day: number,
  value = candidate.value,
): ThresholdEvidence {
  return {
    ...candidate,
    value,
    evidenceId,
    activityId: `activity-${evidenceId}`,
    observedAt: `2026-01-${String(day).padStart(2, "0")}T12:00:00.000Z`,
  };
}

function qualifiedBike(): ThresholdCandidate {
  const result = selectThresholdCandidate({
    activityCategory: "bike",
    observations: [
      {
        evidenceId: "qualified-bike-evidence",
        activityId: "qualified-bike-activity",
        seriesId: "qualified-bike-power",
        metric: "power",
        sourceAccepted: true,
        ownershipVerified: true,
        availability: "available",
        durationSeconds: 1_800,
        value: 250 / 0.95,
        startTimestampSeconds: 0,
        endTimestampSeconds: 1_800,
        windowCoverage: 1,
        maximumGapSeconds: 2,
      },
    ],
  });
  if (result.status !== "qualified") throw new Error(`Unexpected ${result.reason}`);
  return result.candidate;
}

describe("threshold activity-category policy and exact-window qualification", () => {
  it("publishes the exact versioned activity-category configuration", () => {
    expect(thresholdActivityCategoryPolicies).toHaveLength(6);
    expect(thresholdActivityCategoryPolicies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          activityCategory: "bike",
          method: "bike_power_30m",
          seriesSelection: { preferred: "power", fallback: null },
          exactWindowSeconds: 1_800,
          conversionFactor: 0.95,
          requiredWindowCoverage: 0.95,
          maximumGapSeconds: 10,
        }),
        expect.objectContaining({
          activityCategory: "run",
          method: "run_speed_30m",
          seriesSelection: { preferred: "grade_adjusted_speed", fallback: "speed" },
          exactWindowSeconds: 1_800,
          conversionFactor: 1,
          requiredWindowCoverage: 0.95,
          maximumGapSeconds: 10,
        }),
        expect.objectContaining({
          activityCategory: "swim",
          method: "swim_speed_15m",
          seriesSelection: { preferred: "speed", fallback: null },
          exactWindowSeconds: 900,
          conversionFactor: 1,
          requiredWindowCoverage: 0.95,
          maximumGapSeconds: 10,
        }),
        ...(["bike", "run", "swim"] as const).map((activityCategory) =>
          expect.objectContaining({
            activityCategory,
            metric: "lthr",
            unit: "bpm",
            method: "lthr_30m_final_20m",
            seriesSelection: { preferred: "heart_rate", fallback: null },
            exactWindowSeconds: 1_200,
            conversionFactor: 1,
          }),
        ),
      ]),
    );
    expect(
      thresholdActivityCategoryPolicies.every(
        ({ schemaVersion, policyVersion, plausibilityVersion }) =>
          schemaVersion === THRESHOLD_POLICY_SCHEMA_VERSION &&
          policyVersion === THRESHOLD_POLICY_VERSION &&
          plausibilityVersion === THRESHOLD_PLAUSIBILITY_VERSION,
      ),
    ).toBe(true);
  });

  it("accepts only finite required coverage from 90% through 100%", () => {
    const policy = thresholdActivityCategoryPolicies[0];
    if (policy === undefined) throw new Error("Expected a threshold policy fixture");

    for (const requiredWindowCoverage of [0.9, 0.95, 1]) {
      expect(
        thresholdActivityCategoryPolicySchema.safeParse({
          ...policy,
          requiredWindowCoverage,
        }).success,
      ).toBe(true);
    }
    for (const requiredWindowCoverage of [0.899_999, 1.000_001, Number.POSITIVE_INFINITY]) {
      expect(
        thresholdActivityCategoryPolicySchema.safeParse({
          ...policy,
          requiredWindowCoverage,
        }).success,
      ).toBe(false);
    }
  });
});

describe("threshold lifecycle and derived freshness", () => {
  const candidate = qualifiedBike();

  it("makes the first candidate provisional and independent consistent evidence confirms it", () => {
    expect(
      resolveThresholdLifecycle({
        activityCategory: "bike",
        asOf: "2026-01-02T12:00:00.000Z",
        evidence: [evidence(candidate, "first", 1, 250)],
      }),
    ).toMatchObject({
      status: "available",
      state: "provisional",
      decision: "first_qualified_candidate",
      threshold: { value: 250 },
    });
    expect(
      resolveThresholdLifecycle({
        activityCategory: "bike",
        asOf: "2026-01-10T12:00:00.000Z",
        evidence: [evidence(candidate, "first", 1, 250), evidence(candidate, "second", 8, 252)],
      }),
    ).toMatchObject({
      status: "available",
      state: "confirmed",
      decision: "independent_confirmation",
      threshold: { value: 251, effectiveAt: "2026-01-08T12:00:00.000Z" },
    });
  });

  it("fails closed on duplicate evidence identity or same-activity contribution in either order", () => {
    const first = evidence(candidate, "immutable-id", 1, 250);
    const conflictingIdentity = {
      ...evidence(candidate, "other", 2, 265),
      evidenceId: first.evidenceId,
    };
    for (const duplicateIdentity of [
      [first, conflictingIdentity],
      [conflictingIdentity, first],
    ]) {
      expect(() =>
        resolveThresholdLifecycle({
          activityCategory: "bike",
          asOf: "2026-01-10T12:00:00.000Z",
          evidence: duplicateIdentity,
        }),
      ).toThrow("Threshold lifecycle evidence IDs must be unique");
    }

    const conflictingActivity = {
      ...evidence(candidate, "other-id", 2, 265),
      activityId: first.activityId,
    };
    for (const duplicateActivity of [
      [first, conflictingActivity],
      [conflictingActivity, first],
    ]) {
      expect(() =>
        resolveThresholdLifecycle({
          activityCategory: "bike",
          asOf: "2026-01-10T12:00:00.000Z",
          evidence: duplicateActivity,
        }),
      ).toThrow("Threshold lifecycle activity IDs must be unique");
    }
  });

  it("uses stable evidence identity to break tied observation times independent of import order", () => {
    const low = evidence(candidate, "a-low", 8, 250);
    const high = evidence(candidate, "z-high", 8, 265);
    const forward = resolveThresholdLifecycle({
      activityCategory: "bike",
      asOf: "2026-01-10T12:00:00.000Z",
      evidence: [low, high],
    });
    const reversed = resolveThresholdLifecycle({
      activityCategory: "bike",
      asOf: "2026-01-10T12:00:00.000Z",
      evidence: [high, low],
    });
    expect(reversed).toEqual(forward);
    expect(forward).toMatchObject({
      state: "provisional",
      decision: "material_increase",
      threshold: { value: 265, selectedEvidenceIds: ["z-high"] },
    });
  });

  it("handles exact and just-over 3% confirmation boundaries symmetrically", () => {
    for (const [firstValue, secondValue] of [
      [100, 103],
      [103, 100],
    ] as const) {
      const history = [
        evidence(candidate, "first", 1, firstValue),
        evidence(candidate, "second", 8, secondValue),
      ];
      const selected = resolveThresholdLifecycle({
        activityCategory: "bike",
        asOf: "2026-01-10T12:00:00.000Z",
        evidence: history,
      });
      expect(
        resolveThresholdLifecycle({
          activityCategory: "bike",
          asOf: "2026-01-10T12:00:00.000Z",
          evidence: [...history].reverse(),
        }),
      ).toEqual(selected);
      expect(selected).toMatchObject({
        state: "confirmed",
        decision: "independent_confirmation",
        threshold: { value: 101.5 },
      });
    }

    for (const [firstValue, secondValue] of [
      [100, 103.000_000_001],
      [103.000_000_001, 100],
    ] as const) {
      const history = [
        evidence(candidate, "first", 1, firstValue),
        evidence(candidate, "second", 8, secondValue),
      ];
      const selected = resolveThresholdLifecycle({
        activityCategory: "bike",
        asOf: "2026-01-10T12:00:00.000Z",
        evidence: history,
      });
      expect(
        resolveThresholdLifecycle({
          activityCategory: "bike",
          asOf: "2026-01-10T12:00:00.000Z",
          evidence: [...history].reverse(),
        }),
      ).toEqual(selected);
      expect(selected).toMatchObject({ state: "provisional" });
    }
  });

  it("publishes a material increase and retains small noise", () => {
    const baseline = [evidence(candidate, "first", 1, 250), evidence(candidate, "second", 8, 250)];
    expect(
      resolveThresholdLifecycle({
        activityCategory: "bike",
        asOf: "2026-01-20T12:00:00.000Z",
        evidence: [...baseline, evidence(candidate, "increase", 15, 265)],
      }),
    ).toMatchObject({
      decision: "material_increase",
      threshold: { value: 265, effectiveAt: "2026-01-15T12:00:00.000Z" },
    });
    expect(
      resolveThresholdLifecycle({
        activityCategory: "bike",
        asOf: "2026-01-20T12:00:00.000Z",
        evidence: [...baseline, evidence(candidate, "noise", 15, 252)],
      }),
    ).toMatchObject({
      decision: "retained_noise",
      threshold: { value: 250, effectiveAt: "2026-01-08T12:00:00.000Z" },
    });
  });

  it("publishes exact 3% increases and repeated exact 3% decreases", () => {
    const baseline = [evidence(candidate, "first", 1, 100), evidence(candidate, "second", 2, 100)];
    expect(
      resolveThresholdLifecycle({
        activityCategory: "bike",
        asOf: "2026-01-10T12:00:00.000Z",
        evidence: [...baseline, evidence(candidate, "exact-increase", 3, 103)],
      }),
    ).toMatchObject({
      state: "confirmed",
      decision: "material_increase",
      threshold: { value: 103 },
    });
    expect(
      resolveThresholdLifecycle({
        activityCategory: "bike",
        asOf: "2026-01-10T12:00:00.000Z",
        evidence: [
          ...baseline,
          evidence(candidate, "exact-decrease-one", 3, 97),
          evidence(candidate, "exact-decrease-two", 4, 97),
        ],
      }),
    ).toMatchObject({
      state: "confirmed",
      decision: "supported_decrease",
      threshold: { value: 97 },
    });
  });

  it("retains one decrease and updates only after repeated independent consistent decreases", () => {
    const baseline = [evidence(candidate, "first", 1, 250), evidence(candidate, "second", 8, 250)];
    expect(
      resolveThresholdLifecycle({
        activityCategory: "bike",
        asOf: "2026-01-20T12:00:00.000Z",
        evidence: [...baseline, evidence(candidate, "low-one", 15, 230)],
      }),
    ).toMatchObject({ decision: "retained_single_decrease", threshold: { value: 250 } });
    expect(
      resolveThresholdLifecycle({
        activityCategory: "bike",
        asOf: "2026-01-25T12:00:00.000Z",
        evidence: [
          ...baseline,
          evidence(candidate, "low-one", 15, 230),
          evidence(candidate, "low-two", 22, 232),
        ],
      }),
    ).toMatchObject({
      state: "confirmed",
      decision: "supported_decrease",
      threshold: { value: 231, effectiveAt: "2026-01-22T12:00:00.000Z" },
    });
  });

  it("uses symmetric exact 3% spread for repeated decreases in either chronological order", () => {
    const baseline = [evidence(candidate, "first", 1, 100), evidence(candidate, "second", 2, 100)];
    for (const [firstLow, secondLow] of [
      [90, 92.7],
      [92.7, 90],
    ] as const) {
      const history = [
        ...baseline,
        evidence(candidate, "low-one", 3, firstLow),
        evidence(candidate, "low-two", 4, secondLow),
      ];
      const selected = resolveThresholdLifecycle({
        activityCategory: "bike",
        asOf: "2026-01-10T12:00:00.000Z",
        evidence: history,
      });
      expect(
        resolveThresholdLifecycle({
          activityCategory: "bike",
          asOf: "2026-01-10T12:00:00.000Z",
          evidence: [...history].reverse(),
        }),
      ).toEqual(selected);
      expect(selected).toMatchObject({
        state: "confirmed",
        decision: "supported_decrease",
        threshold: { value: 91.35 },
      });
    }

    for (const [firstLow, secondLow] of [
      [90, 92.700_000_001],
      [92.700_000_001, 90],
    ] as const) {
      const history = [
        ...baseline,
        evidence(candidate, "low-one", 3, firstLow),
        evidence(candidate, "low-two", 4, secondLow),
      ];
      const selected = resolveThresholdLifecycle({
        activityCategory: "bike",
        asOf: "2026-01-10T12:00:00.000Z",
        evidence: history,
      });
      expect(
        resolveThresholdLifecycle({
          activityCategory: "bike",
          asOf: "2026-01-10T12:00:00.000Z",
          evidence: [...history].reverse(),
        }),
      ).toEqual(selected);
      expect(selected).toMatchObject({
        state: "confirmed",
        decision: "retained_single_decrease",
        threshold: { value: 100 },
      });
    }
  });

  it("is import-order independent and excludes future evidence at an earlier as-of", () => {
    const chronological = [
      evidence(candidate, "first", 1, 250),
      evidence(candidate, "second", 8, 250),
      evidence(candidate, "future", 22, 280),
    ];
    const expected = resolveThresholdLifecycle({
      activityCategory: "bike",
      asOf: "2026-01-10T12:00:00.000Z",
      evidence: chronological,
    });
    expect(
      resolveThresholdLifecycle({
        activityCategory: "bike",
        asOf: "2026-01-10T12:00:00.000Z",
        evidence: [chronological[2], chronological[0], chronological[1]].filter(
          (item): item is ThresholdEvidence => item !== undefined,
        ),
      }),
    ).toEqual(expected);
    expect(expected).toMatchObject({ threshold: { value: 250 } });
  });

  it("derives freshness from asOf, effectiveAt, and method policy without storing expiry", () => {
    const selected = resolveThresholdLifecycle({
      activityCategory: "bike",
      asOf: "2026-01-10T12:00:00.000Z",
      evidence: [evidence(candidate, "first", 1, 250), evidence(candidate, "second", 8, 250)],
    });
    if (selected.status !== "available") throw new Error("Expected a threshold");
    expect("expiresAt" in selected.threshold).toBe(false);
    expect(
      deriveThresholdFreshness({
        threshold: selected.threshold,
        asOf: "2026-04-07T12:00:00.000Z",
      }),
    ).toMatchObject({ status: "fresh", ageSeconds: 89 * 86_400 });
    expect(
      deriveThresholdFreshness({
        threshold: selected.threshold,
        asOf: "2026-04-08T12:00:00.000Z",
      }),
    ).toMatchObject({ status: "stale", ageSeconds: 90 * 86_400 });
  });
});
