-- Migration: Insert training plan system templates into database
-- Replaces hardcoded PLAN_TEMPLATES from @repo/core

-- First, clear any existing system templates to ensure clean state
DELETE FROM training_plans WHERE is_system_template = true;

-- Insert system templates (using slug as ID for consistency with discover tab navigation)
INSERT INTO training_plans (id, is_system_template, template_visibility, name, description, structure, is_active, likes_count)
VALUES 
(
  'marathon_beginner'::uuid,
  true,
  'public',
  'Marathon - Beginner',
  '16-18 week plan for first-time marathoners focusing on building endurance safely',
  '{"sport": ["running"], "experienceLevel": ["beginner"], "durationWeeks": {"min": 16, "max": 20, "recommended": 18}, "phases": [{"name": "Base Building", "phase": "base", "weeksPercentage": 0.35, "description": "Build aerobic foundation with easy miles"}, {"name": "Build Phase", "phase": "build", "weeksPercentage": 0.45, "description": "Introduce tempo runs and longer long runs"}, {"name": "Taper", "phase": "taper", "weeksPercentage": 0.2, "description": "Reduce volume while maintaining intensity"}]}'::jsonb,
  true,
  0
),
(
  'marathon_intermediate'::uuid,
  true,
  'public',
  'Marathon - Intermediate',
  '16-18 week plan for runners with marathon experience seeking improvement',
  '{"sport": ["running"], "experienceLevel": ["intermediate"], "durationWeeks": {"min": 16, "max": 20, "recommended": 18}, "phases": [{"name": "Base Building", "phase": "base", "weeksPercentage": 0.25, "description": "Rebuild aerobic base"}, {"name": "Build Phase 1", "phase": "build", "weeksPercentage": 0.3, "description": "Increase volume with tempo and threshold work"}, {"name": "Build Phase 2", "phase": "build", "weeksPercentage": 0.3, "description": "Peak volume with race-specific workouts"}, {"name": "Taper", "phase": "taper", "weeksPercentage": 0.15, "description": "Sharpen for race day"}]}'::jsonb,
  true,
  0
),
(
  'marathon_advanced'::uuid,
  true,
  'public',
  'Marathon - Advanced',
  '18-24 week plan for competitive marathoners',
  '{"sport": ["running"], "experienceLevel": ["advanced"], "durationWeeks": {"min": 18, "max": 24, "recommended": 20}, "phases": [{"name": "Base Building", "phase": "base", "weeksPercentage": 0.3, "description": "High-volume aerobic base"}, {"name": "Build Phase 1", "phase": "build", "weeksPercentage": 0.25, "description": "Lactate threshold development"}, {"name": "Build Phase 2", "phase": "build", "weeksPercentage": 0.25, "description": "Race-specific marathon pace work"}, {"name": "Peak", "phase": "peak", "weeksPercentage": 0.1, "description": "Final race sharpening"}, {"name": "Taper", "phase": "taper", "weeksPercentage": 0.1, "description": "Rest and recovery before race"}]}'::jsonb,
  true,
  0
),
(
  'half_marathon'::uuid,
  true,
  'public',
  'Half Marathon',
  '12-14 week plan for half marathon',
  '{"sport": ["running"], "experienceLevel": ["beginner", "intermediate"], "durationWeeks": {"min": 10, "max": 14, "recommended": 12}, "phases": [{"name": "Base Building", "phase": "base", "weeksPercentage": 0.35, "description": "Build endurance foundation"}, {"name": "Build Phase", "phase": "build", "weeksPercentage": 0.5, "description": "Increase intensity and volume"}, {"name": "Taper", "phase": "taper", "weeksPercentage": 0.15, "description": "Peak for race day"}]}'::jsonb,
  true,
  0
),
(
  '5k_10k'::uuid,
  true,
  'public',
  '5K/10K',
  '8-12 week plan for 5K or 10K races',
  '{"sport": ["running"], "experienceLevel": ["beginner", "intermediate", "advanced"], "durationWeeks": {"min": 8, "max": 12, "recommended": 10}, "phases": [{"name": "Base", "phase": "base", "weeksPercentage": 0.3, "description": "Aerobic foundation"}, {"name": "Build", "phase": "build", "weeksPercentage": 0.55, "description": "VO2max and speed work"}, {"name": "Taper", "phase": "taper", "weeksPercentage": 0.15, "description": "Race preparation"}]}'::jsonb,
  true,
  0
),
(
  'cycling_century'::uuid,
  true,
  'public',
  'Century Ride (100 miles)',
  '12-16 week plan for century ride',
  '{"sport": ["cycling"], "experienceLevel": ["intermediate"], "durationWeeks": {"min": 12, "max": 16, "recommended": 14}, "phases": [{"name": "Base", "phase": "base", "weeksPercentage": 0.35, "description": "Build endurance with long rides"}, {"name": "Build", "phase": "build", "weeksPercentage": 0.5, "description": "Increase ride duration and climbing"}, {"name": "Taper", "phase": "taper", "weeksPercentage": 0.15, "description": "Recovery before event"}]}'::jsonb,
  true,
  0
),
(
  'cycling_gran_fondo'::uuid,
  true,
  'public',
  'Gran Fondo',
  '16-20 week plan for competitive gran fondo',
  '{"sport": ["cycling"], "experienceLevel": ["intermediate", "advanced"], "durationWeeks": {"min": 16, "max": 20, "recommended": 18}, "phases": [{"name": "Base", "phase": "base", "weeksPercentage": 0.35, "description": "Endurance and climbing volume"}, {"name": "Build", "phase": "build", "weeksPercentage": 0.45, "description": "Threshold and sustained power"}, {"name": "Taper", "phase": "taper", "weeksPercentage": 0.2, "description": "Peak for event day"}]}'::jsonb,
  true,
  0
),
(
  'triathlon_sprint'::uuid,
  true,
  'public',
  'Sprint Triathlon',
  '8-12 week sprint triathlon plan',
  '{"sport": ["triathlon", "running", "cycling", "swimming"], "experienceLevel": ["beginner", "intermediate"], "durationWeeks": {"min": 8, "max": 12, "recommended": 10}, "phases": [{"name": "Base", "phase": "base", "weeksPercentage": 0.3, "description": "Build fitness across all three sports"}, {"name": "Build", "phase": "build", "weeksPercentage": 0.55, "description": "Race-specific intensity and brick workouts"}, {"name": "Taper", "phase": "taper", "weeksPercentage": 0.15, "description": "Rest for race day"}]}'::jsonb,
  true,
  0
),
(
  'triathlon_olympic'::uuid,
  true,
  'public',
  'Olympic Triathlon',
  '12-16 week olympic distance plan',
  '{"sport": ["triathlon", "running", "cycling", "swimming"], "experienceLevel": ["intermediate"], "durationWeeks": {"min": 12, "max": 16, "recommended": 14}, "phases": [{"name": "Base", "phase": "base", "weeksPercentage": 0.3, "description": "Aerobic development in all disciplines"}, {"name": "Build", "phase": "build", "weeksPercentage": 0.55, "description": "Threshold work and race simulation"}, {"name": "Taper", "phase": "taper", "weeksPercentage": 0.15, "description": "Final preparation"}]}'::jsonb,
  true,
  0
),
(
  'triathlon_half_ironman'::uuid,
  true,
  'public',
  'Half Ironman (70.3)',
  '16-20 week half ironman plan',
  '{"sport": ["triathlon", "running", "cycling", "swimming"], "experienceLevel": ["intermediate", "advanced"], "durationWeeks": {"min": 16, "max": 20, "recommended": 18}, "phases": [{"name": "Base", "phase": "base", "weeksPercentage": 0.35, "description": "Build endurance volume"}, {"name": "Build Phase 1", "phase": "build", "weeksPercentage": 0.3, "description": "Increase volume across all sports"}, {"name": "Build Phase 2", "phase": "build", "weeksPercentage": 0.25, "description": "Race-specific long sessions"}, {"name": "Taper", "phase": "taper", "weeksPercentage": 0.1, "description": "Recovery before race"}]}'::jsonb,
  true,
  0
),
(
  'triathlon_ironman'::uuid,
  true,
  'public',
  'Ironman',
  '20-28 week full ironman plan',
  '{"sport": ["triathlon", "running", "cycling", "swimming"], "experienceLevel": ["advanced"], "durationWeeks": {"min": 20, "max": 28, "recommended": 24}, "phases": [{"name": "Base", "phase": "base", "weeksPercentage": 0.35, "description": "Massive aerobic base building"}, {"name": "Build Phase 1", "phase": "build", "weeksPercentage": 0.25, "description": "Volume increase"}, {"name": "Build Phase 2", "phase": "build", "weeksPercentage": 0.25, "description": "Peak volume and race rehearsals"}, {"name": "Peak", "phase": "peak", "weeksPercentage": 0.08, "description": "Final race-specific work"}, {"name": "Taper", "phase": "taper", "weeksPercentage": 0.07, "description": "Recovery and mental preparation"}]}'::jsonb,
  true,
  0
),
(
  'base_building'::uuid,
  true,
  'public',
  'Base Building',
  'Flexible base building phase (4-12 weeks)',
  '{"sport": ["running", "cycling", "triathlon", "swimming"], "experienceLevel": ["beginner", "intermediate", "advanced"], "durationWeeks": {"min": 4, "max": 12, "recommended": 8}, "phases": [{"name": "Base Building", "phase": "base", "weeksPercentage": 1.0, "description": "Build aerobic foundation"}]}'::jsonb,
  true,
  0
),
(
  'general_fitness'::uuid,
  true,
  'public',
  'General Fitness',
  'Maintain fitness without specific event goal',
  '{"sport": ["running", "cycling", "triathlon", "swimming", "strength"], "experienceLevel": ["beginner", "intermediate", "advanced"], "durationWeeks": {"min": 4, "max": 52, "recommended": 12}, "phases": [{"name": "General Fitness", "phase": "base", "weeksPercentage": 1.0, "description": "Consistent training for health and fitness"}]}'::jsonb,
  true,
  0
);
