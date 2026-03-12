export const KG_PER_LB = 0.45359237;
export const LB_PER_KG = 2.2046226218;

export type WeightUnit = "kg" | "lbs";

export function roundToDecimals(value: number, decimals = 1): number {
  return Number(value.toFixed(decimals));
}

export function convertWeightFromKg(valueKg: number, unit: WeightUnit): number {
  if (unit === "kg") {
    return valueKg;
  }

  return valueKg * LB_PER_KG;
}

export function convertWeightToKg(value: number, unit: WeightUnit): number {
  if (unit === "kg") {
    return value;
  }

  return value * KG_PER_LB;
}

export function formatWeightForDisplay(
  valueKg: number | null | undefined,
  unit: WeightUnit,
  decimals = 1,
): string {
  if (valueKg == null) {
    return "";
  }

  return roundToDecimals(
    convertWeightFromKg(valueKg, unit),
    decimals,
  ).toString();
}

export function getWeightBounds(unit: WeightUnit): {
  min: number;
  max: number;
} {
  if (unit === "kg") {
    return { min: 30, max: 300 };
  }

  return {
    min: roundToDecimals(convertWeightFromKg(30, unit), 1),
    max: roundToDecimals(convertWeightFromKg(300, unit), 1),
  };
}

export function estimateMaxHrFromDob(
  dob: string | null | undefined,
): number | null {
  if (!dob) {
    return null;
  }

  const birthDate = new Date(`${dob}T12:00:00.000Z`);
  if (Number.isNaN(birthDate.getTime())) {
    return null;
  }

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < birthDate.getDate())
  ) {
    age -= 1;
  }

  return Math.max(100, 220 - age);
}

export function estimateFtpFromWeight(
  weightKg: number | null | undefined,
): number | null {
  if (!weightKg || weightKg <= 0) {
    return null;
  }

  return Math.round(weightKg * 2.5);
}
