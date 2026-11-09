#!/usr/bin/env tsx

import assert from "node:assert/strict";
import { coreEnumParityManifest } from "../src/schema/core-enum-parity";

for (const [name, parity] of Object.entries(coreEnumParityManifest)) {
  assert.deepEqual(
    [...parity.databaseValues].sort(),
    [...parity.coreValues].sort(),
    `${name} must match Core exactly`,
  );
}
console.log("Core enum parity manifest passed.");
