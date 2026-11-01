import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { readFreshAcceptanceTarget, verifyFreshAcceptanceTarget } from "./acceptance-target";

// Provisioning and cleanup belong to Compose / GitHub Actions, never this command.
const target = readFreshAcceptanceTarget();
await verifyFreshAcceptanceTarget(target);
const baseline = readFileSync(
  new URL("../drizzle/baseline/20261031_current_main.sql", import.meta.url),
  "utf8",
);
const exported = execFileSync(
  "pnpm",
  ["exec", "drizzle-kit", "export", "--config", "drizzle.config.ts"],
  {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  },
);
if (exported !== baseline)
  throw new Error(
    "Fresh baseline differs from the current Drizzle schema; regenerate and review it.",
  );
const security = readFileSync(
  new URL("../drizzle/baseline/20261031_security.sql", import.meta.url),
  "utf8",
);
const pool = new Pool({ connectionString: target.databaseUrl });
const client = await pool.connect();
try {
  await client.query("BEGIN");
  const objects = await client.query(
    `SELECT 1 FROM pg_class WHERE relnamespace = 'public'::regnamespace
     UNION ALL SELECT 1 FROM pg_type WHERE typnamespace = 'public'::regnamespace
     UNION ALL SELECT 1 FROM pg_proc WHERE pronamespace = 'public'::regnamespace LIMIT 1`,
  );
  if (objects.rowCount)
    throw new Error(
      "Acceptance preparation requires an empty database; refusing to reset an existing target.",
    );
  await client.query(baseline);
  await client.query(security);
  const unsafe = await client.query(`
    SELECT c.relname FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')
      AND (NOT c.relrowsecurity
        OR has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE')
        OR has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE'))
  `);
  if (unsafe.rowCount)
    throw new Error("Fresh baseline failed default-deny RLS/grant verification.");
  const unsafeSequences = await client.query(`
    SELECT 1 FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'S'
      AND (has_sequence_privilege('anon', c.oid, 'USAGE,SELECT,UPDATE')
        OR has_sequence_privilege('authenticated', c.oid, 'USAGE,SELECT,UPDATE'))
    UNION ALL
    SELECT 1 FROM pg_default_acl d, LATERAL aclexplode(d.defaclacl) a
    WHERE d.defaclnamespace IN (0, 'public'::regnamespace)
      AND d.defaclobjtype IN ('r', 'S')
      AND a.grantee IN (0, 'anon'::regrole, 'authenticated'::regrole)
  `);
  if (unsafeSequences.rowCount)
    throw new Error("Fresh baseline failed sequence/default ACL verification.");
  await client.query("COMMIT");
  console.log("Prepared fresh acceptance schema; existing-target upgrades remain unsupported.");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
