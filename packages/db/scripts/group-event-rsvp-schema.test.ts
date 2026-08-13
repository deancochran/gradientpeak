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
  assert.doesNotMatch(tableDefinition, /"status" text DEFAULT/);
  assert.match(tableDefinition, /"status" = 'declined'/);
  assert.doesNotMatch(tableDefinition, /'accepted'|'tentative'/);
}

const rsvpSchema = tables.slice(
  tables.indexOf("export const groupEventRsvps"),
  tables.indexOf("export const trainingPlans"),
);
assert.match(rsvpSchema, /enum: \["declined"\]/);
assert.doesNotMatch(rsvpSchema, /\.default\("accepted"\)|"tentative"/);

console.log("Group-event RSVP persistence is decline-only with no implicit accepted row.");
