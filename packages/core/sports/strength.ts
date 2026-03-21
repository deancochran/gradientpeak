import type { SportRegistryEntry } from "./contracts";

export const strengthSport: SportRegistryEntry = {
  category: "strength",
  displayName: "Strength",
  stepDefaults: {
    warmupName: "Warm-up",
    cooldownName: "Cool-down",
    mainStepPrefix: "Exercise",
    warmupDuration: { type: "repetitions", count: 10 },
    mainDuration: { type: "repetitions", count: 10 },
    cooldownDuration: { type: "repetitions", count: 10 },
    warmupTarget: { type: "RPE", intensity: 7 },
    mainTarget: { type: "RPE", intensity: 7 },
    cooldownTarget: { type: "RPE", intensity: 7 },
  },
  load: {
    duration: {
      paceSecondsPerKm: 300,
      secondsPerRep: 10,
      untilFinishedSeconds: 300,
    },
    route: {
      baseSpeedMps: 0,
      typicalSpeeds: {
        easy: 0,
        moderate: 0,
        hard: 0,
      },
    },
    template: {
      avgIF: 0.65,
      avgDuration: 2700,
      avgTSS: 40,
    },
  },
};
