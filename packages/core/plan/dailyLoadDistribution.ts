import type { AthletePreferenceProfile } from "../schemas/settings/profile_settings";
import type { DailyFocusRecoveryRange } from "./dailyFocusTemplates";
import { buildDailyLoadRecommendation } from "./dailyLoadRecommendation";
import type {
  DailyRecommendedLoadActivityCategory,
  DailyRecommendedLoadPrimaryFocus,
  DailyRecommendedLoadSession,
  DailyRecommendedLoadWeekday,
} from "./dailyRecommendedLoad";
import type { WeeklyAllocation } from "./weeklyAllocation";

export interface DailyLoadDistributionWeeklyTarget {
  weekStartDate: string;
  weekEndDate?: string;
  targetTss: number;
  phase?: string | null;
  eventDate?: string | null;
  recoveryRanges?: DailyFocusRecoveryRange[] | null;
}

export interface DailyLoadDistributionPoint {
  date: string;
  recommended_load_tss: number;
  primary_focus: DailyRecommendedLoadPrimaryFocus;
  activity_category: DailyRecommendedLoadActivityCategory;
  confidence: "low" | "medium" | "high";
  reason_codes: string[];
}

export type DailyLoadDistributionWeekday = DailyRecommendedLoadWeekday;

export interface DailyLoadDistributionAvailabilityWindow {
  start_minute_of_day: number;
  end_minute_of_day: number;
}

export interface DailyLoadDistributionAvailabilityDay {
  /** Weekday name, or number where 0 = Monday and 6 = Sunday. */
  day: DailyLoadDistributionWeekday;
  windows?: DailyLoadDistributionAvailabilityWindow[] | null;
  availableMinutes?: number | null;
  maxSessions?: number | null;
}

export interface DailyLoadDistributionSchedulingConstraints {
  /** Preferred training weekdays. Numeric values use the builder convention: 0 = Monday, 6 = Sunday. */
  preferredWeekdays?: DailyLoadDistributionWeekday[] | null;
  hardRestDays?: DailyLoadDistributionWeekday[] | null;
  minSessionsPerWeek?: number | null;
  maxSessionsPerWeek?: number | null;
  availabilityDays?: DailyLoadDistributionAvailabilityDay[] | null;
}

export interface DailyLoadDistributionCapacityContext {
  startingCtl?: number | null;
  startingAtl?: number | null;
  startingTsb?: number | null;
  readinessScore?: number | null;
}

export interface BuildDailyLoadDistributionInput {
  startDate: string;
  endDate: string;
  weeklyTargets: DailyLoadDistributionWeeklyTarget[];
  preferenceProfile?: AthletePreferenceProfile | null;
  weeklyAllocation?: WeeklyAllocation | null;
  plannedSessions?: DailyRecommendedLoadSession[] | null;
  schedulingConstraints?: DailyLoadDistributionSchedulingConstraints | null;
  capacityContext?: DailyLoadDistributionCapacityContext | null;
}

/**
 * Builds daily recommended load points from weekly projection targets and
 * profile-derived and explicit scheduling constraints.
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
