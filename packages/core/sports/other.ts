import type { SportRegistryEntry } from "./contracts";

export const otherSport: SportRegistryEntry = {
  category: "other",
  displayName: "Other",
  stepDefaults: {
    warmupName: "Warm-up",
    cooldownName: "Cool-down",
    mainStepPrefix: "Interval",
    warmupDuration: { type: "time", seconds: 900 },
    mainDuration: { type: "time", seconds: 900 },
    cooldownDuration: { type: "time", seconds: 900 },
  },
  load: {
    duration: {
      paceSecondsPerKm: 300,
      secondsPerRep: 10,
      untilFinishedSeconds: 300,
    },
    route: {
      baseSpeedMps: 3.0,
      typicalSpeeds: {
        easy: 2.5,
        moderate: 3.0,
        hard: 3.5,
      },
    },
    template: {
      avgIF: 0.65,
      avgDuration: 1800,
      avgTSS: 30,
    },
  },
};
