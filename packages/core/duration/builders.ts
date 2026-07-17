import type { ActivityPlanDuration } from "../activity-plan/v3-schema";

export const Duration = {
  seconds: (seconds: number): ActivityPlanDuration => ({ type: "time", seconds }),
  minutes: (minutes: number): ActivityPlanDuration => ({
    type: "time",
    seconds: minutes * 60,
  }),
  hours: (hours: number): ActivityPlanDuration => ({
    type: "time",
    seconds: hours * 3600,
  }),
  meters: (meters: number): ActivityPlanDuration => ({ type: "distance", meters }),
  km: (km: number): ActivityPlanDuration => ({
    type: "distance",
    meters: Math.round(km * 1000),
  }),
  reps: (count: number): ActivityPlanDuration => ({ type: "repetitions", count }),
  untilFinished: (): ActivityPlanDuration => ({ type: "untilFinished" }),
};
