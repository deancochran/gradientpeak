import {
  extendTimeline,
  type QuickAdjustmentPlanStructure,
  reduceIntensity,
} from "@repo/core/plan";
import { useMemo } from "react";

export type SuggestionReason = "low_adherence" | "load_balance_review" | "timeline_risk";

export interface SmartSuggestion {
  reason: SuggestionReason;
  title: string;
  description: string;
  adjustedStructure?: SmartPlanStructure;
  severity: "info" | "warning" | "alert";
}

interface UseSmartSuggestionsParams {
  plan?: { created_at: string; structure: SmartPlanStructure };
  status?: { longTermLoad?: number | null; loadBalance?: number | null };
  weeklySummaries?: Array<{ activityPercentage?: number | null }>;
}

type SmartPlanStructure = Partial<QuickAdjustmentPlanStructure> & {
  periodization_template?:
    | (NonNullable<QuickAdjustmentPlanStructure["periodization_template"]> & {
        starting_ctl?: number | null;
        target_ctl?: number | null;
      })
    | null;
};

/**
 * Hook to calculate smart adjustment suggestions based on training data
 * Only suggests when there's a clear, actionable problem
 */
export function useSmartSuggestions({
  plan,
  status,
  weeklySummaries,
}: UseSmartSuggestionsParams): SmartSuggestion | null {
  return useMemo(
    () =>
      deriveSmartSuggestion({
        ...(plan === undefined ? {} : { plan }),
        ...(status === undefined ? {} : { status }),
        ...(weeklySummaries === undefined ? {} : { weeklySummaries }),
      }),
    [plan, status, weeklySummaries],
  );
}

export function deriveSmartSuggestion({
  plan,
  status,
  weeklySummaries,
}: UseSmartSuggestionsParams): SmartSuggestion | null {
  if (!plan || !status) return null;

  const structure = plan.structure;

  // Check 1: Low Adherence (< 60% for 2+ weeks)
  if (weeklySummaries && weeklySummaries.length >= 2) {
    const recentWeeks = weeklySummaries.slice(-2);
    const avgAdherence =
      recentWeeks.reduce((sum, week) => sum + (week.activityPercentage || 0), 0) /
      recentWeeks.length;

    if (avgAdherence < 60) {
      const adjustedStructure = isQuickAdjustmentPlanStructure(structure)
        ? reduceIntensity(structure)
        : undefined;
      return {
        reason: "low_adherence",
        title: "Low Training Adherence Detected",
        description: `Your adherence is ${Math.round(avgAdherence)}%. Consider reducing weekly targets to stay consistent.`,
        ...(adjustedStructure === undefined ? {} : { adjustedStructure }),
        severity: "warning",
      };
    }
  }

  // Load Balance describes modeled load history only. Offer review, never physiological conclusions
  // or an automatic plan mutation.
  if (typeof status.loadBalance === "number" && status.loadBalance < -30) {
    return {
      reason: "load_balance_review",
      title: "Review recent training load",
      description:
        "Recent training load is well above the longer-term load trend. Review the plan before making any changes.",
      severity: "info",
    };
  }

  // Check 3: Timeline Risk (progress < 50% but > 75% time elapsed)
  if (structure.periodization_template?.target_date) {
    const targetDate = new Date(structure.periodization_template.target_date);
    const startDate = new Date(plan.created_at);
    const today = new Date();

    const totalDays = Math.floor(
      (targetDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
    );
    const elapsedDays = Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

    const timeProgress = totalDays > 0 ? (elapsedDays / totalDays) * 100 : 0;

    // Calculate fitness progress (CTL toward target)
    const startingCTL = structure.periodization_template.starting_ctl || 0;
    const targetCTL = structure.periodization_template.target_ctl || 0;
    const currentCTL = status.longTermLoad || 0;

    const fitnessProgress =
      targetCTL > startingCTL
        ? ((currentCTL - startingCTL) / (targetCTL - startingCTL)) * 100
        : 100;

    // If we're 75%+ through time but less than 50% fitness progress
    if (timeProgress > 75 && fitnessProgress < 50 && targetDate > today) {
      const adjustedStructure = isQuickAdjustmentPlanStructure(structure)
        ? extendTimeline(structure)
        : undefined;
      return {
        reason: "timeline_risk",
        title: "Goal Timeline May Be Unrealistic",
        description: `You're ${Math.round(timeProgress)}% through the timeline but only ${Math.round(fitnessProgress)}% toward your fitness goal. Consider extending the target date.`,
        ...(adjustedStructure === undefined ? {} : { adjustedStructure }),
        severity: "warning",
      };
    }
  }

  return null;
}

function isQuickAdjustmentPlanStructure(
  structure: SmartPlanStructure,
): structure is QuickAdjustmentPlanStructure & SmartPlanStructure {
  return (
    typeof structure.min_rest_days_per_week === "number" &&
    typeof structure.target_activities_per_week === "number" &&
    typeof structure.target_weekly_tss_max === "number" &&
    typeof structure.target_weekly_tss_min === "number"
  );
}
