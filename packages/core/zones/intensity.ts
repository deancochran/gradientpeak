export type TrainingIntensityZone =
  | "recovery"
  | "endurance"
  | "tempo"
  | "threshold"
  | "vo2max"
  | "anaerobic"
  | "neuromuscular";

export function getTrainingIntensityZone(intensityFactor: number): TrainingIntensityZone {
  if (intensityFactor < 0.55) return "recovery";
  if (intensityFactor < 0.75) return "endurance";
  if (intensityFactor < 0.85) return "tempo";
  if (intensityFactor < 0.95) return "threshold";
  if (intensityFactor < 1.05) return "vo2max";
  if (intensityFactor < 1.15) return "anaerobic";
  return "neuromuscular";
}

export function getFiveIntensityZone(ftpPercent: number): "z1" | "z2" | "z3" | "z4" | "z5" {
  if (ftpPercent >= 106) return "z5";
  if (ftpPercent >= 91) return "z4";
  if (ftpPercent >= 76) return "z3";
  if (ftpPercent >= 56) return "z2";
  return "z1";
}
