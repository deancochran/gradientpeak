import { describe, expect, it } from "vitest";
import {
  normalizeCompositeWeights,
  rebalanceCompositeWeights,
  type CompositeWeightLocks,
} from "./calibration";

const unlocked: CompositeWeightLocks = {
  target_attainment_weight: false,
  envelope_weight: false,
  durability_weight: false,
  evidence_weight: false,
};

describe("calibration composite helpers", () => {
  it("normalizes arbitrary composite weights to sum exactly one", () => {
    const normalized = normalizeCompositeWeights({
      weights: {
        target_attainment_weight: 0.8,
        envelope_weight: 0.2,
        durability_weight: 0.1,
        evidence_weight: 0.1,
      },
    });

    const total =
      normalized.target_attainment_weight +
      normalized.envelope_weight +
      normalized.durability_weight +
      normalized.evidence_weight;

    expect(Math.abs(total - 1)).toBeLessThanOrEqual(1e-6);
  });

  it("rebalances unlocked weights when active slider changes", () => {
    const result = rebalanceCompositeWeights({
      weights: {
        target_attainment_weight: 0.45,
        envelope_weight: 0.3,
        durability_weight: 0.15,
        evidence_weight: 0.1,
      },
      locks: unlocked,
      activeKey: "target_attainment_weight",
      nextValue: 0.6,
    });

    expect(result.target_attainment_weight).toBeCloseTo(0.6, 5);
    const total =
      result.target_attainment_weight +
      result.envelope_weight +
      result.durability_weight +
      result.evidence_weight;
    expect(Math.abs(total - 1)).toBeLessThanOrEqual(1e-6);
  });

  it("honors locked weights while rebalancing remaining fields", () => {
    const result = rebalanceCompositeWeights({
      weights: {
        target_attainment_weight: 0.45,
        envelope_weight: 0.3,
        durability_weight: 0.15,
        evidence_weight: 0.1,
      },
      locks: {
        ...unlocked,
        evidence_weight: true,
      },
      activeKey: "target_attainment_weight",
      nextValue: 0.5,
    });

    expect(result.evidence_weight).toBeCloseTo(0.1, 6);
    const total =
      result.target_attainment_weight +
      result.envelope_weight +
      result.durability_weight +
      result.evidence_weight;
    expect(Math.abs(total - 1)).toBeLessThanOrEqual(1e-6);
  });
});
