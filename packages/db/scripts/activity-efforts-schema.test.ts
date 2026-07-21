import assert from "node:assert/strict";

import { getTableConfig } from "drizzle-orm/pg-core";
import { effortTypeEnum } from "../src/schema/enums";
import { activityEfforts } from "../src/schema/tables";

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

console.log("Activity effort schema contract tests passed.");
