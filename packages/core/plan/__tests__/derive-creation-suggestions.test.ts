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

describe("deriveCreationSuggestions behavior control heuristics", () => {
  it("infers conservative behavior controls for no-history, low-signal contexts", () => {
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

    expect(suggestions.behavior_controls_v1.aggressiveness).toBeLessThan(0.4);
    expect(suggestions.behavior_controls_v1.spike_frequency).toBeLessThan(0.5);
    expect(suggestions.behavior_controls_v1.recovery_priority).toBeGreaterThan(
      0.55,
    );
  });

  it("infers higher aggressiveness for rich-history, high-signal contexts", () => {
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

    expect(aggressive.behavior_controls_v1.aggressiveness).toBeGreaterThan(
      conservative.behavior_controls_v1.aggressiveness,
    );
    expect(aggressive.behavior_controls_v1.spike_frequency).toBeGreaterThan(
      conservative.behavior_controls_v1.spike_frequency,
    );
    expect(
      aggressive.behavior_controls_v1.starting_fitness_confidence,
    ).toBeGreaterThan(
      conservative.behavior_controls_v1.starting_fitness_confidence,
    );
  });

  it("reports locked behavior-control conflicts when existing values differ", () => {
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
        behavior_controls_v1: {
          aggressiveness: 0,
          variability: 0,
          spike_frequency: 0,
          shape_target: -1,
          shape_strength: 0,
          recovery_priority: 1,
          starting_fitness_confidence: 0,
        },
      },
      locks: {
        behavior_controls_v1: { locked: true, locked_by: "user" },
      },
    });

    expect(suggestions.locked_conflicts).toContain(
      "behavior_controls_v1_locked_differs_from_suggestion",
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

  it("keeps youth and missing-dob contexts in a conservative mode", () => {
    const youth = deriveCreationSuggestions({
      context: buildContext({
        is_youth: true,
        user_age: 15,
      }),
    });
    const unknownAge = deriveCreationSuggestions({
      context: buildContext({
        missing_required_onboarding_fields: ["dob"],
      }),
    });

    expect(
      youth.constraints.max_single_session_duration_minutes,
    ).toBeLessThanOrEqual(75);
    expect(youth.constraints.goal_difficulty_preference).toBe("conservative");
    expect(
      unknownAge.constraints.max_single_session_duration_minutes,
    ).toBeLessThanOrEqual(90);
    expect(unknownAge.recent_influence_action).toBe("disabled");
  });

  it("matches baseline fixture matrix acceptance ordering", () => {
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
          aggressivenessMax: 0.45,
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
          aggressivenessMin: 0.3,
          aggressivenessMax: 0.8,
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
          aggressivenessMin: 0.65,
        },
      },
    ] as const;

    for (const fixture of fixtures) {
      const suggestions = deriveCreationSuggestions({
        context: fixture.context,
      });

      if ("aggressivenessMin" in fixture.expected) {
        expect(
          suggestions.behavior_controls_v1.aggressiveness,
          `${fixture.name} aggressiveness`,
        ).toBeGreaterThanOrEqual(fixture.expected.aggressivenessMin);
      }
      if ("aggressivenessMax" in fixture.expected) {
        expect(
          suggestions.behavior_controls_v1.aggressiveness,
          `${fixture.name} aggressiveness`,
        ).toBeLessThanOrEqual(fixture.expected.aggressivenessMax);
      }
    }
  });
});
