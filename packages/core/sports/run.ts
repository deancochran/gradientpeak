import type { SportRegistryEntry } from "./contracts";

export const runSport: SportRegistryEntry = {
  category: "run",
  displayName: "Run",
  stepDefaults: {
    warmupName: "Warm-up",
    cooldownName: "Cool-down",
    mainStepPrefix: "Interval",
    warmupDuration: { type: "time", seconds: 600 },
    mainDuration: { type: "time", seconds: 1200 },
    cooldownDuration: { type: "time", seconds: 300 },
    warmupTarget: { type: "%MaxHR", intensity: 60 },
    mainTarget: { type: "%MaxHR", intensity: 75 },
    cooldownTarget: { type: "%MaxHR", intensity: 55 },
  },
  load: {
    duration: {
      paceSecondsPerKm: 300,
      secondsPerRep: 10,
      untilFinishedSeconds: 300,
    },
    route: {
      baseSpeedMps: 3.5,
      typicalSpeeds: {
        easy: 3.0,
        moderate: 3.5,
        hard: 4.2,
      },
    },
    template: {
      avgIF: 0.8,
      avgDuration: 2700,
      avgTSS: 55,
    },
  },
};
