import { describe, expect, it } from "vitest";
import type {
  GoalFormData,
  TrainingPlanConfigFormData,
} from "@/components/training-plan/create/SinglePageForm";
import { buildPreviewMinimalPlanFromForm } from "@repo/core";
import {
  buildMinimalTrainingPlanPayload,
  toCreationNormalizationInput,
} from "./index";

function buildConfigFixture(): TrainingPlanConfigFormData {
  return {
    availabilityConfig: {
      template: "moderate",
      days: [
        {
          day: "tuesday",
          windows: [{ start_minute_of_day: 360, end_minute_of_day: 480 }],
        },
      ],
    },
    availabilityProvenance: {
      source: "suggested",
      confidence: 0.8,
      rationale: ["fixture"],
      references: [],
      updated_at: "2026-01-01T00:00:00.000Z",
    },
    recentInfluenceScore: 0.66,
    recentInfluenceAction: "edited",
    recentInfluenceProvenance: {
      source: "user",
      confidence: 1,
      rationale: ["fixture"],
      references: [],
      updated_at: "2026-01-01T00:00:00.000Z",
    },
    constraints: {
      hard_rest_days: ["monday"],
      min_sessions_per_week: 3,
      max_sessions_per_week: 6,
      long_activity_days: ["saturday"],
      avoid_activity_days: ["friday"],
      preferred_activity_days: ["tuesday", "thursday"],
      available_days_per_week: ["tuesday", "wednesday", "thursday"],
      max_consecutive_training_days: 4,
      max_double_days_per_week: 1,
      min_rest_days_per_week: 1,
      goal_difficulty_preference: "balanced",
    },
    optimizationProfile: "balanced",
    postGoalRecoveryDays: 6,
    maxWeeklyTssRampPct: 9,
    maxCtlRampPerWeek: 4,
    constraintsSource: "user",
    locks: {
      availability_config: { locked: true, locked_by: "user" },
      recent_influence: { locked: false },
      hard_rest_days: { locked: true, locked_by: "user" },
      min_sessions_per_week: { locked: true, locked_by: "user" },
      optimization_profile: { locked: true, locked_by: "user" },
      post_goal_recovery_days: { locked: true, locked_by: "user" },
      max_weekly_tss_ramp_pct: { locked: true, locked_by: "user" },
      max_ctl_ramp_per_week: { locked: true, locked_by: "user" },
    },
  } as unknown as TrainingPlanConfigFormData;
}

function buildGoalFixture(): GoalFormData[] {
  return [
    {
      id: "goal-1",
      name: "  Spring Marathon  ",
      targetDate: "2026-05-01",
      priority: 1,
      targets: [
        {
          id: "target-1",
          targetType: "race_performance",
          activityCategory: "run",
          distanceKm: "42.2",
          completionTimeHms: "03:10:00",
        },
      ],
    },
  ];
}

describe("toCreationNormalizationInput", () => {
  it("maps config fields deterministically and preserves lock precedence", () => {
    const fixture = buildConfigFixture();
    const mapped = toCreationNormalizationInput(fixture);

    expect(mapped).toEqual({
      user_values: {
        availability_config: fixture.availabilityConfig,
        recent_influence: { influence_score: 0.66 },
        recent_influence_action: "edited",
        constraints: fixture.constraints,
        optimization_profile: "balanced",
        post_goal_recovery_days: 6,
        max_weekly_tss_ramp_pct: 9,
        max_ctl_ramp_per_week: 4,
        locks: fixture.locks,
      },
      provenance_overrides: {
        availability_provenance: fixture.availabilityProvenance,
        recent_influence_provenance: fixture.recentInfluenceProvenance,
      },
    });

    expect(mapped.user_values?.locks?.min_sessions_per_week?.locked_by).toBe(
      "user",
    );
  });

  it("does not send constraints as user overrides when not user-owned", () => {
    const fixture = buildConfigFixture();
    fixture.constraintsSource = "suggested";

    const mapped = toCreationNormalizationInput(fixture);

    expect(mapped.user_values?.constraints).toBeUndefined();
  });

  it("omits legacy mode/risk/policy payload fields", () => {
    const fixture = buildConfigFixture();

    const mapped = toCreationNormalizationInput(fixture);

    expect(mapped.user_values).not.toHaveProperty("mode");
    expect(mapped.user_values).not.toHaveProperty("risk_acceptance");
    expect(mapped.user_values).not.toHaveProperty("constraint_policy");
  });

  it("keeps creation-input parity for user-sourced availability", () => {
    const fixture = buildConfigFixture();
    fixture.availabilityProvenance.source = "user";
    fixture.locks.availability_config = { locked: false };

    const mapped = toCreationNormalizationInput(fixture);

    expect(mapped.user_values?.availability_config).toEqual(
      fixture.availabilityConfig,
    );
    expect(mapped.user_values).not.toHaveProperty("risk_acceptance");
    expect(mapped.provenance_overrides?.availability_provenance?.source).toBe(
      "user",
    );
  });
});

describe("buildMinimalTrainingPlanPayload", () => {
  it("normalizes payload and converts race target fields", () => {
    const payload = buildMinimalTrainingPlanPayload({
      planStartDate: "2026-01-05",
      goals: buildGoalFixture(),
    });

    expect(payload).toEqual({
      plan_start_date: "2026-01-05",
      goals: [
        {
          name: "Spring Marathon",
          target_date: "2026-05-01",
          priority: 1,
          targets: [
            {
              target_type: "race_performance",
              distance_m: 42200,
              target_time_s: 11400,
              activity_category: "run",
            },
          ],
        },
      ],
    });
  });

  it("keeps create and preview minimal payloads in parity", () => {
    const goals: GoalFormData[] = [
      {
        id: "goal-1",
        name: "Spring Marathon",
        targetDate: "2026-05-01",
        priority: 1,
        targets: [
          {
            id: "target-1",
            targetType: "race_performance",
            activityCategory: "run",
            distanceKm: "42.2",
            completionTimeHms: "03:10:00",
          },
          {
            id: "target-2",
            targetType: "pace_threshold",
            activityCategory: "run",
            paceMmSs: "04:15",
            testDurationHms: "00:20:00",
          },
        ],
      },
      {
        id: "goal-2",
        name: "FTP Block",
        targetDate: "2026-07-15",
        priority: 2,
        targets: [
          {
            id: "target-3",
            targetType: "power_threshold",
            activityCategory: "bike",
            targetWatts: 280,
            testDurationHms: "00:20:00",
          },
          {
            id: "target-4",
            targetType: "hr_threshold",
            targetLthrBpm: 168,
          },
        ],
      },
    ];

    const createPayload = buildMinimalTrainingPlanPayload({
      planStartDate: "2026-01-05",
      goals,
    });

    const previewPayload = buildPreviewMinimalPlanFromForm({
      planStartDate: "2026-01-05",
      goals: goals.map((goal) => ({
        name: goal.name,
        targetDate: goal.targetDate,
        priority: goal.priority,
        targets: goal.targets,
      })),
    });

    expect(previewPayload).toEqual(createPayload);
  });
});
