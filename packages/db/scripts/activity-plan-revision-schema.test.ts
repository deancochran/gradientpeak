import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getTableColumns } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { activityPlans } from "../src/schema/tables";

const baseline = readFileSync(
  resolve(import.meta.dirname, "../supabase/migrations/20260730000000_mvp_baseline.sql"),
  "utf8",
);
const columns = getTableColumns(activityPlans);
const checks = new Set(getTableConfig(activityPlans).checks.map((check) => check.name));

assert.equal(columns.revision.notNull, true);
assert.equal(columns.revision.hasDefault, true);
assert.ok(checks.has("activity_plans_revision_check"));
assert.match(baseline, /"revision" integer DEFAULT 1 NOT NULL/);
assert.match(
  baseline,
  /CONSTRAINT "activity_plans_revision_check" CHECK \("activity_plans"\."revision" >= 1\)/,
);
assert.match(baseline, /CREATE OR REPLACE FUNCTION public\.enforce_activity_plan_revision\(\)/);
assert.match(
  baseline,
  /IF NEW\.structure IS DISTINCT FROM OLD\.structure THEN[\s\S]*NEW\.revision := OLD\.revision \+ 1;[\s\S]*ELSE[\s\S]*NEW\.revision := OLD\.revision;/,
);
assert.match(
  baseline,
  /CREATE TRIGGER activity_plans_enforce_revision[\s\S]*BEFORE UPDATE ON public\.activity_plans/,
);

process.stdout.write("activity plan revision schema contract passed\n");
