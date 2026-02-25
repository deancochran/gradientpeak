import type { TrainingPlanCalibrationConfig } from "@repo/core";

type CompositeKey = keyof TrainingPlanCalibrationConfig["readiness_composite"];

export type CompositeWeightLocks = Record<CompositeKey, boolean>;

const COMPOSITE_KEYS: CompositeKey[] = [
  "target_attainment_weight",
  "envelope_weight",
  "durability_weight",
  "evidence_weight",
];

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function normalizeCompositeWeights(input: {
  weights: TrainingPlanCalibrationConfig["readiness_composite"];
}): TrainingPlanCalibrationConfig["readiness_composite"] {
  const raw = COMPOSITE_KEYS.map((key) => clamp01(input.weights[key]));
  const total = raw.reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    return {
      target_attainment_weight: 0.25,
      envelope_weight: 0.25,
      durability_weight: 0.25,
      evidence_weight: 0.25,
    };
  }

  const normalized = raw.map((value) => value / total);
  const rounded = normalized.map(round6);
  const roundedTotal = rounded.reduce((sum, value) => sum + value, 0);
  const residual = round6(1 - roundedTotal);
  rounded[rounded.length - 1] = round6(
    (rounded[rounded.length - 1] ?? 0) + residual,
  );

  return {
    target_attainment_weight: rounded[0] ?? 0,
    envelope_weight: rounded[1] ?? 0,
    durability_weight: rounded[2] ?? 0,
    evidence_weight: rounded[3] ?? 0,
  };
}

export function rebalanceCompositeWeights(input: {
  weights: TrainingPlanCalibrationConfig["readiness_composite"];
  locks: CompositeWeightLocks;
  activeKey: CompositeKey;
  nextValue: number;
}): TrainingPlanCalibrationConfig["readiness_composite"] {
  const current = { ...input.weights };
  const next = clamp01(input.nextValue);

  const fixedKeys = COMPOSITE_KEYS.filter(
    (key) => key === input.activeKey || input.locks[key],
  );
  const variableKeys = COMPOSITE_KEYS.filter((key) => !fixedKeys.includes(key));

  const updated: TrainingPlanCalibrationConfig["readiness_composite"] = {
    ...current,
    [input.activeKey]: next,
  };

  const fixedTotal = fixedKeys.reduce((sum, key) => {
    if (key === input.activeKey) {
      return sum + next;
    }
    return sum + clamp01(current[key]);
  }, 0);

  const remainingBudget = clamp01(1 - fixedTotal);

  if (variableKeys.length === 0) {
    return normalizeCompositeWeights({ weights: updated });
  }

  const variableTotal = variableKeys.reduce(
    (sum, key) => sum + clamp01(current[key]),
    0,
  );

  if (variableTotal <= 1e-9) {
    const even = remainingBudget / variableKeys.length;
    for (const key of variableKeys) {
      updated[key] = even;
    }
  } else {
    for (const key of variableKeys) {
      const ratio = clamp01(current[key]) / variableTotal;
      updated[key] = remainingBudget * ratio;
    }
  }

  return normalizeCompositeWeights({ weights: updated });
}
