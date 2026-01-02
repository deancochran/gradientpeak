import { useMemo } from "react";
import { reduceIntensity, addRestDays, extendTimeline } from "../utils/training-adjustments";

export type SuggestionReason = "low_adherence" | "dangerous_tsb" | "timeline_risk";

export interface SmartSuggestion {
  reason: SuggestionReason;
  title: string;
  description: string;
  adjustedStructure: any;
  severity: "warning" | "alert";
}

interface UseSmartSuggestionsParams {
  plan?: any;
  status?: any;
  weeklySummaries?: any[];
}

/**
 * Hook to calculate smart adjustment suggestions based on training data
 * Only suggests when there's a clear, actionable problem
 */
export function useSmartSuggestions({
  plan,
  status,
  weeklySummaries,
}: UseSmartSuggestionsParams): SmartSuggestion | null {
  return useMemo(() => {
    if (!plan || !status) return null;

    const structure = plan.structure as any;

    // Check 1: Low Adherence (< 60% for 2+ weeks)
    if (weeklySummaries && weeklySummaries.length >= 2) {
      const recentWeeks = weeklySummaries.slice(-2);
      const avgAdherence =
        recentWeeks.reduce((sum, week) => sum + (week.activityPercentage || 0), 0) /
        recentWeeks.length;

      if (avgAdherence < 60) {
        return {
          reason: "low_adherence",
          title: "Low Training Adherence Detected",
          description: `Your adherence is ${Math.round(avgAdherence)}%. Consider reducing weekly targets to stay consistent.`,
          adjustedStructure: reduceIntensity(structure),
          severity: "warning",
        };
      }
    }

    // Check 2: Dangerous TSB (< -30 for current state)
    if (status.tsb < -30) {
      return {
        reason: "dangerous_tsb",
        title: "High Fatigue Detected",
        description: `Your TSB is ${status.tsb}, indicating high fatigue. Adding rest days is recommended.`,
        adjustedStructure: addRestDays(structure),
        severity: "alert",
      };
    }

    // Check 3: Timeline Risk (progress < 50% but > 75% time elapsed)
    if (structure.periodization_template?.target_date) {
      const targetDate = new Date(structure.periodization_template.target_date);
      const startDate = new Date(plan.created_at);
      const today = new Date();

      const totalDays = Math.floor(
        (targetDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      const elapsedDays = Math.floor(
        (today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      const timeProgress = totalDays > 0 ? (elapsedDays / totalDays) * 100 : 0;

      // Calculate fitness progress (CTL toward target)
      const startingCTL = structure.periodization_template.starting_ctl || 0;
      const targetCTL = structure.periodization_template.target_ctl || 0;
      const currentCTL = status.ctl || 0;

      const fitnessProgress =
        targetCTL > startingCTL
          ? ((currentCTL - startingCTL) / (targetCTL - startingCTL)) * 100
          : 100;

      // If we're 75%+ through time but less than 50% fitness progress
      if (timeProgress > 75 && fitnessProgress < 50 && targetDate > today) {
        return {
          reason: "timeline_risk",
          title: "Goal Timeline May Be Unrealistic",
          description: `You're ${Math.round(timeProgress)}% through the timeline but only ${Math.round(fitnessProgress)}% toward your fitness goal. Consider extending the target date.`,
          adjustedStructure: extendTimeline(structure),
          severity: "warning",
        };
      }
    }

    return null;
  }, [plan, status, weeklySummaries]);
}
