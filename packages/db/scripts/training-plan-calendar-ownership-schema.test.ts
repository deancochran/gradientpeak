import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const schemaSource = readFileSync(resolve("src/schema/tables.ts"), "utf8");
const baselineSource = readFileSync(
  resolve("supabase/migrations/20260730000000_mvp_baseline.sql"),
  "utf8",
);

assert.match(
  schemaSource,
  /training_plan_id:\s*uuid\("training_plan_id"\)\.references\(\(\) => trainingPlans\.id, \{\s*onDelete: "set null",\s*\}\)/,
  "Drizzle events.training_plan_id must detach when a template is deleted",
);
const baselineForeignKey = baselineSource.match(
  /ALTER TABLE "events" ADD CONSTRAINT "events_training_plan_id_training_plans_id_fk"[^;]+;/,
)?.[0];
assert.ok(baselineForeignKey, "The fresh baseline must declare events.training_plan_id ownership");
assert.match(
  baselineForeignKey,
  /ON DELETE set null/,
  "The fresh baseline must preserve Calendar Scheduled Sessions with ON DELETE SET NULL",
);
assert.doesNotMatch(
  baselineForeignKey,
  /ON DELETE cascade/,
  "Deleting a training-plan template must never cascade into Calendar Scheduled Sessions",
);

console.log(
  "Training-plan deletion preserves Calendar Scheduled Sessions by detaching template IDs.",
);
