export type ManualReviewValues = {
  calories: number | null;
  caloriesEnteredManually: boolean;
  distanceMeters: number;
  distanceEnteredManually: boolean;
};

export function parseManualReviewValues({
  artifactDistanceMeters,
  calories,
  distanceMeters,
}: {
  artifactDistanceMeters: number;
  calories: string;
  distanceMeters: string;
}): ManualReviewValues | null {
  const distance = distanceMeters.trim() === "" ? null : Number(distanceMeters);
  const manualCalories = calories.trim() === "" ? null : Number(calories);
  if (
    (distance !== null && (!Number.isFinite(distance) || distance < 0)) ||
    (manualCalories !== null && (!Number.isFinite(manualCalories) || manualCalories < 0))
  ) {
    return null;
  }
  return {
    distanceMeters: distance ?? artifactDistanceMeters,
    calories: manualCalories,
    distanceEnteredManually: distance !== null,
    caloriesEnteredManually: manualCalories !== null,
  };
}

export function parseTrainerTargetPower(value: string): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}
