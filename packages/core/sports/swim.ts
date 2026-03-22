import type { SportRegistryEntry } from "./contracts";

export const swimSport: SportRegistryEntry = {
  category: "swim",
  displayName: "Swim",
  stepDefaults: {
    warmupName: "Easy Swim",
    cooldownName: "Easy Swim",
    mainStepPrefix: "Interval",
    warmupDuration: { type: "distance", meters: 200 },
    mainDuration: { type: "distance", meters: 400 },
    cooldownDuration: { type: "distance", meters: 100 },
    warmupTarget: { type: "RPE", intensity: 4 },
    mainTarget: { type: "RPE", intensity: 7 },
    cooldownTarget: { type: "RPE", intensity: 3 },
  },
  load: {
    duration: {
      paceSecondsPerKm: 1000,
      secondsPerRep: 10,
      untilFinishedSeconds: 300,
    },
    route: {
      baseSpeedMps: 1.2,
      typicalSpeeds: {
        easy: 1.0,
        moderate: 1.2,
        hard: 1.4,
      },
    },
    template: {
      avgIF: 0.7,
      avgDuration: 2400,
      avgTSS: 45,
    },
  },
};
