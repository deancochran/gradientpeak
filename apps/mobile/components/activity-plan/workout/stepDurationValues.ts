export type StepDurationValue =
  | { type: "time"; seconds: number }
  | { type: "distance"; meters: number }
  | { type: "repetitions"; count: number };

export function fromUIValue(
  type: StepDurationValue["type"],
  value: number,
  unit: string,
): StepDurationValue {
  if (type === "time") {
    if (unit === "hours") return { type, seconds: Math.round(value * 3600) };
    if (unit === "minutes") return { type, seconds: Math.round(value * 60) };
    return { type, seconds: Math.round(value) };
  }

  if (type === "distance") {
    return { type, meters: Math.round(unit === "km" ? value * 1000 : value) };
  }

  return { type, count: Math.round(value) };
}

export function durationForType(type: StepDurationValue["type"]): StepDurationValue {
  if (type === "distance") return { type, meters: 1000 };
  if (type === "repetitions") return { type, count: 10 };
  return { type, seconds: 600 };
}
