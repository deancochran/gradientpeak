export const HR_ZONE_PERCENTAGES = {
  ZONE_1: 0.5,
  ZONE_2: 0.6,
  ZONE_3: 0.7,
  ZONE_4: 0.8,
  ZONE_5: 0.9,
} as const;

export const HR_ZONE_MAX_PERCENTAGES = {
  ZONE_1: 0.5,
  ZONE_2: 0.6,
  ZONE_3: 0.7,
  ZONE_4: 0.8,
  ZONE_5: 0.9,
} as const;

export const POWER_ZONE_PERCENTAGES = {
  ZONE_1: 0.55,
  ZONE_2: 0.75,
  ZONE_3: 0.9,
  ZONE_4: 1.05,
  ZONE_5: 1.2,
} as const;

export const PACE_ZONE_PERCENTAGES = {
  ZONE_1: 0.85,
  ZONE_2: 0.9,
  ZONE_3: 0.95,
  ZONE_4: 1.0,
  ZONE_5: 1.05,
} as const;

export const HR_ZONE_NAMES = {
  ZONE_1: { name: "Recovery", description: "Active recovery and warm-up" },
  ZONE_2: { name: "Endurance", description: "Aerobic base building" },
  ZONE_3: { name: "Tempo", description: "Aerobic threshold training" },
  ZONE_4: {
    name: "Lactate Threshold",
    description: "Lactate threshold training",
  },
  ZONE_5: { name: "VO2 Max", description: "Neuromuscular power and VO2 max" },
} as const;

export const POWER_ZONE_NAMES = {
  ZONE_1: { name: "Active Recovery", description: "Very easy spinning" },
  ZONE_2: { name: "Endurance", description: "Aerobic base building" },
  ZONE_3: { name: "Tempo", description: "Aerobic threshold training" },
  ZONE_4: { name: "Lactate Threshold", description: "Sustainable hard effort" },
  ZONE_5: { name: "VO2 Max", description: "Hard anaerobic efforts" },
} as const;

export const INTENSITY_ZONES = {
  RECOVERY: {
    name: "Recovery",
    min: 0,
    max: 55,
    description: "Active recovery and rest",
    color: "#10b981",
  },
  ENDURANCE: {
    name: "Endurance",
    min: 55,
    max: 74,
    description: "Aerobic base building",
    color: "#3b82f6",
  },
  TEMPO: {
    name: "Tempo",
    min: 75,
    max: 84,
    description: "Aerobic threshold",
    color: "#8b5cf6",
  },
  THRESHOLD: {
    name: "Threshold",
    min: 85,
    max: 94,
    description: "Lactate threshold",
    color: "#f59e0b",
  },
  VO2MAX: {
    name: "VO2max",
    min: 95,
    max: 104,
    description: "VO2 max intervals",
    color: "#f97316",
  },
  ANAEROBIC: {
    name: "Anaerobic",
    min: 105,
    max: 114,
    description: "Anaerobic capacity",
    color: "#ef4444",
  },
  NEUROMUSCULAR: {
    name: "Neuromuscular",
    min: 115,
    max: 400,
    description: "Sprint power",
    color: "#dc2626",
  },
} as const;

export function getIntensityZone(intensityFactor: number): keyof typeof INTENSITY_ZONES {
  if (intensityFactor < 55) return "RECOVERY";
  if (intensityFactor < 75) return "ENDURANCE";
  if (intensityFactor < 85) return "TEMPO";
  if (intensityFactor < 95) return "THRESHOLD";
  if (intensityFactor < 105) return "VO2MAX";
  if (intensityFactor < 115) return "ANAEROBIC";
  return "NEUROMUSCULAR";
}
