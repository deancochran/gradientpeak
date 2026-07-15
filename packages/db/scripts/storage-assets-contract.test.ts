#!/usr/bin/env tsx

import assert from "node:assert/strict";
import {
  assertRouteBucketContract,
  ROUTE_BUCKET_ALLOWED_MIME_TYPES,
} from "./storage-assets-contract";

const valid = {
  id: "gpx-routes",
  public: false,
  file_size_limit: "10485760",
  allowed_mime_types: [...ROUTE_BUCKET_ALLOWED_MIME_TYPES],
};

assert.doesNotThrow(() => assertRouteBucketContract(valid));
assert.throws(() =>
  assertRouteBucketContract({
    ...valid,
    allowed_mime_types: ["application/gpx+xml", "application/xml"],
  }),
);
assert.throws(() =>
  assertRouteBucketContract({
    ...valid,
    allowed_mime_types: [...ROUTE_BUCKET_ALLOWED_MIME_TYPES].reverse(),
  }),
);

console.log("[db:storage:contract:test] exact route MIME allowlist enforced");
