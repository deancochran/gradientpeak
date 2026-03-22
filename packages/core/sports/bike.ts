import type { SportRegistryEntry } from "./contracts";

export const bikeSport: SportRegistryEntry = {
  category: "bike",
  displayName: "Bike",
  stepDefaults: {
    warmupName: "Warm-up",
    cooldownName: "Cool-down",
    mainStepPrefix: "Interval",
    warmupDuration: { type: "time", seconds: 600 },
    mainDuration: { type: "time", seconds: 1200 },
    cooldownDuration: { type: "time", seconds: 300 },
    warmupTarget: { type: "%FTP", intensity: 60 },
    mainTarget: { type: "%FTP", intensity: 80 },
    cooldownTarget: { type: "%FTP", intensity: 55 },
  },
  load: {
    duration: {
      paceSecondsPerKm: 120,
      secondsPerRep: 10,
      untilFinishedSeconds: 300,
    },
    route: {
      baseSpeedMps: 8.5,
      typicalSpeeds: {
        easy: 7.0,
        moderate: 8.5,
        hard: 10.0,
      },
    },
    template: {
      avgIF: 0.75,
      avgDuration: 3600,
      avgTSS: 60,
    },
  },
};
