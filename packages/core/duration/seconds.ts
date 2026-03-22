import type { PublicActivityCategory } from "@repo/supabase";
import type { DurationV2 } from "../schemas/activity_plan_v2";
import {
  getSportDistancePaceSecondsPerKm,
  getSportSecondsPerRep,
  getSportUntilFinishedSeconds,
} from "../sports";

export interface DurationEstimateOptions {
  activityCategory?: PublicActivityCategory;
  paceSecondsPerKm?: number;
  secondsPerRep?: number;
  untilFinishedSeconds?: number;
}

export function getDurationSeconds(
  duration: DurationV2,
  options?: DurationEstimateOptions,
): number {
  const activityCategory = options?.activityCategory ?? "other";

  switch (duration.type) {
    case "time":
      return duration.seconds;
    case "distance": {
      const paceSecondsPerKm =
        options?.paceSecondsPerKm ?? getSportDistancePaceSecondsPerKm(activityCategory);
      return Math.round((duration.meters / 1000) * paceSecondsPerKm);
    }
    case "repetitions": {
      const secondsPerRep = options?.secondsPerRep ?? getSportSecondsPerRep(activityCategory);
      return duration.count * secondsPerRep;
    }
    case "untilFinished":
      return options?.untilFinishedSeconds ?? getSportUntilFinishedSeconds(activityCategory);
  }
}
