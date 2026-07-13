#!/usr/bin/env tsx

import assert from "node:assert/strict";
import { coreEnumParityManifest } from "../src/schema/core-enum-parity";

for (const [name, parity] of Object.entries(coreEnumParityManifest)) {
  if (parity.strategy !== "exact") continue;
  assert.deepEqual(
    [...parity.databaseValues].sort(),
    parity.coreValues,
    `${name} must match Core exactly`,
  );
}

assert.equal(
  coreEnumParityManifest.comments_entity_type.strategy,
  "repository-validates-core-values",
);
console.log("Core enum parity manifest passed.");
