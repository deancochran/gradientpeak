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

export const INTENSITY_COLOR_THEMES = {
  spectrum: {
    RECOVERY: { background: "#38bdf8", foreground: "#082f49" },
    ENDURANCE: { background: "#22c55e", foreground: "#052e16" },
    TEMPO: { background: "#eab308", foreground: "#422006" },
    THRESHOLD: { background: "#f97316", foreground: "#431407" },
    VO2MAX: { background: "#ef4444", foreground: "#030712" },
    ANAEROBIC: { background: "#db2777", foreground: "#ffffff" },
    NEUROMUSCULAR: { background: "#7c3aed", foreground: "#ffffff" },
  },
  classic: {
    RECOVERY: { background: "#10b981", foreground: "#052e16" },
    ENDURANCE: { background: "#3b82f6", foreground: "#0f172a" },
    TEMPO: { background: "#8b5cf6", foreground: "#030712" },
    THRESHOLD: { background: "#f59e0b", foreground: "#422006" },
    VO2MAX: { background: "#f97316", foreground: "#431407" },
    ANAEROBIC: { background: "#ef4444", foreground: "#030712" },
    NEUROMUSCULAR: { background: "#dc2626", foreground: "#ffffff" },
  },
} as const;

export type IntensityColorThemeName = keyof typeof INTENSITY_COLOR_THEMES;
export type IntensityZoneName = keyof (typeof INTENSITY_COLOR_THEMES)["spectrum"];

/** Change this one selection to update intensity colors across every shared consumer. */
export const ACTIVE_INTENSITY_COLOR_THEME = "spectrum" satisfies IntensityColorThemeName;

export function getIntensityZoneColor(
  zone: IntensityZoneName,
  theme: IntensityColorThemeName = ACTIVE_INTENSITY_COLOR_THEME,
): string {
  return INTENSITY_COLOR_THEMES[theme][zone].background;
}

export function getIntensityZoneForegroundColor(
  zone: IntensityZoneName,
  theme: IntensityColorThemeName = ACTIVE_INTENSITY_COLOR_THEME,
): string {
  return INTENSITY_COLOR_THEMES[theme][zone].foreground;
}

export const INTENSITY_ZONES = {
  RECOVERY: {
    name: "Recovery",
    min: 0,
    max: 55,
    description: "Active recovery and rest",
    color: getIntensityZoneColor("RECOVERY"),
  },
  ENDURANCE: {
    name: "Endurance",
    min: 55,
    max: 74,
    description: "Aerobic base building",
    color: getIntensityZoneColor("ENDURANCE"),
  },
  TEMPO: {
    name: "Tempo",
    min: 75,
    max: 84,
    description: "Aerobic threshold",
    color: getIntensityZoneColor("TEMPO"),
  },
  THRESHOLD: {
    name: "Threshold",
    min: 85,
    max: 94,
    description: "Lactate threshold",
    color: getIntensityZoneColor("THRESHOLD"),
  },
  VO2MAX: {
    name: "VO2max",
    min: 95,
    max: 104,
    description: "VO2 max intervals",
    color: getIntensityZoneColor("VO2MAX"),
  },
  ANAEROBIC: {
    name: "Anaerobic",
    min: 105,
    max: 114,
    description: "Anaerobic capacity",
    color: getIntensityZoneColor("ANAEROBIC"),
  },
  NEUROMUSCULAR: {
    name: "Neuromuscular",
    min: 115,
    max: 400,
    description: "Sprint power",
    color: getIntensityZoneColor("NEUROMUSCULAR"),
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
