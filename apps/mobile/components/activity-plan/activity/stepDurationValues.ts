export type StepDurationValue =
  | { type: "time"; seconds: number }
  | { type: "distance"; meters: number }
  | { type: "repetitions"; count: number }
  | { type: "untilFinished" };

/** Accept binary floating-point noise, but never round a real fractional metre. */
function nearestInteger(value: number): number | null {
  const rounded = Math.round(value);
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(value)) * 8;
  return Math.abs(value - rounded) <= tolerance ? rounded : null;
}

export function fromUIValue(
  type: StepDurationValue["type"],
  value: number,
  unit: string,
): StepDurationValue | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  if (type === "time") {
    const seconds = unit === "hours" ? value * 3600 : unit === "minutes" ? value * 60 : value;
    return Number.isInteger(seconds) ? { type, seconds } : null;
  }

  if (type === "distance") {
    const meters = nearestInteger(unit === "km" ? value * 1000 : value);
    return meters === null ? null : { type, meters };
  }

  if (type === "repetitions") return Number.isInteger(value) ? { type, count: value } : null;
  return { type: "untilFinished" };
}
