import assert from "node:assert/strict";
import { getSystemActivityTemplateDefinitions, getSystemTrainingPlanDefinitions } from "@repo/core";
import {
  materializeSystemActivityTemplateSeedValues,
  materializeSystemTrainingPlanSeedValues,
} from "./system-content-seed-values";

const activityDefinitions = await getSystemActivityTemplateDefinitions();
const trainingDefinitions = await getSystemTrainingPlanDefinitions();
const activityRows = activityDefinitions.map(materializeSystemActivityTemplateSeedValues);
const trainingRows = trainingDefinitions.map(materializeSystemTrainingPlanSeedValues);

assert.equal(activityRows.length, activityDefinitions.length);
assert.equal(trainingRows.length, trainingDefinitions.length);
assert.equal(new Set(activityRows.map((row) => row.id)).size, activityRows.length);
assert.equal(new Set(trainingRows.map((row) => row.id)).size, trainingRows.length);

for (const [definition, row] of activityDefinitions.map(
  (definition, index) => [definition, activityRows[index]] as const,
)) {
  assert.ok(row);
  assert.equal(row.id, definition.content.id);
  assert.equal(row.system_content_key, definition.key);
  assert.equal(row.system_content_version, definition.version);
  assert.equal(row.system_content_hash, definition.contentHash);
  assert.equal(row.profile_id, null);
  assert.equal(row.is_system_template, true);
  assert.equal(row.content_visibility, "public");
}

for (const [definition, row] of trainingDefinitions.map(
  (definition, index) => [definition, trainingRows[index]] as const,
)) {
  assert.ok(row);
  assert.equal(row.id, definition.content.id);
  assert.equal(row.system_content_key, definition.key);
  assert.equal(row.system_content_version, definition.version);
  assert.equal(row.system_content_hash, definition.contentHash);
  assert.equal(row.profile_id, null);
  assert.equal(row.is_system_template, true);
  assert.equal(row.content_visibility, "public");
}

assert.deepEqual(
  activityRows,
  (await getSystemActivityTemplateDefinitions()).map(materializeSystemActivityTemplateSeedValues),
);
assert.deepEqual(
  trainingRows,
  (await getSystemTrainingPlanDefinitions()).map(materializeSystemTrainingPlanSeedValues),
);

console.log(
  `System content seed parity passed for ${activityRows.length} activity and ${trainingRows.length} training definitions.`,
);
