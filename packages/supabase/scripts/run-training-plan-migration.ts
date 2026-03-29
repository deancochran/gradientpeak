#!/usr/bin/env tsx
/**
 * Run training plan system templates migration
 *
 * Usage:
 *   pnpm tsx scripts/run-training-plan-migration.ts
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(__dirname, "../.env.local") });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error("❌ Missing environment variables");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);

async function main() {
  console.log("Running training plan system templates migration...");

  // First, change the id column to text type to support slug-based IDs
  console.log("Changing id column type to text...");

  // Use a transaction-like approach by executing multiple statements
  // Since we can't execute raw SQL directly, let's try a different approach:
  // Add a new column, populate it, then swap

  // Actually, let's try inserting with proper UUIDs generated for each template
  const templates = [
    {
      id: "00000000-0000-0000-0000-000000000001",
      name: "Marathon - Beginner",
      description:
        "16-18 week plan for first-time marathoners focusing on building endurance safely",
      sport: "running",
      experienceLevel: "beginner",
      durationWeeks: 18,
      phases: [
        {
          name: "Base Building",
          phase: "base",
          weeksPercentage: 0.35,
          description: "Build aerobic foundation with easy miles",
        },
        {
          name: "Build Phase",
          phase: "build",
          weeksPercentage: 0.45,
          description: "Introduce tempo runs and longer long runs",
        },
        {
          name: "Taper",
          phase: "taper",
          weeksPercentage: 0.2,
          description: "Reduce volume while maintaining intensity",
        },
      ],
    },
    {
      id: "00000000-0000-0000-0000-000000000002",
      name: "Marathon - Intermediate",
      description: "16-18 week plan for runners with marathon experience seeking improvement",
      sport: "running",
      experienceLevel: "intermediate",
      durationWeeks: 18,
      phases: [
        {
          name: "Base Building",
          phase: "base",
          weeksPercentage: 0.25,
          description: "Rebuild aerobic base",
        },
        {
          name: "Build Phase 1",
          phase: "build",
          weeksPercentage: 0.3,
          description: "Increase volume with tempo and threshold work",
        },
        {
          name: "Build Phase 2",
          phase: "build",
          weeksPercentage: 0.3,
          description: "Peak volume with race-specific workouts",
        },
        {
          name: "Taper",
          phase: "taper",
          weeksPercentage: 0.15,
          description: "Sharpen for race day",
        },
      ],
    },
    {
      id: "00000000-0000-0000-0000-000000000003",
      name: "Marathon - Advanced",
      description: "18-24 week plan for competitive marathoners",
      sport: "running",
      experienceLevel: "advanced",
      durationWeeks: 20,
      phases: [
        {
          name: "Base Building",
          phase: "base",
          weeksPercentage: 0.3,
          description: "High-volume aerobic base",
        },
        {
          name: "Build Phase 1",
          phase: "build",
          weeksPercentage: 0.25,
          description: "Lactate threshold development",
        },
        {
          name: "Build Phase 2",
          phase: "build",
          weeksPercentage: 0.25,
          description: "Race-specific marathon pace work",
        },
        {
          name: "Peak",
          phase: "peak",
          weeksPercentage: 0.1,
          description: "Final race sharpening",
        },
        {
          name: "Taper",
          phase: "taper",
          weeksPercentage: 0.1,
          description: "Rest and recovery before race",
        },
      ],
    },
    {
      id: "00000000-0000-0000-0000-000000000004",
      name: "Half Marathon",
      description: "12-14 week plan for half marathon",
      sport: "running",
      experienceLevel: "beginner",
      durationWeeks: 12,
      phases: [
        {
          name: "Base Building",
          phase: "base",
          weeksPercentage: 0.35,
          description: "Build endurance foundation",
        },
        {
          name: "Build Phase",
          phase: "build",
          weeksPercentage: 0.5,
          description: "Increase intensity and volume",
        },
        {
          name: "Taper",
          phase: "taper",
          weeksPercentage: 0.15,
          description: "Peak for race day",
        },
      ],
    },
    {
      id: "00000000-0000-0000-0000-000000000005",
      name: "5K/10K",
      description: "8-12 week plan for 5K or 10K races",
      sport: "running",
      experienceLevel: "beginner",
      durationWeeks: 10,
      phases: [
        {
          name: "Base",
          phase: "base",
          weeksPercentage: 0.3,
          description: "Aerobic foundation",
        },
        {
          name: "Build",
          phase: "build",
          weeksPercentage: 0.55,
          description: "VO2max and speed work",
        },
        {
          name: "Taper",
          phase: "taper",
          weeksPercentage: 0.15,
          description: "Race preparation",
        },
      ],
    },
    {
      id: "00000000-0000-0000-0000-000000000006",
      name: "Century Ride (100 miles)",
      description: "12-16 week plan for century ride",
      sport: "cycling",
      experienceLevel: "intermediate",
      durationWeeks: 14,
      phases: [
        {
          name: "Base",
          phase: "base",
          weeksPercentage: 0.35,
          description: "Build endurance with long rides",
        },
        {
          name: "Build",
          phase: "build",
          weeksPercentage: 0.5,
          description: "Increase ride duration and climbing",
        },
        {
          name: "Taper",
          phase: "taper",
          weeksPercentage: 0.15,
          description: "Recovery before event",
        },
      ],
    },
    {
      id: "00000000-0000-0000-0000-000000000007",
      name: "Gran Fondo",
      description: "16-20 week plan for competitive gran fondo",
      sport: "cycling",
      experienceLevel: "intermediate",
      durationWeeks: 18,
      phases: [
        {
          name: "Base",
          phase: "base",
          weeksPercentage: 0.35,
          description: "Endurance and climbing volume",
        },
        {
          name: "Build",
          phase: "build",
          weeksPercentage: 0.45,
          description: "Threshold and sustained power",
        },
        {
          name: "Taper",
          phase: "taper",
          weeksPercentage: 0.2,
          description: "Peak for event day",
        },
      ],
    },
    {
      id: "00000000-0000-0000-0000-000000000008",
      name: "Sprint Triathlon",
      description: "8-12 week sprint triathlon plan",
      sport: "triathlon",
      experienceLevel: "beginner",
      durationWeeks: 10,
      phases: [
        {
          name: "Base",
          phase: "base",
          weeksPercentage: 0.3,
          description: "Build fitness across all three sports",
        },
        {
          name: "Build",
          phase: "build",
          weeksPercentage: 0.55,
          description: "Race-specific intensity and brick workouts",
        },
        {
          name: "Taper",
          phase: "taper",
          weeksPercentage: 0.15,
          description: "Rest for race day",
        },
      ],
    },
    {
      id: "00000000-0000-0000-0000-000000000009",
      name: "Olympic Triathlon",
      description: "12-16 week olympic distance plan",
      sport: "triathlon",
      experienceLevel: "intermediate",
      durationWeeks: 14,
      phases: [
        {
          name: "Base",
          phase: "base",
          weeksPercentage: 0.3,
          description: "Aerobic development in all disciplines",
        },
        {
          name: "Build",
          phase: "build",
          weeksPercentage: 0.55,
          description: "Threshold work and race simulation",
        },
        {
          name: "Taper",
          phase: "taper",
          weeksPercentage: 0.15,
          description: "Final preparation",
        },
      ],
    },
    {
      id: "00000000-0000-0000-0000-000000000010",
      name: "Half Ironman (70.3)",
      description: "16-20 week half ironman plan",
      sport: "triathlon",
      experienceLevel: "intermediate",
      durationWeeks: 18,
      phases: [
        {
          name: "Base",
          phase: "base",
          weeksPercentage: 0.35,
          description: "Build endurance volume",
        },
        {
          name: "Build Phase 1",
          phase: "build",
          weeksPercentage: 0.3,
          description: "Increase volume across all sports",
        },
        {
          name: "Build Phase 2",
          phase: "build",
          weeksPercentage: 0.25,
          description: "Race-specific long sessions",
        },
        {
          name: "Taper",
          phase: "taper",
          weeksPercentage: 0.1,
          description: "Recovery before race",
        },
      ],
    },
    {
      id: "00000000-0000-0000-0000-000000000011",
      name: "Ironman",
      description: "20-28 week full ironman plan",
      sport: "triathlon",
      experienceLevel: "advanced",
      durationWeeks: 24,
      phases: [
        {
          name: "Base",
          phase: "base",
          weeksPercentage: 0.35,
          description: "Massive aerobic base building",
        },
        {
          name: "Build Phase 1",
          phase: "build",
          weeksPercentage: 0.25,
          description: "Volume increase",
        },
        {
          name: "Build Phase 2",
          phase: "build",
          weeksPercentage: 0.25,
          description: "Peak volume and race rehearsals",
        },
        {
          name: "Peak",
          phase: "peak",
          weeksPercentage: 0.08,
          description: "Final race-specific work",
        },
        {
          name: "Taper",
          phase: "taper",
          weeksPercentage: 0.07,
          description: "Recovery and mental preparation",
        },
      ],
    },
    {
      id: "00000000-0000-0000-0000-000000000012",
      name: "Base Building",
      description: "Flexible base building phase (4-12 weeks)",
      sport: "running",
      experienceLevel: "beginner",
      durationWeeks: 8,
      phases: [
        {
          name: "Base Building",
          phase: "base",
          weeksPercentage: 1.0,
          description: "Build aerobic foundation",
        },
      ],
    },
    {
      id: "00000000-0000-0000-0000-000000000013",
      name: "General Fitness",
      description: "Maintain fitness without specific event goal",
      sport: "running",
      experienceLevel: "beginner",
      durationWeeks: 12,
      phases: [
        {
          name: "General Fitness",
          phase: "base",
          weeksPercentage: 1.0,
          description: "Consistent training for health and fitness",
        },
      ],
    },
  ];

  // First delete existing templates
  console.log("Deleting existing system templates...");
  await supabase.from("training_plans").delete().eq("is_system_template", true);

  // Then insert new ones
  for (const t of templates) {
    const { error: insertError } = await supabase.from("training_plans").insert({
      id: t.id,
      is_system_template: true,
      template_visibility: "public",
      name: t.name,
      description: t.description,
      structure: {
        sport: [t.sport],
        experienceLevel: [t.experienceLevel],
        durationWeeks: {
          min: Math.floor(t.durationWeeks * 0.8),
          max: Math.ceil(t.durationWeeks * 1.2),
          recommended: t.durationWeeks,
        },
        phases: t.phases,
      },
      is_active: true,
      likes_count: 0,
    });

    if (insertError) {
      console.error(`Error inserting ${t.id}:`, insertError);
    } else {
      console.log(`✓ Inserted ${t.name} (${t.id})`);
    }
  }

  console.log("\n✅ Migration complete!");
}

main().catch(console.error);
