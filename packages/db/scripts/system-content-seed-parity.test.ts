import assert from "node:assert/strict";
import { getSystemActivityTemplateDefinitions, getSystemTrainingPlanDefinitions } from "@repo/core";
import {
  activityPlanDocumentSchema,
  activityPlanStructureSchema,
  INITIAL_ACTIVITY_PLAN_VARIANT_NAME,
} from "@repo/core/activity-plan";
import { structureHash } from "./canonical-json";
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

  const templateId = definition.content.id;
  assert.ok(templateId);
  const document = activityPlanDocumentSchema.parse(row.structure);
  assert.equal(document.contractVersion, 1);
  assert.equal(document.defaultVariantId, templateId);
  assert.equal(document.variants.length, 1);
  assert.equal(document.variants[0]?.id, templateId);
  assert.equal(document.variants[0]?.name, INITIAL_ACTIVITY_PLAN_VARIANT_NAME);
  assert.deepEqual(
    document.variants[0]?.structure,
    activityPlanStructureSchema.parse(definition.content.structure),
  );
  assert.equal(row.structure_hash, structureHash(document));
  assert.notEqual(row.structure_hash, structureHash(definition.content.structure));
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
  for (const session of row.structure.sessions) {
    assert.equal(
      session.activity_plan_variant_id,
      session.activity_plan_id,
      "system training-plan sessions must deterministically pin each initial Base variant",
    );
  }
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
