import {
  buildDailyLoadRecommendation,
  type DailyLoadRecommendationActivityCategory,
  type DailyLoadRecommendationActualOrScheduledPoint,
  type DailyLoadRecommendationPoint,
  type DailyLoadRecommendationPrimaryFocus,
  type DailyLoadRecommendationSession,
  type DailyLoadRecommendationWeekday,
  type DailyLoadRecommendationWeeklyTarget,
} from "./dailyLoadRecommendation";

export type DailyRecommendedLoadActivityCategory = DailyLoadRecommendationActivityCategory;
export type DailyRecommendedLoadPrimaryFocus = DailyLoadRecommendationPrimaryFocus;
export type DailyRecommendedLoadWeekday = DailyLoadRecommendationWeekday;
export type DailyRecommendedLoadWeeklyTarget = DailyLoadRecommendationWeeklyTarget;
export type DailyRecommendedLoadSession = DailyLoadRecommendationSession;
export type DailyRecommendedLoadActualOrScheduledPoint =
  DailyLoadRecommendationActualOrScheduledPoint;
export type DailyRecommendedLoadPoint = DailyLoadRecommendationPoint;

export interface BuildDailyRecommendedLoadInput {
  startDate: string;
  endDate: string;
  weeklyTargets: DailyRecommendedLoadWeeklyTarget[];
  sessions?: DailyRecommendedLoadSession[];
  preferredWeekdays?: DailyRecommendedLoadWeekday[] | null;
  hardRestDays?: DailyRecommendedLoadWeekday[] | null;
  scheduledLoads?: DailyRecommendedLoadActualOrScheduledPoint[] | null;
  completedLoads?: DailyRecommendedLoadActualOrScheduledPoint[] | null;
}

export function buildDailyRecommendedLoad(
  input: BuildDailyRecommendedLoadInput,
): DailyRecommendedLoadPoint[] {
  return buildDailyLoadRecommendation({ mode: "recommended-load", ...input });
}
