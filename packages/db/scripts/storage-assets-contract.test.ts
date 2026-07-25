#!/usr/bin/env tsx

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { dbPackageRoot } from "./_helpers";
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

const supabaseConfig = readFileSync(resolve(dbPackageRoot, "supabase/config.toml"), "utf8");
const routeBucketSection = supabaseConfig.match(
  /\[storage\.buckets\.gpx-routes\]([\s\S]*?)(?:\n\[|$)/,
)?.[1];
assert.ok(routeBucketSection, "local Supabase config must define the gpx-routes bucket");
const configuredMimeTypes = [
  ...(routeBucketSection.match(/^allowed_mime_types\s*=\s*\[([^\]]*)\]/m)?.[1] ?? "").matchAll(
    /"([^"]+)"/g,
  ),
].map((match) => match[1]);
assert.deepEqual(configuredMimeTypes, [...ROUTE_BUCKET_ALLOWED_MIME_TYPES]);

console.log("[db:storage:contract:test] exact database and local-config MIME allowlists enforced");
