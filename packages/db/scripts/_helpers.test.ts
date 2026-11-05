import assert from "node:assert/strict";
import { formatSupabaseCliFailure } from "./_helpers";

const diagnostic = formatSupabaseCliFailure({
  code: 1,
  signal: "SIGTERM",
  stderr:
    "shadow failed for postgresql://postgres:password@127.0.0.1:54322/fresh?access_token=private",
  stdout: "api_key=private",
});

assert.match(diagnostic, /exit=1/);
assert.match(diagnostic, /signal=SIGTERM/);
assert.match(diagnostic, /shadow failed/);
assert.doesNotMatch(diagnostic, /password|private/);
assert.match(diagnostic, /postgres:\*\*\*@127\.0\.0\.1/);
assert.match(diagnostic, /access_token=\*\*\*/);
assert.match(diagnostic, /api_key=\*\*\*/);
console.info(
  "[db:supabase-cli] failure diagnostics preserve process evidence and redact credentials",
);
