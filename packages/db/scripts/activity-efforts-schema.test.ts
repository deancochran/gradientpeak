import assert from "node:assert/strict";

import { getTableConfig } from "drizzle-orm/pg-core";
import { effortTypeEnum } from "../src/schema/enums";
import { activityEfforts, swimmingCssProtocolEvidence } from "../src/schema/tables";

assert.deepEqual(effortTypeEnum.enumValues, ["power", "speed", "heart_rate"]);

const config = getTableConfig(activityEfforts);
const distanceMeters = config.columns.find((column) => column.name === "distance_meters");
assert.ok(distanceMeters, "activity_efforts.distance_meters must exist");
assert.equal(distanceMeters.dataType, "number");
assert.equal(distanceMeters.notNull, false);

const checkNames = new Set(config.checks.map((constraint) => constraint.name));
assert.ok(checkNames.has("activity_efforts_distance_meters_bounds_check"));
assert.ok(checkNames.has("activity_efforts_supported_combination_check"));
assert.ok(checkNames.has("activity_efforts_unit_compatibility_check"));
assert.ok(checkNames.has("activity_efforts_heart_rate_bounds_check"));
assert.ok(checkNames.has("activity_efforts_value_finite_positive_check"));

const cssProtocolConfig = getTableConfig(swimmingCssProtocolEvidence);
const cssProtocolColumns = new Set(cssProtocolConfig.columns.map((column) => column.name));
for (const sourceColumn of [
  "protocol_id",
  "evidence_id",
  "evidence_revision",
  "source_artifact_id",
  "effort_400_id",
  "effort_200_id",
]) {
  assert.ok(cssProtocolColumns.has(sourceColumn), `missing canonical CSS source ${sourceColumn}`);
}
assert.equal(cssProtocolColumns.has("css_seconds_per_100m"), false);
assert.equal(cssProtocolColumns.has("css_meters_per_second"), false);
const cssCheckNames = new Set(cssProtocolConfig.checks.map((constraint) => constraint.name));
for (const checkName of [
  "swimming_css_protocol_evidence_protocol_identity_check",
  "swimming_css_protocol_evidence_content_identity_check",
  "swimming_css_protocol_evidence_context_check",
  "swimming_css_protocol_evidence_status_check",
  "swimming_css_protocol_evidence_revision_check",
  "swimming_css_protocol_evidence_distinct_efforts_check",
  "swimming_css_protocol_evidence_duration_check",
  "swimming_css_protocol_evidence_order_check",
]) {
  assert.ok(cssCheckNames.has(checkName), `missing canonical CSS constraint ${checkName}`);
}
assert.equal(cssProtocolConfig.foreignKeys.length, 4);

console.log("Activity effort schema contract tests passed.");
