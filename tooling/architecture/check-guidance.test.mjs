import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { validateGuidance } from "./check-guidance.mjs";

const architectureRoot = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => resolve(architectureRoot, "fixtures/guidance", name);

test("accepts local active exemplars, adjacent deprecated caveats, route-group paths, workspace paths, and scripts", () => {
  assert.deepEqual(validateGuidance(fixture("valid")), []);
});

test("reports missing catalog links and deprecated exemplars without a caveat", () => {
  const errors = validateGuidance(fixture("invalid-catalog"));
  assert(
    errors.some((error) =>
      error.includes("linked exemplar target is missing: ../apps/demo/missing.md"),
    ),
  );
  assert(errors.some((error) => error.includes("deprecated.md contains @deprecated")));
});

test("reports invalid AGENTS links, workspace paths, and every package script in a chained span but ignores generic pnpm commands", () => {
  const errors = validateGuidance(fixture("invalid-agents"));
  assert(
    errors.some((error) =>
      error.includes("linked guidance target is missing: ./missing-guidance.md"),
    ),
  );
  assert(
    errors.some((error) =>
      error.includes("referenced workspace path is missing: packages/demo/missing"),
    ),
  );
  assert(
    errors.some((error) => error.includes("missing script absent in packages/demo/package.json")),
  );
  assert(
    errors.some((error) =>
      error.includes("missing script also-absent in packages/demo/package.json"),
    ),
  );
  assert(errors.some((error) => error.includes("pnpm filter does not name a workspace: absent")));
  assert.equal(
    errors.some((error) => error.includes("install")),
    false,
  );
});
