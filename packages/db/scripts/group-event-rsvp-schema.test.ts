import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const tablesPath = fileURLToPath(new URL("../src/schema/tables.ts", import.meta.url));
const baselinePath = fileURLToPath(
  new URL("../supabase/migrations/20260730000000_mvp_baseline.sql", import.meta.url),
);
const [tables, baseline] = await Promise.all([
  readFile(tablesPath, "utf8"),
  readFile(baselinePath, "utf8"),
]);

for (const tableName of ["group_event_rsvps", "group_event_series_rsvps"]) {
  const tableStart = baseline.indexOf(`CREATE TABLE "${tableName}"`);
  assert.notEqual(tableStart, -1, `${tableName} must exist in the clean baseline`);
  const tableDefinition = baseline.slice(tableStart, baseline.indexOf("\n);", tableStart) + 3);
  assert.match(tableDefinition, /"status" text NOT NULL/);
  assert.match(
    tableDefinition,
    new RegExp(`${tableName}_status_check[^\n]+status[^\n]+going[^\n]+declined`),
  );
  assert.doesNotMatch(baseline, new RegExp(`${tableName}_profile_status_idx`));
}

const rsvpSchema = tables.slice(
  tables.indexOf("export const groupEventRsvps"),
  tables.indexOf("export const trainingPlans"),
);
assert.match(
  rsvpSchema,
  /status: text\("status", \{ enum: GROUP_EVENT_RSVP_STATUSES \}\)\.notNull\(\)/,
);
assert.match(rsvpSchema, /group_event_rsvps_status_check/);
assert.match(rsvpSchema, /group_event_series_rsvps_status_check/);
assert.match(rsvpSchema, /in \('going', 'declined'\)/);
assert.doesNotMatch(rsvpSchema, /profile_status_idx/);

console.log(
  "Group-event RSVP responses are constrained to going or declined without dead indexes.",
);
