-- Remake canonical system training plan templates (option 1: deterministic overwrite).
-- This migration removes existing system templates and inserts a curated set
-- aligned to the current session-driven plan structure.

begin;

delete from public.training_plans
where is_system_template = true;

insert into public.training_plans (
  id,
  profile_id,
  is_system_template,
  template_visibility,
  is_public,
  name,
  description,
  structure,
  sessions_per_week_target,
  duration_hours
)
values
  (
    '6a6f5a93-b8f3-4fca-9d4f-56a55b913001',
    null,
    true,
    'public',
    true,
    'Marathon Foundation (12 weeks)',
    'Progressive marathon base with four key sessions per week and one weekly long run.',
    $$
    {
      "version": 1,
      "start_date": "2026-01-05",
      "target_weekly_tss_min": 280,
      "target_weekly_tss_max": 420,
      "target_activities_per_week": 4,
      "max_consecutive_days": 3,
      "min_rest_days_per_week": 2,
      "sessions": [
        { "offset_days": 1, "title": "Easy Run", "session_type": "planned" },
        { "offset_days": 3, "title": "Tempo Run", "session_type": "planned" },
        { "offset_days": 5, "title": "Steady Run", "session_type": "planned" },
        { "offset_days": 6, "title": "Long Run", "session_type": "planned" },

        { "offset_days": 8, "title": "Easy Run", "session_type": "planned" },
        { "offset_days": 10, "title": "Progression Run", "session_type": "planned" },
        { "offset_days": 12, "title": "Steady Run", "session_type": "planned" },
        { "offset_days": 13, "title": "Long Run", "session_type": "planned" },

        { "offset_days": 15, "title": "Easy Run", "session_type": "planned" },
        { "offset_days": 17, "title": "Tempo Run", "session_type": "planned" },
        { "offset_days": 19, "title": "Steady Run", "session_type": "planned" },
        { "offset_days": 20, "title": "Long Run", "session_type": "planned" },

        { "offset_days": 22, "title": "Easy Run", "session_type": "planned" },
        { "offset_days": 24, "title": "Progression Run", "session_type": "planned" },
        { "offset_days": 26, "title": "Steady Run", "session_type": "planned" },
        { "offset_days": 27, "title": "Long Run", "session_type": "planned" }
      ]
    }
    $$::jsonb,
    4,
    8.5
  ),
  (
    '6a6f5a93-b8f3-4fca-9d4f-56a55b913002',
    null,
    true,
    'public',
    true,
    'Half Marathon Build (10 weeks)',
    'Balanced half-marathon cycle with threshold development and race-specific long efforts.',
    $$
    {
      "version": 1,
      "start_date": "2026-02-02",
      "target_weekly_tss_min": 240,
      "target_weekly_tss_max": 360,
      "target_activities_per_week": 4,
      "max_consecutive_days": 3,
      "min_rest_days_per_week": 2,
      "sessions": [
        { "offset_days": 1, "title": "Aerobic Run", "session_type": "planned" },
        { "offset_days": 3, "title": "Threshold Intervals", "session_type": "planned" },
        { "offset_days": 5, "title": "Easy Run", "session_type": "planned" },
        { "offset_days": 6, "title": "Long Run", "session_type": "planned" },

        { "offset_days": 8, "title": "Aerobic Run", "session_type": "planned" },
        { "offset_days": 10, "title": "Tempo Run", "session_type": "planned" },
        { "offset_days": 12, "title": "Easy Run", "session_type": "planned" },
        { "offset_days": 13, "title": "Long Run", "session_type": "planned" },

        { "offset_days": 15, "title": "Aerobic Run", "session_type": "planned" },
        { "offset_days": 17, "title": "Threshold Intervals", "session_type": "planned" },
        { "offset_days": 19, "title": "Easy Run", "session_type": "planned" },
        { "offset_days": 20, "title": "Race-Pace Long Run", "session_type": "planned" }
      ]
    }
    $$::jsonb,
    4,
    7.5
  ),
  (
    '6a6f5a93-b8f3-4fca-9d4f-56a55b913003',
    null,
    true,
    'public',
    true,
    '5K Speed Block (8 weeks)',
    'Short race cycle emphasizing quality intervals, neuromuscular speed, and recovery balance.',
    $$
    {
      "version": 1,
      "start_date": "2026-03-02",
      "target_weekly_tss_min": 200,
      "target_weekly_tss_max": 300,
      "target_activities_per_week": 4,
      "max_consecutive_days": 2,
      "min_rest_days_per_week": 2,
      "sessions": [
        { "offset_days": 1, "title": "Easy Run", "session_type": "planned" },
        { "offset_days": 3, "title": "VO2 Intervals", "session_type": "planned" },
        { "offset_days": 5, "title": "Easy Run", "session_type": "planned" },
        { "offset_days": 6, "title": "Speed Session", "session_type": "planned" },

        { "offset_days": 8, "title": "Easy Run", "session_type": "planned" },
        { "offset_days": 10, "title": "Threshold Repeats", "session_type": "planned" },
        { "offset_days": 12, "title": "Easy Run", "session_type": "planned" },
        { "offset_days": 13, "title": "Race-Pace Session", "session_type": "planned" },

        { "offset_days": 15, "title": "Easy Run", "session_type": "planned" },
        { "offset_days": 17, "title": "VO2 Intervals", "session_type": "planned" },
        { "offset_days": 19, "title": "Easy Run", "session_type": "planned" },
        { "offset_days": 20, "title": "Time Trial", "session_type": "planned" }
      ]
    }
    $$::jsonb,
    4,
    6.0
  ),
  (
    '6a6f5a93-b8f3-4fca-9d4f-56a55b913004',
    null,
    true,
    'public',
    true,
    'Cycling Endurance Builder (12 weeks)',
    'Endurance-focused bike progression with two quality rides and one long weekend ride.',
    $$
    {
      "version": 1,
      "start_date": "2026-01-12",
      "target_weekly_tss_min": 260,
      "target_weekly_tss_max": 420,
      "target_activities_per_week": 4,
      "max_consecutive_days": 3,
      "min_rest_days_per_week": 2,
      "sessions": [
        { "offset_days": 1, "title": "Endurance Ride", "session_type": "planned" },
        { "offset_days": 3, "title": "Sweet Spot Ride", "session_type": "planned" },
        { "offset_days": 5, "title": "Recovery Spin", "session_type": "planned" },
        { "offset_days": 6, "title": "Long Ride", "session_type": "planned" },

        { "offset_days": 8, "title": "Endurance Ride", "session_type": "planned" },
        { "offset_days": 10, "title": "Threshold Intervals", "session_type": "planned" },
        { "offset_days": 12, "title": "Recovery Spin", "session_type": "planned" },
        { "offset_days": 13, "title": "Long Ride", "session_type": "planned" },

        { "offset_days": 15, "title": "Endurance Ride", "session_type": "planned" },
        { "offset_days": 17, "title": "Sweet Spot Ride", "session_type": "planned" },
        { "offset_days": 19, "title": "Recovery Spin", "session_type": "planned" },
        { "offset_days": 20, "title": "Long Ride", "session_type": "planned" }
      ]
    }
    $$::jsonb,
    4,
    9.0
  ),
  (
    '6a6f5a93-b8f3-4fca-9d4f-56a55b913005',
    null,
    true,
    'public',
    true,
    'Sprint Triathlon Base (10 weeks)',
    'Triathlon starter cycle balancing swim, bike, run, and weekly brick practice.',
    $$
    {
      "version": 1,
      "start_date": "2026-02-09",
      "target_weekly_tss_min": 260,
      "target_weekly_tss_max": 390,
      "target_activities_per_week": 5,
      "max_consecutive_days": 3,
      "min_rest_days_per_week": 1,
      "sessions": [
        { "offset_days": 1, "title": "Swim Technique", "session_type": "planned" },
        { "offset_days": 2, "title": "Bike Endurance", "session_type": "planned" },
        { "offset_days": 4, "title": "Run Intervals", "session_type": "planned" },
        { "offset_days": 5, "title": "Swim Endurance", "session_type": "planned" },
        { "offset_days": 6, "title": "Brick Session", "session_type": "planned" },

        { "offset_days": 8, "title": "Swim Technique", "session_type": "planned" },
        { "offset_days": 9, "title": "Bike Tempo", "session_type": "planned" },
        { "offset_days": 11, "title": "Run Endurance", "session_type": "planned" },
        { "offset_days": 12, "title": "Swim Endurance", "session_type": "planned" },
        { "offset_days": 13, "title": "Brick Session", "session_type": "planned" }
      ]
    }
    $$::jsonb,
    5,
    8.0
  ),
  (
    '6a6f5a93-b8f3-4fca-9d4f-56a55b913006',
    null,
    true,
    'public',
    true,
    'General Fitness Maintenance (6 weeks)',
    'Low-friction maintenance template to stay consistent with mixed aerobic and strength sessions.',
    $$
    {
      "version": 1,
      "start_date": "2026-01-05",
      "target_weekly_tss_min": 180,
      "target_weekly_tss_max": 280,
      "target_activities_per_week": 3,
      "max_consecutive_days": 2,
      "min_rest_days_per_week": 2,
      "sessions": [
        { "offset_days": 1, "title": "Aerobic Session", "session_type": "planned" },
        { "offset_days": 3, "title": "Strength Session", "session_type": "planned" },
        { "offset_days": 5, "title": "Long Easy Session", "session_type": "planned" },

        { "offset_days": 8, "title": "Aerobic Session", "session_type": "planned" },
        { "offset_days": 10, "title": "Strength Session", "session_type": "planned" },
        { "offset_days": 12, "title": "Long Easy Session", "session_type": "planned" },

        { "offset_days": 15, "title": "Aerobic Session", "session_type": "planned" },
        { "offset_days": 17, "title": "Strength Session", "session_type": "planned" },
        { "offset_days": 19, "title": "Long Easy Session", "session_type": "planned" }
      ]
    }
    $$::jsonb,
    3,
    5.5
  );

commit;
