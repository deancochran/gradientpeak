import assert from "node:assert/strict";
import { activityPlanSqlArtifacts } from "./activity-plan-sql-artifacts";

const { functions } = activityPlanSqlArtifacts();

const exactKeysStart = 'CREATE OR REPLACE FUNCTION "public"."activity_plan_jsonb_has_exact_keys"';
const targetStart = 'CREATE OR REPLACE FUNCTION "public"."activity_plan_target_is_canonical"';

assert.ok(functions.includes(exactKeysStart));
assert.ok(functions.includes(targetStart));
assert.match(functions, /required_keys <@ array\(select pg_catalog\.jsonb_object_keys\(input\)\)/);
assert.match(functions, /when '%FTP' then .*activity_category = 'bike'/s);
assert.doesNotMatch(
  functions,
  /RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS \$\$ SELECT true \$\$/,
);
assert.ok(
  functions.indexOf(exactKeysStart) < functions.indexOf(targetStart),
  "exact-key canonicality must precede target canonicality",
);
assert.ok(
  functions.indexOf(targetStart) <
    functions.indexOf("CREATE OR REPLACE FUNCTION public.activity_plan_v5_has_exact_keys"),
  "canonical target dependencies must precede the V5 validator",
);

console.log("Activity-plan materialization artifact selects canonical prerequisite bodies.");
