import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import type { MigrationPolicy } from "./_migration-plan";
import { requireGuardedDisposableLocalDatabaseUrl } from "./_target-safety";
import { assertCanonicalActivityPlanStructureInventory } from "./activity-plan-structure-preflight";

const dbPackageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const safeChildEnvironmentKeys = [
  "PATH",
  "HOME",
  "USERPROFILE",
  "TMPDIR",
  "TMP",
  "TEMP",
  "SystemRoot",
  "WINDIR",
  "ComSpec",
  "PATHEXT",
] as const;

export function safeSupabaseCliEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const key of safeChildEnvironmentKeys) {
    if (source[key] !== undefined) environment[key] = source[key];
  }
  return {
    ...environment,
    SUPABASE_TELEMETRY_DISABLED: "1",
    DO_NOT_TRACK: "1",
  };
}

function safeTimeout(value: string) {
  if (!/^\d+(?:ms|s|min)$/.test(value)) throw new Error(`unsupported timeout value: ${value}`);
  return value;
}

type PinnedCliParams = {
  projectRoot: string;
  databaseUrl: string;
  policy: MigrationPolicy;
};

export function boundedSupabaseCliDatabaseUrl(
  params: Pick<PinnedCliParams, "databaseUrl" | "policy">,
) {
  const { lockTimeout, statementTimeout } = params.policy.forwardMigrations.autocommitSession;
  const pgOptions = `-c lock_timeout=${safeTimeout(lockTimeout)} -c statement_timeout=${safeTimeout(statementTimeout)}`;
  const boundedUrl = requireGuardedDisposableLocalDatabaseUrl(params.databaseUrl);
  boundedUrl.searchParams.set("options", pgOptions);
  return boundedUrl.toString();
}

/** Runs the exact Core preflight on a guarded local target before any CLI migration mutation. */
export async function runPinnedSupabaseCliPush(params: PinnedCliParams) {
  const boundedUrl = boundedSupabaseCliDatabaseUrl(params);
  const pool = new Pool({ connectionString: boundedUrl });
  try {
    await assertCanonicalActivityPlanStructureInventory(pool);
  } finally {
    await pool.end();
  }
  return execFileSync(
    "pnpm",
    [
      "exec",
      "supabase",
      "--workdir",
      params.projectRoot,
      "db",
      "push",
      "--db-url",
      boundedUrl,
      "--include-all",
      "--yes",
    ],
    {
      cwd: dbPackageRoot,
      encoding: "utf8",
      env: safeSupabaseCliEnvironment(),
      stdio: "pipe",
    },
  );
}
