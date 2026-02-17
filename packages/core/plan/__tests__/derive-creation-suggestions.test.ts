import { describe, expect, it } from "vitest";
import type { CreationContextSummary } from "../../schemas/training_plan_structure";
import { deriveCreationSuggestions } from "../deriveCreationSuggestions";

function buildContext(
  overrides: Partial<CreationContextSummary> = {},
): CreationContextSummary {
  return {
    history_availability_state: "sparse",
    recent_consistency_marker: "moderate",
    effort_confidence_marker: "moderate",
    profile_metric_completeness_marker: "moderate",
    signal_quality: 0.55,
    recommended_baseline_tss_range: { min: 60, max: 140 },
    recommended_recent_influence_range: { min: 0.2, max: 0.7 },
    recommended_sessions_per_week_range: { min: 3, max: 5 },
    rationale_codes: ["fixture"],
    ...overrides,
  };
}

describe("deriveCreationSuggestions cap heuristics", () => {
  it("infers conservative caps for no-history, low-signal contexts", () => {
    const suggestions = deriveCreationSuggestions({
      context: buildContext({
        history_availability_state: "none",
        signal_quality: 0.2,
        recent_consistency_marker: "low",
        effort_confidence_marker: "low",
        profile_metric_completeness_marker: "low",
        recommended_sessions_per_week_range: { min: 2, max: 3 },
      }),
    });

    expect(suggestions.max_weekly_tss_ramp_pct).toBeGreaterThanOrEqual(0);
    expect(suggestions.max_ctl_ramp_per_week).toBeGreaterThanOrEqual(0);
    expect(suggestions.max_weekly_tss_ramp_pct).toBeLessThan(6);
    expect(suggestions.max_ctl_ramp_per_week).toBeLessThan(2.5);
  });

  it("infers higher caps for rich-history, high-signal contexts", () => {
    const conservative = deriveCreationSuggestions({
      context: buildContext({
        history_availability_state: "none",
        signal_quality: 0.2,
        recent_consistency_marker: "low",
        effort_confidence_marker: "low",
        profile_metric_completeness_marker: "low",
        recommended_sessions_per_week_range: { min: 2, max: 3 },
      }),
    });

    const aggressive = deriveCreationSuggestions({
      context: buildContext({
        history_availability_state: "rich",
        signal_quality: 0.9,
        recent_consistency_marker: "high",
        effort_confidence_marker: "high",
        profile_metric_completeness_marker: "high",
        recommended_sessions_per_week_range: { min: 5, max: 7 },
      }),
    });

    expect(aggressive.max_weekly_tss_ramp_pct).toBeGreaterThan(
      conservative.max_weekly_tss_ramp_pct,
    );
    expect(aggressive.max_ctl_ramp_per_week).toBeGreaterThan(
      conservative.max_ctl_ramp_per_week,
    );
    expect(aggressive.max_weekly_tss_ramp_pct).toBeLessThanOrEqual(20);
    expect(aggressive.max_ctl_ramp_per_week).toBeLessThanOrEqual(8);
  });

  it("reports locked cap conflicts when existing values differ", () => {
    const context = buildContext({
      history_availability_state: "rich",
      signal_quality: 0.85,
      recent_consistency_marker: "high",
      effort_confidence_marker: "high",
      profile_metric_completeness_marker: "high",
      recommended_sessions_per_week_range: { min: 4, max: 6 },
    });

    const suggestions = deriveCreationSuggestions({
      context,
      existing_values: {
        max_weekly_tss_ramp_pct: 1,
        max_ctl_ramp_per_week: 0.5,
      },
      locks: {
        max_weekly_tss_ramp_pct: { locked: true, locked_by: "user" },
        max_ctl_ramp_per_week: { locked: true, locked_by: "user" },
      },
    });

    expect(suggestions.locked_conflicts).toContain(
      "max_weekly_tss_ramp_pct_locked_differs_from_suggestion",
    );
    expect(suggestions.locked_conflicts).toContain(
      "max_ctl_ramp_per_week_locked_differs_from_suggestion",
    );
  });

  it("derives session duration and rest days from context behavior cues", () => {
    const suggestions = deriveCreationSuggestions({
      context: buildContext({
        history_availability_state: "rich",
        signal_quality: 0.82,
        recommended_baseline_tss_range: { min: 360, max: 520 },
        recommended_sessions_per_week_range: { min: 5, max: 6 },
        rationale_codes: [
          "history_rich",
          "preferred_day_tuesday",
          "preferred_day_thursday",
        ],
      }),
    });

    expect(suggestions.constraints.max_single_session_duration_minutes).toBe(
      72,
    );
    expect(suggestions.constraints.hard_rest_days).not.toContain("tuesday");
    expect(suggestions.constraints.hard_rest_days).not.toContain("thursday");
  });

  it("matches baseline fixture matrix acceptance bands", () => {
    const fixtures = [
      {
        name: "none_history",
        context: buildContext({
          history_availability_state: "none",
          signal_quality: 0.2,
          recent_consistency_marker: "low",
          effort_confidence_marker: "low",
          profile_metric_completeness_marker: "low",
          recommended_sessions_per_week_range: { min: 2, max: 3 },
        }),
        expected: {
          weeklyRamp: { min: 3.4, max: 4.2 },
          ctlRamp: { min: 0.9, max: 1.6 },
        },
      },
      {
        name: "sparse_history",
        context: buildContext({
          history_availability_state: "sparse",
          signal_quality: 0.55,
          recent_consistency_marker: "moderate",
          effort_confidence_marker: "moderate",
          profile_metric_completeness_marker: "moderate",
          recommended_sessions_per_week_range: { min: 3, max: 5 },
        }),
        expected: {
          weeklyRamp: { min: 5.9, max: 6.7 },
          ctlRamp: { min: 2.2, max: 2.8 },
        },
      },
      {
        name: "rich_history",
        context: buildContext({
          history_availability_state: "rich",
          signal_quality: 0.9,
          recent_consistency_marker: "high",
          effort_confidence_marker: "high",
          profile_metric_completeness_marker: "high",
          recommended_sessions_per_week_range: { min: 5, max: 7 },
        }),
        expected: {
          weeklyRamp: { min: 9.6, max: 10.4 },
          ctlRamp: { min: 4.1, max: 4.7 },
        },
      },
    ] as const;

    for (const fixture of fixtures) {
      const suggestions = deriveCreationSuggestions({
        context: fixture.context,
      });

      expect(
        suggestions.max_weekly_tss_ramp_pct,
        `${fixture.name} weekly ramp`,
      ).toBeGreaterThanOrEqual(fixture.expected.weeklyRamp.min);
      expect(
        suggestions.max_weekly_tss_ramp_pct,
        `${fixture.name} weekly ramp`,
      ).toBeLessThanOrEqual(fixture.expected.weeklyRamp.max);
      expect(
        suggestions.max_ctl_ramp_per_week,
        `${fixture.name} CTL ramp`,
      ).toBeGreaterThanOrEqual(fixture.expected.ctlRamp.min);
      expect(
        suggestions.max_ctl_ramp_per_week,
        `${fixture.name} CTL ramp`,
      ).toBeLessThanOrEqual(fixture.expected.ctlRamp.max);
    }
  });
});
