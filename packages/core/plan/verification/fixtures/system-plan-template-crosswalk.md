# System Plan Template Crosswalk

Primary source of truth for system training plans: `packages/core/samples/training-plans.ts`

Primary source of truth for linked system activity templates: `packages/core/samples/index.ts`

Current seeded DB snapshot for curated training-plan templates: `packages/db/drizzle/0000_baseline.sql`

Known drift to keep visible in verification:

- The SQL migration seeds the curated training-plan ids and metadata, but it does not persist per-session `activity_plan_id` links.
- The code registry keeps those links in `packages/core/samples/training-plans.ts`, so linkage verification must resolve from code today.
- Every current system plan name advertises a longer week span than the materialized session window encoded in the current structure.

Plan-to-template crosswalk:

- `Marathon Foundation (12 weeks)`: `Easy Recovery Run`, `Tempo Run`, `Long Easy Run`
- `Half Marathon Build (10 weeks)`: `Easy Recovery Run`, `Threshold Intervals`, `Tempo Run`, `Long Easy Run`
- `5K Speed Block (8 weeks)`: `Easy Recovery Run`, `Speed Intervals`, `Threshold Intervals`, `5K Pace Intervals`
- `Cycling Endurance Builder (12 weeks)`: `Easy Endurance Ride`, `Sweet Spot Intervals`, `Active Recovery Ride`, `Long Endurance Ride`, `Climbing Intervals`
- `Sprint Triathlon Base (10 weeks)`: `Technique Focus`, `Easy Endurance Ride`, `Speed Intervals`, `Endurance Set`, `Tempo Run`, `Tempo Intervals`, `Long Easy Run`
- `General Fitness Maintenance (6 weeks)`: `Recovery Walk`, `Full Body Circuit`, `Long Easy Run`
