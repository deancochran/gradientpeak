import { describe, expect, it } from "vitest";

import {
  advanceThresholdLifecycle,
  resolveThresholdLifecycle,
  THRESHOLD_LIFECYCLE_STATE_VERSION,
  type ThresholdCandidate,
  type ThresholdEvidence,
  type ThresholdLifecycleState,
  type ThresholdLifecycleStepResult,
} from "./index";

const DAY_MS = 86_400_000;
const BASE_MS = Date.parse("2026-01-01T12:00:00.000Z");

const bikeCandidate: ThresholdCandidate = {
  activityCategory: "bike",
  metric: "power",
  unit: "watts",
  method: "bike_power_30m",
  value: 250,
  sourceSeriesId: "power-series",
  sourceSeriesMetric: "power",
  startTimestampSeconds: 0,
  endTimestampSeconds: 1_800,
  exactWindowSeconds: 1_800,
  conversionFactor: 0.95,
  policyVersion: "threshold-policy-v1",
  plausibilityVersion: "threshold-plausibility-v1",
};

function evidenceAt(index: number, value = 250, offsetDays = index): ThresholdEvidence {
  return {
    ...bikeCandidate,
    value,
    evidenceId: `evidence-${String(index).padStart(5, "0")}`,
    activityId: `activity-${String(index).padStart(5, "0")}`,
    observedAt: new Date(BASE_MS + offsetDays * DAY_MS).toISOString(),
  };
}

function fold(evidence: readonly ThresholdEvidence[]): ThresholdLifecycleStepResult {
  let state: ThresholdLifecycleState | null = null;
  let latest: ThresholdLifecycleStepResult | null = null;
  for (const candidate of evidence) {
    latest = advanceThresholdLifecycle({ state, candidate });
    state = latest.state;
  }
  if (latest === null) throw new Error("Test lifecycle requires evidence");
  return latest;
}

describe("incremental threshold lifecycle", () => {
  it("processes 1,000 chronological activities with bounded retained state", () => {
    const evidence = Array.from({ length: 1_000 }, (_, index) => evidenceAt(index));
    const latest = fold(evidence);

    expect(latest).toMatchObject({
      action: "retain",
      selectedValue: 250,
      state: {
        stateVersion: THRESHOLD_LIFECYCLE_STATE_VERSION,
        confidence: "confirmed",
        pendingDecrease: [],
        lastProcessed: { evidenceId: "evidence-00999", activityId: "activity-00999" },
      },
    });
    expect(latest.state.current.selectedEvidenceIds).toHaveLength(2);
    expect(latest.state.pendingDecrease.length).toBeLessThanOrEqual(1);
    expect(JSON.stringify(latest.state).length).toBeLessThan(4_000);

    expect(
      resolveThresholdLifecycle({
        activityCategory: "bike",
        asOf: new Date(BASE_MS + 1_001 * DAY_MS).toISOString(),
        evidence,
      }),
    ).toMatchObject({
      status: "available",
      state: "confirmed",
      threshold: { value: 250 },
    });
  });

  it("rejects duplicate evidence, duplicate activity, and out-of-order keysets", () => {
    const first = advanceThresholdLifecycle({ state: null, candidate: evidenceAt(1) });
    expect(() =>
      advanceThresholdLifecycle({ state: first.state, candidate: evidenceAt(1) }),
    ).toThrow("Threshold lifecycle evidence identity was already processed");
    expect(() =>
      advanceThresholdLifecycle({
        state: first.state,
        candidate: { ...evidenceAt(2), activityId: "activity-00001" },
      }),
    ).toThrow("Threshold lifecycle activity identity was already processed");
    expect(() =>
      advanceThresholdLifecycle({ state: first.state, candidate: evidenceAt(0) }),
    ).toThrow("Threshold lifecycle candidate is out of chronological keyset order");
    expect(() =>
      advanceThresholdLifecycle({
        state: first.state,
        candidate: {
          ...evidenceAt(2),
          observedAt: first.state.lastProcessed.observedAt,
          evidenceId: "evidence-00000",
        },
      }),
    ).toThrow("Threshold lifecycle candidate is out of chronological keyset order");
  });

  it("matches convenience replay for prior provisional, confirmation, increase, noise, and decrease sequences", () => {
    const sequences = [
      [evidenceAt(1, 250)],
      [evidenceAt(1, 250), evidenceAt(2, 252)],
      [evidenceAt(1, 250), evidenceAt(2, 250), evidenceAt(3, 265)],
      [evidenceAt(1, 250), evidenceAt(2, 250), evidenceAt(3, 252)],
      [evidenceAt(1, 250), evidenceAt(2, 250), evidenceAt(3, 230), evidenceAt(4, 232)],
    ];

    for (const sequence of sequences) {
      const incremental = fold(sequence);
      const replay = resolveThresholdLifecycle({
        activityCategory: "bike",
        asOf: new Date(BASE_MS + 10 * DAY_MS).toISOString(),
        evidence: [...sequence].reverse(),
      });
      expect(replay).toEqual({
        status: "available",
        state: incremental.state.confidence,
        decision: incremental.decision,
        threshold: incremental.state.current,
      });
    }
  });

  it("confirms inside the confirmation window and resets provisional evidence outside it", () => {
    const first = advanceThresholdLifecycle({ state: null, candidate: evidenceAt(1, 250, 0) });
    const atBoundary = advanceThresholdLifecycle({
      state: first.state,
      candidate: evidenceAt(2, 252, 42),
    });
    expect(atBoundary).toMatchObject({ action: "confirm", selectedValue: 251 });

    const outside = advanceThresholdLifecycle({
      state: first.state,
      candidate: evidenceAt(3, 252, 43),
    });
    expect(outside).toMatchObject({
      action: "provisional",
      decision: "confirmation_window_reset",
      selectedValue: 252,
      state: { confidence: "provisional", pendingDecrease: [] },
    });
    expect(outside.state.current.selectedEvidenceIds).toEqual(["evidence-00003"]);
  });

  it("supports repeated decreases inside the window and prunes expired pending evidence", () => {
    const confirmed = fold([evidenceAt(1, 250, 0), evidenceAt(2, 250, 1)]);
    const firstLow = advanceThresholdLifecycle({
      state: confirmed.state,
      candidate: evidenceAt(3, 230, 2),
    });
    expect(firstLow).toMatchObject({
      action: "retain",
      decision: "retained_single_decrease",
      selectedValue: 250,
      state: { pendingDecrease: [{ evidenceId: "evidence-00003" }] },
    });

    const atBoundary = advanceThresholdLifecycle({
      state: firstLow.state,
      candidate: evidenceAt(4, 232, 58),
    });
    expect(atBoundary).toMatchObject({
      action: "decrease",
      selectedValue: 231,
      state: { confidence: "confirmed", pendingDecrease: [] },
    });

    const outside = advanceThresholdLifecycle({
      state: firstLow.state,
      candidate: evidenceAt(5, 232, 59),
    });
    expect(outside).toMatchObject({
      action: "retain",
      decision: "retained_single_decrease",
      selectedValue: 250,
      state: { pendingDecrease: [{ evidenceId: "evidence-00005" }] },
    });
  });

  it("preserves a compatible pending decrease across neutral evidence", () => {
    const confirmed = fold([evidenceAt(1, 250, 0), evidenceAt(2, 250, 1)]);
    const firstLow = advanceThresholdLifecycle({
      state: confirmed.state,
      candidate: evidenceAt(3, 230, 2),
    });
    const neutral = advanceThresholdLifecycle({
      state: firstLow.state,
      candidate: evidenceAt(4, 252, 20),
    });
    expect(neutral).toMatchObject({
      action: "retain",
      decision: "retained_noise",
      selectedValue: 250,
      state: { pendingDecrease: [{ evidenceId: "evidence-00003", value: 230 }] },
    });

    const secondLow = advanceThresholdLifecycle({
      state: neutral.state,
      candidate: evidenceAt(5, 232, 30),
    });
    expect(secondLow).toMatchObject({
      action: "decrease",
      decision: "supported_decrease",
      selectedValue: 231,
      state: { pendingDecrease: [] },
    });
  });

  it("expires pending decrease evidence while retaining neutral observations", () => {
    const confirmed = fold([evidenceAt(1, 250, 0), evidenceAt(2, 250, 1)]);
    const firstLow = advanceThresholdLifecycle({
      state: confirmed.state,
      candidate: evidenceAt(3, 230, 2),
    });
    const neutralAfterExpiry = advanceThresholdLifecycle({
      state: firstLow.state,
      candidate: evidenceAt(4, 250, 59),
    });
    expect(neutralAfterExpiry).toMatchObject({
      action: "retain",
      decision: "retained_noise",
      state: { pendingDecrease: [] },
    });

    const nextLow = advanceThresholdLifecycle({
      state: neutralAfterExpiry.state,
      candidate: evidenceAt(5, 232, 60),
    });
    expect(nextLow).toMatchObject({
      action: "retain",
      decision: "retained_single_decrease",
      selectedValue: 250,
      state: { pendingDecrease: [{ evidenceId: "evidence-00005", value: 232 }] },
    });
  });

  it("replaces contradictory lows deterministically, clears on increase, and preserves keyset order", () => {
    const confirmed = fold([evidenceAt(1, 250, 0), evidenceAt(2, 250, 1)]);
    const firstLow = advanceThresholdLifecycle({
      state: confirmed.state,
      candidate: evidenceAt(3, 230, 2),
    });
    const contradictoryLow = advanceThresholdLifecycle({
      state: firstLow.state,
      candidate: evidenceAt(4, 200, 3),
    });
    expect(contradictoryLow).toMatchObject({
      action: "retain",
      decision: "retained_single_decrease",
      selectedValue: 250,
      state: { pendingDecrease: [{ evidenceId: "evidence-00004", value: 200 }] },
    });
    expect(() =>
      advanceThresholdLifecycle({
        state: contradictoryLow.state,
        candidate: evidenceAt(6, 202, 2),
      }),
    ).toThrow("Threshold lifecycle candidate is out of chronological keyset order");

    const compatibleLow = advanceThresholdLifecycle({
      state: contradictoryLow.state,
      candidate: evidenceAt(5, 202, 4),
    });
    expect(compatibleLow).toMatchObject({
      action: "decrease",
      selectedValue: 201,
      state: { pendingDecrease: [] },
    });

    const freshLow = advanceThresholdLifecycle({
      state: confirmed.state,
      candidate: evidenceAt(7, 230, 5),
    });
    const increase = advanceThresholdLifecycle({
      state: freshLow.state,
      candidate: evidenceAt(8, 265, 6),
    });
    expect(increase).toMatchObject({
      action: "increase",
      selectedValue: 265,
      state: { pendingDecrease: [] },
    });
  });
});
