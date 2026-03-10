import { normalizeLinkedActivityPlanId } from "./template-ids";

export type SystemTrainingPlanTemplate = {
  id: string;
  name: string;
  description: string;
  sessions_per_week_target: number;
  duration_hours: number;
  structure: Record<string, unknown>;
};

const RAW_SAMPLE_PLANS: SystemTrainingPlanTemplate[] = [
  {
    id: "6a6f5a93-b8f3-4fca-9d4f-56a55b913001",
    name: "Marathon Foundation (12 weeks)",
    description:
      "Progressive marathon base with four key sessions per week and one weekly long run.",
    sessions_per_week_target: 4,
    duration_hours: 8.5,
    structure: {
      version: 1,
      start_date: "2026-01-05",
      target_weekly_tss_min: 280,
      target_weekly_tss_max: 420,
      target_activities_per_week: 4,
      max_consecutive_days: 3,
      min_rest_days_per_week: 2,
      sessions: [
        {
          offset_days: 1,
          title: "Easy Run",
          session_type: "planned",
          activity_plan_id: "1b4c5d6e-7f8a-9b0c-1d2e-3f4a5b6c7d8e",
        },
        {
          offset_days: 3,
          title: "Tempo Run",
          session_type: "planned",
          activity_plan_id: "b6c2d5e4-9f3a-8b7c-2d1e-3f0a6b5c4d2f",
        },
        {
          offset_days: 5,
          title: "Steady Run",
          session_type: "planned",
          activity_plan_id: "1b4c5d6e-7f8a-9b0c-1d2e-3f4a5b6c7d8e",
        },
        {
          offset_days: 6,
          title: "Long Run",
          session_type: "planned",
          activity_plan_id: "d8e4f7a6-1b5c-0d9e-4f3a-5b2c8d7e6f4b",
        },
        {
          offset_days: 8,
          title: "Easy Run",
          session_type: "planned",
          activity_plan_id: "1b4c5d6e-7f8a-9b0c-1d2e-3f4a5b6c7d8e",
        },
        {
          offset_days: 10,
          title: "Progression Run",
          session_type: "planned",
          activity_plan_id: "b6c2d5e4-9f3a-8b7c-2d1e-3f0a6b5c4d2f",
        },
        {
          offset_days: 12,
          title: "Steady Run",
          session_type: "planned",
          activity_plan_id: "1b4c5d6e-7f8a-9b0c-1d2e-3f4a5b6c7d8e",
        },
        {
          offset_days: 13,
          title: "Long Run",
          session_type: "planned",
          activity_plan_id: "d8e4f7a6-1b5c-0d9e-4f3a-5b2c8d7e6f4b",
        },
        {
          offset_days: 15,
          title: "Easy Run",
          session_type: "planned",
          activity_plan_id: "1b4c5d6e-7f8a-9b0c-1d2e-3f4a5b6c7d8e",
        },
        {
          offset_days: 17,
          title: "Tempo Run",
          session_type: "planned",
          activity_plan_id: "b6c2d5e4-9f3a-8b7c-2d1e-3f0a6b5c4d2f",
        },
        {
          offset_days: 19,
          title: "Steady Run",
          session_type: "planned",
          activity_plan_id: "1b4c5d6e-7f8a-9b0c-1d2e-3f4a5b6c7d8e",
        },
        {
          offset_days: 20,
          title: "Long Run",
          session_type: "planned",
          activity_plan_id: "d8e4f7a6-1b5c-0d9e-4f3a-5b2c8d7e6f4b",
        },
        {
          offset_days: 22,
          title: "Easy Run",
          session_type: "planned",
          activity_plan_id: "1b4c5d6e-7f8a-9b0c-1d2e-3f4a5b6c7d8e",
        },
        {
          offset_days: 24,
          title: "Progression Run",
          session_type: "planned",
          activity_plan_id: "b6c2d5e4-9f3a-8b7c-2d1e-3f0a6b5c4d2f",
        },
        {
          offset_days: 26,
          title: "Steady Run",
          session_type: "planned",
          activity_plan_id: "1b4c5d6e-7f8a-9b0c-1d2e-3f4a5b6c7d8e",
        },
        {
          offset_days: 27,
          title: "Long Run",
          session_type: "planned",
          activity_plan_id: "d8e4f7a6-1b5c-0d9e-4f3a-5b2c8d7e6f4b",
        },
      ],
    },
  },
  {
    id: "6a6f5a93-b8f3-4fca-9d4f-56a55b913002",
    name: "Half Marathon Build (10 weeks)",
    description:
      "Balanced half-marathon cycle with threshold development and race-specific long efforts.",
    sessions_per_week_target: 4,
    duration_hours: 7.5,
    structure: {
      version: 1,
      start_date: "2026-02-02",
      target_weekly_tss_min: 240,
      target_weekly_tss_max: 360,
      target_activities_per_week: 4,
      max_consecutive_days: 3,
      min_rest_days_per_week: 2,
      sessions: [
        {
          offset_days: 1,
          title: "Aerobic Run",
          session_type: "planned",
          activity_plan_id: "1b4c5d6e-7f8a-9b0c-1d2e-3f4a5b6c7d8e",
        },
        {
          offset_days: 3,
          title: "Threshold Intervals",
          session_type: "planned",
          activity_plan_id: "c7d3e6f5-0a4b-9c8d-3e2f-4a1b7c6d5e3a",
        },
        {
          offset_days: 5,
          title: "Easy Run",
          session_type: "planned",
          activity_plan_id: "1b4c5d6e-7f8a-9b0c-1d2e-3f4a5b6c7d8e",
        },
        {
          offset_days: 6,
          title: "Long Run",
          session_type: "planned",
          activity_plan_id: "d8e4f7a6-1b5c-0d9e-4f3a-5b2c8d7e6f4b",
        },
        {
          offset_days: 8,
          title: "Aerobic Run",
          session_type: "planned",
          activity_plan_id: "1b4c5d6e-7f8a-9b0c-1d2e-3f4a5b6c7d8e",
        },
        {
          offset_days: 10,
          title: "Tempo Run",
          session_type: "planned",
          activity_plan_id: "b6c2d5e4-9f3a-8b7c-2d1e-3f0a6b5c4d2f",
        },
        {
          offset_days: 12,
          title: "Easy Run",
          session_type: "planned",
          activity_plan_id: "1b4c5d6e-7f8a-9b0c-1d2e-3f4a5b6c7d8e",
        },
        {
          offset_days: 13,
          title: "Long Run",
          session_type: "planned",
          activity_plan_id: "d8e4f7a6-1b5c-0d9e-4f3a-5b2c8d7e6f4b",
        },
        {
          offset_days: 15,
          title: "Aerobic Run",
          session_type: "planned",
          activity_plan_id: "1b4c5d6e-7f8a-9b0c-1d2e-3f4a5b6c7d8e",
        },
        {
          offset_days: 17,
          title: "Threshold Intervals",
          session_type: "planned",
          activity_plan_id: "c7d3e6f5-0a4b-9c8d-3e2f-4a1b7c6d5e3a",
        },
        {
          offset_days: 19,
          title: "Easy Run",
          session_type: "planned",
          activity_plan_id: "1b4c5d6e-7f8a-9b0c-1d2e-3f4a5b6c7d8e",
        },
        {
          offset_days: 20,
          title: "Race-Pace Long Run",
          session_type: "planned",
          activity_plan_id: "d8e4f7a6-1b5c-0d9e-4f3a-5b2c8d7e6f4b",
        },
      ],
    },
  },
  {
    id: "6a6f5a93-b8f3-4fca-9d4f-56a55b913003",
    name: "5K Speed Block (8 weeks)",
    description:
      "Short race cycle emphasizing quality intervals, neuromuscular speed, and recovery balance.",
    sessions_per_week_target: 4,
    duration_hours: 6,
    structure: {
      version: 1,
      start_date: "2026-03-02",
      target_weekly_tss_min: 200,
      target_weekly_tss_max: 300,
      target_activities_per_week: 4,
      max_consecutive_days: 2,
      min_rest_days_per_week: 2,
      sessions: [
        {
          offset_days: 1,
          title: "Easy Run",
          session_type: "planned",
          activity_plan_id: "1b4c5d6e-7f8a-9b0c-1d2e-3f4a5b6c7d8e",
        },
        {
          offset_days: 3,
          title: "VO2 Intervals",
          session_type: "planned",
          activity_plan_id: "0a3b4c5d-6e7f-8a9b-0c1d-2e3f4a5b6c7d",
        },
        {
          offset_days: 5,
          title: "Easy Run",
          session_type: "planned",
          activity_plan_id: "1b4c5d6e-7f8a-9b0c-1d2e-3f4a5b6c7d8e",
        },
        {
          offset_days: 6,
          title: "Speed Session",
          session_type: "planned",
          activity_plan_id: "0a3b4c5d-6e7f-8a9b-0c1d-2e3f4a5b6c7d",
        },
        {
          offset_days: 8,
          title: "Easy Run",
          session_type: "planned",
          activity_plan_id: "1b4c5d6e-7f8a-9b0c-1d2e-3f4a5b6c7d8e",
        },
        {
          offset_days: 10,
          title: "Threshold Repeats",
          session_type: "planned",
          activity_plan_id: "c7d3e6f5-0a4b-9c8d-3e2f-4a1b7c6d5e3a",
        },
        {
          offset_days: 12,
          title: "Easy Run",
          session_type: "planned",
          activity_plan_id: "1b4c5d6e-7f8a-9b0c-1d2e-3f4a5b6c7d8e",
        },
        {
          offset_days: 13,
          title: "Race-Pace Session",
          session_type: "planned",
          activity_plan_id: "4c7d8e9f-0a1b-2c3d-4e5f-6a7b8c9d0e1f",
        },
        {
          offset_days: 15,
          title: "Easy Run",
          session_type: "planned",
          activity_plan_id: "1b4c5d6e-7f8a-9b0c-1d2e-3f4a5b6c7d8e",
        },
        {
          offset_days: 17,
          title: "VO2 Intervals",
          session_type: "planned",
          activity_plan_id: "0a3b4c5d-6e7f-8a9b-0c1d-2e3f4a5b6c7d",
        },
        {
          offset_days: 19,
          title: "Easy Run",
          session_type: "planned",
          activity_plan_id: "1b4c5d6e-7f8a-9b0c-1d2e-3f4a5b6c7d8e",
        },
        {
          offset_days: 20,
          title: "Time Trial",
          session_type: "planned",
          activity_plan_id: "4c7d8e9f-0a1b-2c3d-4e5f-6a7b8c9d0e1f",
        },
      ],
    },
  },
  {
    id: "6a6f5a93-b8f3-4fca-9d4f-56a55b913004",
    name: "Cycling Endurance Builder (12 weeks)",
    description:
      "Endurance-focused bike progression with two quality rides and one long weekend ride.",
    sessions_per_week_target: 4,
    duration_hours: 9,
    structure: {
      version: 1,
      start_date: "2026-01-12",
      target_weekly_tss_min: 260,
      target_weekly_tss_max: 420,
      target_activities_per_week: 4,
      max_consecutive_days: 3,
      min_rest_days_per_week: 2,
      sessions: [
        {
          offset_days: 1,
          title: "Endurance Ride",
          session_type: "planned",
          activity_plan_id: "8c1d2e3f-4a5b-6c7d-8e9f-0a1b2c3d4e5f",
        },
        {
          offset_days: 3,
          title: "Sweet Spot Ride",
          session_type: "planned",
          activity_plan_id: "9d2e3f4a-5b6c-7d8e-9f0a-1b2c3d4e5f6a",
        },
        {
          offset_days: 5,
          title: "Recovery Spin",
          session_type: "planned",
          activity_plan_id: "9b2c3d4e-5f6a-7b8c-9d0e-1f2a3b4c5d6e",
        },
        {
          offset_days: 6,
          title: "Long Ride",
          session_type: "planned",
          activity_plan_id: "a5f1b4c3-8e2b-7a6d-1c0f-2e9d5b4a3c1e",
        },
        {
          offset_days: 8,
          title: "Endurance Ride",
          session_type: "planned",
          activity_plan_id: "8c1d2e3f-4a5b-6c7d-8e9f-0a1b2c3d4e5f",
        },
        {
          offset_days: 10,
          title: "Threshold Intervals",
          session_type: "planned",
          activity_plan_id: "1f4a5b6c-7d8e-9f0a-1b2c-3d4e5f6a7b8c",
        },
        {
          offset_days: 12,
          title: "Recovery Spin",
          session_type: "planned",
          activity_plan_id: "9b2c3d4e-5f6a-7b8c-9d0e-1f2a3b4c5d6e",
        },
        {
          offset_days: 13,
          title: "Long Ride",
          session_type: "planned",
          activity_plan_id: "a5f1b4c3-8e2b-7a6d-1c0f-2e9d5b4a3c1e",
        },
        {
          offset_days: 15,
          title: "Endurance Ride",
          session_type: "planned",
          activity_plan_id: "8c1d2e3f-4a5b-6c7d-8e9f-0a1b2c3d4e5f",
        },
        {
          offset_days: 17,
          title: "Sweet Spot Ride",
          session_type: "planned",
          activity_plan_id: "9d2e3f4a-5b6c-7d8e-9f0a-1b2c3d4e5f6a",
        },
        {
          offset_days: 19,
          title: "Recovery Spin",
          session_type: "planned",
          activity_plan_id: "9b2c3d4e-5f6a-7b8c-9d0e-1f2a3b4c5d6e",
        },
        {
          offset_days: 20,
          title: "Long Ride",
          session_type: "planned",
          activity_plan_id: "a5f1b4c3-8e2b-7a6d-1c0f-2e9d5b4a3c1e",
        },
      ],
    },
  },
  {
    id: "6a6f5a93-b8f3-4fca-9d4f-56a55b913005",
    name: "Sprint Triathlon Base (10 weeks)",
    description:
      "Triathlon starter cycle balancing swim, bike, run, and weekly brick practice.",
    sessions_per_week_target: 5,
    duration_hours: 8,
    structure: {
      version: 1,
      start_date: "2026-02-09",
      target_weekly_tss_min: 260,
      target_weekly_tss_max: 390,
      target_activities_per_week: 5,
      max_consecutive_days: 3,
      min_rest_days_per_week: 1,
      sessions: [
        {
          offset_days: 1,
          title: "Swim Technique",
          session_type: "planned",
          activity_plan_id: "6c9d0e1f-2a3b-4c5d-6e7f-8a9b0c1d2e3f",
        },
        {
          offset_days: 2,
          title: "Bike Endurance",
          session_type: "planned",
          activity_plan_id: "8c1d2e3f-4a5b-6c7d-8e9f-0a1b2c3d4e5f",
        },
        {
          offset_days: 4,
          title: "Run Intervals",
          session_type: "planned",
          activity_plan_id: "0a3b4c5d-6e7f-8a9b-0c1d-2e3f4a5b6c7d",
        },
        {
          offset_days: 5,
          title: "Swim Endurance",
          session_type: "planned",
          activity_plan_id: "7d0e1f2a-3b4c-5d6e-7f8a-9b0c1d2e3f4a",
        },
        {
          offset_days: 6,
          title: "Brick Session",
          session_type: "planned",
          activity_plan_id: "b6c2d5e4-9f3a-8b7c-2d1e-3f0a6b5c4d2f",
        },
        {
          offset_days: 8,
          title: "Swim Technique",
          session_type: "planned",
          activity_plan_id: "6c9d0e1f-2a3b-4c5d-6e7f-8a9b0c1d2e3f",
        },
        {
          offset_days: 9,
          title: "Bike Tempo",
          session_type: "planned",
          activity_plan_id: "0e3f4a5b-6c7d-8e9f-0a1b-2c3d4e5f6a7b",
        },
        {
          offset_days: 11,
          title: "Run Endurance",
          session_type: "planned",
          activity_plan_id: "d8e4f7a6-1b5c-0d9e-4f3a-5b2c8d7e6f4b",
        },
        {
          offset_days: 12,
          title: "Swim Endurance",
          session_type: "planned",
          activity_plan_id: "7d0e1f2a-3b4c-5d6e-7f8a-9b0c1d2e3f4a",
        },
        {
          offset_days: 13,
          title: "Brick Session",
          session_type: "planned",
          activity_plan_id: "b6c2d5e4-9f3a-8b7c-2d1e-3f0a6b5c4d2f",
        },
      ],
    },
  },
  {
    id: "6a6f5a93-b8f3-4fca-9d4f-56a55b913006",
    name: "General Fitness Maintenance (6 weeks)",
    description:
      "Low-friction maintenance template to stay consistent with mixed aerobic and strength sessions.",
    sessions_per_week_target: 3,
    duration_hours: 5.5,
    structure: {
      version: 1,
      start_date: "2026-01-05",
      target_weekly_tss_min: 180,
      target_weekly_tss_max: 280,
      target_activities_per_week: 3,
      max_consecutive_days: 2,
      min_rest_days_per_week: 2,
      sessions: [
        {
          offset_days: 1,
          title: "Aerobic Session",
          session_type: "planned",
          activity_plan_id: "7b0c1d2e-3f4a-5b6c-7d8e-9f0a1b2c3d4e",
        },
        {
          offset_days: 3,
          title: "Strength Session",
          session_type: "planned",
          activity_plan_id: "aaaa1111-2222-3333-4444-555555555555",
        },
        {
          offset_days: 5,
          title: "Long Easy Session",
          session_type: "planned",
          activity_plan_id: "d8e4f7a6-1b5c-0d9e-4f3a-5b2c8d7e6f4b",
        },
        {
          offset_days: 8,
          title: "Aerobic Session",
          session_type: "planned",
          activity_plan_id: "7b0c1d2e-3f4a-5b6c-7d8e-9f0a1b2c3d4e",
        },
        {
          offset_days: 10,
          title: "Strength Session",
          session_type: "planned",
          activity_plan_id: "aaaa1111-2222-3333-4444-555555555555",
        },
        {
          offset_days: 12,
          title: "Long Easy Session",
          session_type: "planned",
          activity_plan_id: "d8e4f7a6-1b5c-0d9e-4f3a-5b2c8d7e6f4b",
        },
        {
          offset_days: 15,
          title: "Aerobic Session",
          session_type: "planned",
          activity_plan_id: "7b0c1d2e-3f4a-5b6c-7d8e-9f0a1b2c3d4e",
        },
        {
          offset_days: 17,
          title: "Strength Session",
          session_type: "planned",
          activity_plan_id: "aaaa1111-2222-3333-4444-555555555555",
        },
        {
          offset_days: 19,
          title: "Long Easy Session",
          session_type: "planned",
          activity_plan_id: "d8e4f7a6-1b5c-0d9e-4f3a-5b2c8d7e6f4b",
        },
      ],
    },
  },
];

function normalizeStructureActivityPlanIds(
  value: unknown,
): Record<string, unknown> {
  const rewrite = (node: unknown): unknown => {
    if (Array.isArray(node)) {
      return node.map((item) => rewrite(item));
    }

    if (!node || typeof node !== "object") {
      return node;
    }

    const record = node as Record<string, unknown>;
    const output: Record<string, unknown> = {};

    for (const [key, rawValue] of Object.entries(record)) {
      if (key === "activity_plan_id" && typeof rawValue === "string") {
        output[key] = normalizeLinkedActivityPlanId(rawValue);
        continue;
      }

      output[key] = rewrite(rawValue);
    }

    return output;
  };

  return rewrite(value) as Record<string, unknown>;
}

export const ALL_SAMPLE_PLANS: SystemTrainingPlanTemplate[] =
  RAW_SAMPLE_PLANS.map((plan) => ({
    ...plan,
    structure: normalizeStructureActivityPlanIds(plan.structure),
  }));
