import type { DurationV2 } from "../schemas/activity_plan_v2";

export const Duration = {
  seconds: (seconds: number): DurationV2 => ({ type: "time", seconds }),
  minutes: (minutes: number): DurationV2 => ({
    type: "time",
    seconds: minutes * 60,
  }),
  hours: (hours: number): DurationV2 => ({
    type: "time",
    seconds: hours * 3600,
  }),
  meters: (meters: number): DurationV2 => ({ type: "distance", meters }),
  km: (km: number): DurationV2 => ({
    type: "distance",
    meters: Math.round(km * 1000),
  }),
  reps: (count: number): DurationV2 => ({ type: "repetitions", count }),
  untilFinished: (): DurationV2 => ({ type: "untilFinished" }),
};
