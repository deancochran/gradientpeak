export type StepDurationValue =
  | { type: "time"; seconds: number }
  | { type: "distance"; meters: number }
  | { type: "repetitions"; count: number }
  | { type: "untilFinished" };

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
    const meters = unit === "km" ? value * 1000 : value;
    return Number.isInteger(meters) ? { type, meters } : null;
  }

  if (type === "repetitions") return Number.isInteger(value) ? { type, count: value } : null;
  return { type: "untilFinished" };
}

export function durationForType(type: StepDurationValue["type"]): StepDurationValue {
  if (type === "distance") return { type, meters: 1000 };
  if (type === "repetitions") return { type, count: 10 };
  if (type === "untilFinished") return { type };
  return { type, seconds: 600 };
}
