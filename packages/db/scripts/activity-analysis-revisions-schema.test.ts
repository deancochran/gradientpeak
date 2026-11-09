import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const baseline = await readFile(
  resolve(packageRoot, "supabase/migrations/20260730000000_mvp_baseline.sql"),
  "utf8",
);

assert.match(baseline, /CREATE TABLE "activity_analysis_revisions"/);
assert.match(
  baseline,
  /FOREIGN KEY \("activity_id","profile_id"\) REFERENCES "public"\."activities"\("id","profile_id"\)/,
);
assert.match(
  baseline,
  /source_segments_revision[\s\S]*activity analysis revision must match the owned current segment revision/,
);
assert.match(baseline, /activity analysis revisions are append-only/);
assert.match(baseline, /activity performance target snapshots are immutable after capture/);
assert.doesNotMatch(baseline, /activity_analysis_revisions_output_unique/);
assert.match(
  baseline,
  /activity_analysis_revisions_activity_revision_unique" UNIQUE\("activity_id","profile_id","revision"\)/,
);
assert.match(
  baseline,
  /ALTER TABLE "public"\."activity_analysis_revisions" ENABLE ROW LEVEL SECURITY/,
);
assert.doesNotMatch(baseline, /CREATE POLICY [^;]+activity_analysis_revisions/i);

process.stdout.write("activity analysis revision schema contract passed\n");
