export {
  calculateHRReserve,
  calculateHRZones,
  calculateTargetHR,
  estimateLTHRFromMaxHR as estimateLTHR,
  estimateMaxHRFromAge,
} from "../zones/hr";

export function calculateVO2MaxFromHR(maxHR: number, restingHR: number): number {
  if (maxHR <= 0 || restingHR <= 0) {
    throw new Error("Heart rates must be greater than 0");
  }

  if (maxHR <= restingHR) {
    throw new Error("Max HR must be greater than resting HR");
  }

  if (maxHR < 100 || maxHR > 250) {
    throw new Error("Max HR must be between 100 and 250 bpm");
  }

  if (restingHR < 30 || restingHR > 120) {
    throw new Error("Resting HR must be between 30 and 120 bpm");
  }

  const vo2max = 15.3 * (maxHR / restingHR);
  return Math.max(20, Math.min(vo2max, 100));
}
