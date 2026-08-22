import assert from "node:assert/strict";

import { getTableConfig } from "drizzle-orm/pg-core";
import { activityEffortSourceSeriesEnum, effortTypeEnum } from "../src/schema/enums";
import { activityEfforts, activitySegments } from "../src/schema/tables";
import {
  publicActivityEffortSourceSeriesSchema,
  publicActivityEffortsUpdateSchema,
} from "../src/validation";

assert.deepEqual(effortTypeEnum.enumValues, ["power", "speed", "heart_rate"]);
assert.deepEqual(activityEffortSourceSeriesEnum.enumValues, [
  "power",
  "grade_adjusted_speed",
  "raw_speed",
  "swim_speed",
  "heart_rate",
]);
assert.equal(publicActivityEffortSourceSeriesSchema.safeParse("raw_speed").success, true);
assert.equal(publicActivityEffortSourceSeriesSchema.safeParse("speed").success, false);

const config = getTableConfig(activityEfforts);
const distanceMeters = config.columns.find((column) => column.name === "distance_meters");
assert.ok(distanceMeters, "activity_efforts.distance_meters must exist");
assert.equal(distanceMeters.dataType, "number");
assert.equal(distanceMeters.notNull, false);

const columns = new Map(config.columns.map((column) => [column.name, column]));
for (const requiredColumn of [
  "activity_id",
  "segment_id",
  "source_artifact_id",
  "source_series",
  "source_revision",
  "start_offset_ms",
  "end_offset_ms",
  "window_coverage",
  "max_gap_seconds",
  "source",
  "method",
  "calculation_version",
  "provenance",
]) {
  assert.equal(
    columns.get(requiredColumn)?.notNull,
    true,
    `activity_efforts.${requiredColumn} must be required derived evidence`,
  );
}
assert.equal(
  columns.has("updated_at"),
  false,
  "immutable activity_efforts has no update timestamp",
);
assert.equal(publicActivityEffortsUpdateSchema.safeParse({}).success, false);

const checkNames = new Set(config.checks.map((constraint) => constraint.name));
assert.ok(checkNames.has("activity_efforts_distance_meters_bounds_check"));
assert.ok(checkNames.has("activity_efforts_value_finite_positive_check"));
assert.ok(checkNames.has("activity_efforts_source_revision_check"));
assert.ok(checkNames.has("activity_efforts_window_check"));
assert.ok(checkNames.has("activity_efforts_coverage_finite_range_check"));
assert.ok(checkNames.has("activity_efforts_max_gap_finite_check"));
assert.ok(!checkNames.has("activity_efforts_duration_seconds_bounds_check"));
for (const policyCheckName of [
  "activity_efforts_supported_combination_check",
  "activity_efforts_unit_compatibility_check",
  "activity_efforts_bike_power_max_check",
  "activity_efforts_run_speed_bounds_check",
  "activity_efforts_swim_speed_bounds_check",
  "activity_efforts_heart_rate_bounds_check",
] as const) {
  assert.ok(
    !checkNames.has(policyCheckName),
    `${policyCheckName} belongs to the shared activity-effort policy, not the database`,
  );
}

assert.ok(
  config.uniqueConstraints.some(
    (constraint) => constraint.name === "activity_efforts_deterministic_source_window_unique",
  ),
);
for (const constraintName of [
  "activity_efforts_ownership_unique",
  "activity_efforts_deterministic_source_window_unique",
]) {
  const constraint = config.uniqueConstraints.find(({ name }) => name === constraintName);
  assert.ok(
    constraint?.columns.some(({ name }) => name === "source_series"),
    `${constraintName} must include source_series`,
  );
}
assert.ok(
  config.foreignKeys.some(
    (constraint) => constraint.getName() === "activity_efforts_exact_source_fkey",
  ),
);
assert.ok(
  getTableConfig(activitySegments).uniqueConstraints.some(
    (constraint) => constraint.name === "activity_segments_effort_source_unique",
  ),
);

console.log("Activity effort schema contract tests passed.");
