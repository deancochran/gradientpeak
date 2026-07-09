import type { AthletePreferenceProfile } from "../schemas/settings/profile_settings";
import { buildDailyLoadRecommendation } from "./dailyLoadRecommendation";
import type {
  DailyRecommendedLoadActivityCategory,
  DailyRecommendedLoadPrimaryFocus,
  DailyRecommendedLoadSession,
} from "./dailyRecommendedLoad";
import type { WeeklyAllocation } from "./weeklyAllocation";

export interface DailyLoadDistributionWeeklyTarget {
  weekStartDate: string;
  weekEndDate?: string;
  targetTss: number;
  phase?: string | null;
}

export interface DailyLoadDistributionPoint {
  date: string;
  recommended_load_tss: number;
  primary_focus: DailyRecommendedLoadPrimaryFocus;
  activity_category: DailyRecommendedLoadActivityCategory;
  confidence: "low" | "medium" | "high";
  reason_codes: string[];
}

export interface BuildDailyLoadDistributionInput {
  startDate: string;
  endDate: string;
  weeklyTargets: DailyLoadDistributionWeeklyTarget[];
  preferenceProfile?: AthletePreferenceProfile | null;
  weeklyAllocation?: WeeklyAllocation | null;
  plannedSessions?: DailyRecommendedLoadSession[] | null;
}

/**
 * Builds daily recommended load points from weekly projection targets and
 * profile-derived planning constraints.
 *
 * The returned load values are daily TSS values suitable for day-level charts;
 * weekly projection summaries should not be rendered as daily bars.
 */
export function buildDailyLoadDistribution(
  input: BuildDailyLoadDistributionInput,
): DailyLoadDistributionPoint[] {
  return buildDailyLoadRecommendation({ mode: "distribution", ...input }).map((point) => ({
    date: point.date,
    recommended_load_tss: point.recommendedLoadTss,
    primary_focus: point.primaryFocus,
    activity_category: point.activityCategory,
    confidence: point.confidence,
    reason_codes: point.reasonCodes,
  }));
}
