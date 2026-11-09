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
  /training_plan_id:\s*uuid\("training_plan_id"\)\.references\(\(\) => trainingPlans\.id, \{\s*onDelete: "restrict",\s*\}\)/,
  "Drizzle planned_sessions.training_plan_id must preserve immutable source identity",
);
const baselineForeignKey = baselineSource.match(
  /ALTER TABLE "planned_sessions" ADD CONSTRAINT "planned_sessions_training_plan_id_training_plans_id_fk"[^;]+;/,
)?.[0];
assert.ok(
  baselineForeignKey,
  "The fresh baseline must declare planned_sessions.training_plan_id ownership",
);
assert.match(
  baselineForeignKey,
  /ON DELETE restrict/,
  "The fresh baseline must prevent deletion of referenced immutable training-plan sources",
);
assert.doesNotMatch(
  baselineForeignKey,
  /ON DELETE (?:cascade|set null)/,
  "Deleting a training plan must never erase or detach planned-session source identity",
);

assert.match(
  schemaSource,
  /"events_recurrence_occurrence_key_required",\s*sql`\$\{table\.recurrence_rule\} is null or btrim\(\$\{table\.occurrence_key\}\) <> ''`/,
  "Drizzle must require an occurrence key for the recurring anchor as well as its children",
);
assert.match(
  schemaSource,
  /"events_occurrence_scheduled_date_identity",\s*sql`\$\{table\.occurrence_key\} = '' or \$\{table\.scheduled_date\} = \$\{table\.occurrence_key\}`/,
  "Drizzle must preserve recurrence occurrenceKey as the scheduled planning date",
);
assert.match(
  baselineSource,
  /CONSTRAINT "events_recurrence_occurrence_key_required" CHECK \("events"\."recurrence_rule" is null or btrim\("events"\."occurrence_key"\) <> ''\)/,
  "The fresh baseline must require an occurrence key for every materialized recurrence row",
);
assert.match(
  baselineSource,
  /CONSTRAINT "events_occurrence_scheduled_date_identity" CHECK \("events"\."occurrence_key" = '' or "events"\."scheduled_date" = "events"\."occurrence_key"\)/,
  "The fresh baseline must reject recurrence rows whose scheduled date differs from occurrenceKey",
);

console.log(
  "Immutable planned-session training-plan identity and recurrence schedule-date identity preserve Calendar ownership.",
);
