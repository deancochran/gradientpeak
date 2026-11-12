import assert from "node:assert/strict";

import { canonicalJson, structureHash } from "./canonical-json";

assert.equal(
  canonicalJson({ z: 1, a: [true, { y: 2, x: "v" }] }),
  '{"a":[true,{"x":"v","y":2}],"z":1}',
);
assert.equal(structureHash({ b: 2, a: 1 }), structureHash({ a: 1, b: 2 }));
assert.match(structureHash({ version: 3, segments: [] }), /^v1:sha256:[0-9a-f]{64}$/);
assert.throws(() => canonicalJson(Number.NaN), /non-finite/);
assert.equal(
  canonicalJson({ omitted: undefined, unicode: "é", negativeZero: -0 }),
  '{"negativeZero":0,"unicode":"é"}',
);
assert.equal(canonicalJson([1e30, 0.000001]), "[1e+30,0.000001]");

console.log("Canonical structure hashing tests passed.");
