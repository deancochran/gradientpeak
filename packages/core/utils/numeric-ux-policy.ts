export interface NumericUxPolicy {
  adjustmentStep: number;
  sliderStep: number;
  stepAnchor?: number;
}

type StepAlignmentOptions = {
  anchor?: number;
  max: number;
  min: number;
  step: number;
};

/** Explicit semantic defaults for deliberate slider and +/- adjustments. */
export const numericUxPolicies = {
  shortDurationSeconds: { adjustmentStep: 5, sliderStep: 5 },
  durationMinutes: { adjustmentStep: 1, sliderStep: 1 },
  durationHours: { adjustmentStep: 0.25, sliderStep: 0.25 },
  sessionBudgetMinutes: { adjustmentStep: 5, sliderStep: 5 },
  weeklyBudgetMinutes: { adjustmentStep: 15, sliderStep: 15 },
  distanceMeters: { adjustmentStep: 10, sliderStep: 10 },
  distanceKilometers: { adjustmentStep: 0.1, sliderStep: 0.1 },
  plannedBpm: { adjustmentStep: 5, sliderStep: 5 },
  plannedPowerWatts: { adjustmentStep: 5, sliderStep: 5 },
  plannedCadence: { adjustmentStep: 5, sliderStep: 5 },
  plannedSpeedKph: { adjustmentStep: 0.5, sliderStep: 0.5 },
  paceSeconds: { adjustmentStep: 5, sliderStep: 5 },
  grade: { adjustmentStep: 0.5, sliderStep: 0.5 },
  activityPlanPercent: { adjustmentStep: 5, sliderStep: 5 },
  preferencePercent: { adjustmentStep: 1, sliderStep: 1 },
  count: { adjustmentStep: 1, sliderStep: 1 },
  rpe: { adjustmentStep: 1, sliderStep: 1 },
  weight: { adjustmentStep: 0.1, sliderStep: 0.1 },
} as const satisfies Record<string, NumericUxPolicy>;

function decimalPlaces(value: number): number {
  const exponent = value.toString().split(/[eE]/)[1];
  if (exponent) return Math.max(0, Number(exponent.startsWith("-") ? exponent.slice(1) : 0));
  return (value.toString().split(".")[1] ?? "").length;
}

function precisionFor(step: number, anchor: number): number {
  return Math.max(decimalPlaces(step), decimalPlaces(anchor), 6);
}

export function alignNumberToStep(
  value: number,
  { anchor = 0, max, min, step }: StepAlignmentOptions,
): number {
  const precision = precisionFor(step, anchor);
  const aligned = anchor + Math.round((value - anchor) / step) * step;
  return Number(Math.max(min, Math.min(max, aligned)).toFixed(precision));
}

/** Moves to the next canonical adjustment point, even from a valid off-step value. */
export function nudgeNumberByStep(
  value: number,
  direction: -1 | 1,
  { anchor = 0, max, min, step }: StepAlignmentOptions,
): number {
  const precision = precisionFor(step, anchor);
  const position = (value - anchor) / step;
  const nextIndex =
    direction > 0 ? Math.floor(position + 1e-9) + 1 : Math.ceil(position - 1e-9) - 1;
  const next = anchor + nextIndex * step;
  return Number(Math.max(min, Math.min(max, next)).toFixed(precision));
}
