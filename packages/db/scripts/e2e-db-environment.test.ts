import assert from "node:assert/strict";
import test from "node:test";

import {
  buildE2ESupabaseConfig,
  E2E_PORTS,
  parseE2EEnvironment,
  requireSafeE2EEnvironment,
} from "./e2e-db-environment";

const manualConfig = `project_id = "gradientpeak"

[api]
port = 54321

[db]
port = 54322
shadow_port = 54320

[db.pooler]
port = 54329

[studio]
port = 54323

[local_smtp]
port = 54324
smtp_port = 54325

[edge_runtime]
inspector_port = 8083

[analytics]
port = 54327
`;

test("builds the E2E Supabase namespace from the manual config without manual ports", () => {
  const config = buildE2ESupabaseConfig(manualConfig);
  assert.match(config, /^project_id = "gradientpeak_e2e"/m);
  for (const port of Object.values(E2E_PORTS)) assert.match(config, new RegExp(`= ${port}\\b`));
  assert.doesNotMatch(config, /\b5432[0-9]\b/);
  assert.doesNotMatch(config, /inspector_port = 8083/);
});

test("defaults every E2E endpoint to the dedicated loopback namespace", () => {
  assert.deepEqual(parseE2EEnvironment({}), {
    apiUrl: "http://127.0.0.1:55321",
    databasePort: 55322,
    projectId: "gradientpeak_e2e",
    supabasePort: 55321,
  });
});

test("rejects the manual project and manual ports before any command runs", () => {
  assert.throws(
    () => requireSafeE2EEnvironment({ GRADIENTPEAK_E2E_PROJECT_ID: "gradientpeak" }),
    /refused manual Supabase project/,
  );
  assert.throws(
    () => requireSafeE2EEnvironment({ GRADIENTPEAK_E2E_SUPABASE_URL: "http://127.0.0.1:54321" }),
    /refused manual port 54321/,
  );
  assert.throws(
    () => requireSafeE2EEnvironment({ GRADIENTPEAK_E2E_DATABASE_PORT: "54322" }),
    /refused manual port 54322/,
  );
  assert.throws(
    () =>
      requireSafeE2EEnvironment({ GRADIENTPEAK_E2E_SUPABASE_URL: "http://100.119.109.24:55321" }),
    /loopback-only/,
  );
});
