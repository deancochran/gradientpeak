export interface NumericUxPolicy {
  adjustmentStep: number;
  sliderStep: number;
  stepAnchor?: number;
}

export type NumericInputPrecision = "decimal" | "integer" | { maxDecimalPlaces: number };
export type NumericInputResult =
  | { status: "empty" }
  | { status: "valid"; value: number }
  | { status: "invalid"; reason: "syntax" | "finite" | "precision" | "range" };

/** Typed input is never clamped or rounded. Blank is distinct from invalid text. */
export function parseNumericInput(
  raw: string | undefined,
  options: {
    min?: number | undefined;
    max?: number | undefined;
    precision?: NumericInputPrecision | undefined;
  } = {},
): NumericInputResult {
  const text = raw?.trim() ?? "";
  if (!text) return { status: "empty" };
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text))
    return { status: "invalid", reason: "syntax" };
  const value = Number(text);
  if (!Number.isFinite(value)) return { status: "invalid", reason: "finite" };
  const precision = options.precision ?? "decimal";
  const [coefficient = "", exponent = "0"] = text.split(/[eE]/);
  const fractionalDigits = (coefficient.split(".")[1] ?? "").length;
  const trailingZeros = coefficient.replace(".", "").match(/0+$/)?.[0].length ?? 0;
  const places = /[1-9]/.test(coefficient)
    ? Math.max(0, fractionalDigits - trailingZeros - Number(exponent))
    : 0;
  if (value === 0 && /[1-9]/.test(coefficient)) return { status: "invalid", reason: "precision" };
  if (precision === "integer" && (!Number.isSafeInteger(value) || places > 0))
    return { status: "invalid", reason: "precision" };
  if (typeof precision === "object" && places > precision.maxDecimalPlaces)
    return { status: "invalid", reason: "precision" };
  if (value < (options.min ?? -Infinity) || value > (options.max ?? Infinity))
    return { status: "invalid", reason: "range" };
  return { status: "valid", value };
}

/** Raw sliders are normalized on both platforms. Product-unit sliders pass explicit bounds. */
export const normalizedSliderPolicy = { minimumValue: 0, maximumValue: 1, step: 0.01 } as const;

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
  const [coefficient = "", exponent = "0"] = value.toString().split(/[eE]/);
  return Math.max(0, (coefficient.split(".")[1] ?? "").length - Number(exponent));
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

export interface QuantityPickerWholeGroup {
  /** Decimal divisor represented by this native picker column. */
  divisor: number;
  /** A compact, semantic label rather than a wheel per digit. */
  label: string;
  /** Up to 0–999; the highest column is limited by the declared maximum. */
  values: readonly number[];
}

/**
 * Splits a safe non-negative whole range into base-1000 picker columns.
 * This keeps a 2,000,000 metre range reachable without a million-row spinner
 * or a wall of individual digit wheels. Decimal and sign state remain separate.
 */
export function quantityPickerWholeGroups(
  maximumAbsoluteValue: number,
): QuantityPickerWholeGroup[] {
  if (!Number.isSafeInteger(maximumAbsoluteValue) || maximumAbsoluteValue < 0)
    throw new RangeError("Quantity picker bounds must be non-negative safe integers.");
  const divisors: number[] = [];
  for (let divisor = 1; divisor <= maximumAbsoluteValue; divisor *= 1_000) {
    divisors.unshift(divisor);
    if (divisor > Number.MAX_SAFE_INTEGER / 1_000) break;
  }
  if (divisors.length === 0) divisors.push(1);
  return divisors.map((divisor) => ({
    divisor,
    label:
      divisor === 1
        ? "units"
        : divisor === 1_000
          ? "thousands"
          : divisor === 1_000_000
            ? "millions"
            : `10^${Math.round(Math.log10(divisor))}`,
    values: Array.from(
      { length: Math.min(1_000, Math.floor(maximumAbsoluteValue / divisor) + 1) },
      (_, value) => value,
    ),
  }));
}

/** Reads one compact base-1000 picker column from a non-negative safe integer. */
export function quantityPickerWholeGroupValue(value: number, divisor: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || !Number.isSafeInteger(divisor) || divisor <= 0)
    return Number.NaN;
  return Math.floor(value / divisor) % 1_000;
}

/** Composes compact picker columns without floating-point rounding. */
export function quantityPickerWholeValue(
  values: readonly number[],
  groups: readonly QuantityPickerWholeGroup[],
): number {
  if (values.length !== groups.length) return Number.NaN;
  const total = values.reduce((sum, value, index) => {
    const group = groups[index];
    if (!group || !Number.isSafeInteger(value) || value < 0 || value > 999) return Number.NaN;
    return sum + value * group.divisor;
  }, 0);
  return Number.isSafeInteger(total) ? total : Number.NaN;
}
