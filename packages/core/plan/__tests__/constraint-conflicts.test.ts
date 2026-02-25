import { describe, expect, it } from "vitest";
import { resolveConstraintConflicts } from "../resolveConstraintConflicts";

describe("resolveConstraintConflicts", () => {
  it("attributes blocking conflicts with deterministic field paths and suggestions", () => {
    const result = resolveConstraintConflicts({
      availability_training_days: 3,
      user_constraints: {
        min_sessions_per_week: 4,
        max_sessions_per_week: 5,
      },
    });

    expect(result.is_blocking).toBe(true);
    expect(result.conflicts.map((conflict) => conflict.code)).toEqual([
      "min_sessions_exceeds_available_days",
      "max_sessions_exceeds_available_days",
    ]);

    expect(result.conflicts[0]?.field_paths).toEqual([
      "constraints.min_sessions_per_week",
      "availability_config.days",
      "constraints.hard_rest_days",
    ]);
    expect(result.conflicts[1]?.suggestions).toContain(
      "Reduce maximum sessions",
    );
  });

  it("keeps precedence deterministic between user, suggested, and default values", () => {
    const result = resolveConstraintConflicts({
      availability_training_days: 6,
      user_constraints: {
        min_sessions_per_week: 4,
      },
      confirmed_suggestions: {
        max_sessions_per_week: 5,
      },
      defaults: {
        hard_rest_days: ["sunday"],
      },
    });

    expect(result.precedence).toEqual({
      hard_rest_days: "default",
      min_sessions_per_week: "user",
      max_sessions_per_week: "suggested",
      max_single_session_duration_minutes: "default",
      goal_difficulty_preference: "default",
    });
    expect(result.is_blocking).toBe(false);
  });
});
