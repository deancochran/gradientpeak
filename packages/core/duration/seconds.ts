import type { ActivityPlanDuration } from "../activity-plan/structure-schema";

export type ActivityPlanDurationSemantics = {
  exactElapsedSeconds: number | null;
  timedSeconds: number;
  restSeconds: number;
  distanceMeters: number;
  repetitionCount: number;
  open: boolean;
};

/** Describes the authored completion policy without inventing elapsed time. */
export function describeActivityPlanDuration(
  duration: ActivityPlanDuration,
  options?: { isRest?: boolean },
): ActivityPlanDurationSemantics {
  switch (duration.type) {
    case "time":
      return {
        exactElapsedSeconds: duration.seconds,
        timedSeconds: options?.isRest ? 0 : duration.seconds,
        restSeconds: options?.isRest ? duration.seconds : 0,
        distanceMeters: 0,
        repetitionCount: 0,
        open: false,
      };
    case "distance":
      return {
        exactElapsedSeconds: null,
        timedSeconds: 0,
        restSeconds: 0,
        distanceMeters: duration.meters,
        repetitionCount: 0,
        open: false,
      };
    case "repetitions":
      return {
        exactElapsedSeconds: null,
        timedSeconds: 0,
        restSeconds: 0,
        distanceMeters: 0,
        repetitionCount: duration.count,
        open: false,
      };
    case "untilFinished":
      return {
        exactElapsedSeconds: null,
        timedSeconds: 0,
        restSeconds: 0,
        distanceMeters: 0,
        repetitionCount: 0,
        open: true,
      };
  }
}

/** Returns elapsed time only when it is explicitly authored. */
export function getExactDurationSeconds(duration: ActivityPlanDuration): number | null {
  return duration.type === "time" ? duration.seconds : null;
}
