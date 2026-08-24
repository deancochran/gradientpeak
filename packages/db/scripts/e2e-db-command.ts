#!/usr/bin/env tsx

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { dbPackageRoot, supabaseCliRoot } from "./_local-database-config";
import { buildE2ESupabaseConfig, requireSafeE2EEnvironment } from "./e2e-db-environment";

type E2EAction = "migrate" | "start" | "status" | "stop";

const runtimeRoot = resolve(process.env.TMPDIR ?? "/tmp", "gradientpeak-supabase-e2e");
const runtimeSupabaseRoot = resolve(runtimeRoot, "supabase");
const expectedDatabaseContainer = "supabase_db_gradientpeak_e2e";
const expectedApiContainer = "supabase_kong_gradientpeak_e2e";
const require = createRequire(import.meta.url);
const supabaseCliEntryPoint = resolve(
  dirname(require.resolve("supabase/package.json")),
  "dist",
  "supabase.js",
);

export function planE2EDatabaseCommand(action: string, dryRun: boolean) {
  if (!(["start", "migrate", "status", "stop"] as string[]).includes(action)) {
    throw new Error("E2E database command must be one of: start, migrate, status, stop.");
  }
  const environment = requireSafeE2EEnvironment();
  return { action: action as E2EAction, dryRun, projectId: environment.projectId } as const;
}

export function redactCommandFailure(_message: string) {
  return "E2E command failed (details redacted).";
}

function prepareRuntime() {
  const environment = requireSafeE2EEnvironment();
  const sourceConfig = readFileSync(resolve(supabaseCliRoot, "config.toml"), "utf8");
  const config = buildE2ESupabaseConfig(sourceConfig);
  if (/\b5432[12]\b/.test(config) || !/^project_id = "gradientpeak_e2e"/m.test(config)) {
    throw new Error("Generated E2E Supabase config failed namespace safety checks.");
  }

  rmSync(runtimeRoot, { force: true, recursive: true });
  mkdirSync(runtimeSupabaseRoot, { recursive: true });
  writeFileSync(resolve(runtimeSupabaseRoot, "config.toml"), config);
  linkSource("migrations");
  linkSource("functions");
  const seed = resolve(supabaseCliRoot, "seed.sql");
  if (existsSync(seed)) symlinkSync(seed, resolve(runtimeSupabaseRoot, "seed.sql"), "file");
  process.env.SUPABASE_PUBLIC_API_URL = environment.apiUrl;
  return environment;
}

function linkSource(name: string) {
  const source = resolve(supabaseCliRoot, name);
  if (existsSync(source)) symlinkSync(source, resolve(runtimeSupabaseRoot, name), "dir");
}

function run(command: string, args: string[], optional = false) {
  const result = spawnSync(command, args, {
    cwd: dbPackageRoot,
    encoding: "utf8",
    env: process.env,
    stdio: "pipe",
  });
  if (result.status !== 0 && !optional) {
    throw new Error(redactCommandFailure(`${result.stdout ?? ""}\n${result.stderr ?? ""}`));
  }
  return { output: result.stdout?.trim() ?? "", status: result.status ?? 1 };
}

function runSupabase(args: string[]) {
  return run(process.execPath, [supabaseCliEntryPoint, "--workdir", runtimeRoot, ...args]);
}

function runningProjectContainers() {
  const result = run("docker", ["ps", "--format", "{{.Names}}"], true);
  if (result.status !== 0) return [];
  return result.output.split(/\r?\n/).filter((name) => name.endsWith("_gradientpeak_e2e"));
}

function requireRunningE2EStack() {
  const containers = runningProjectContainers();
  if (
    !containers.includes(expectedDatabaseContainer) ||
    !containers.includes(expectedApiContainer)
  ) {
    throw new Error("E2E Supabase stack is not running in the gradientpeak_e2e namespace.");
  }
  return containers;
}

function psqlScalar(sql: string, optional = false) {
  return run(
    "docker",
    ["exec", expectedDatabaseContainer, "psql", "-U", "postgres", "-d", "postgres", "-Atc", sql],
    optional,
  );
}

function expectedMigrationVersions() {
  return readdirSync(resolve(supabaseCliRoot, "migrations"))
    .filter((filename) => /^\d{14}_.+\.sql$/.test(filename))
    .sort()
    .map((filename) => filename.slice(0, 14));
}

function appliedMigrationVersions() {
  const result = psqlScalar(
    "select version from supabase_migrations.schema_migrations order by version",
    true,
  );
  return result.status === 0 && result.output ? result.output.split(/\r?\n/).filter(Boolean) : [];
}

function schemaFingerprintDigest() {
  return createHash("sha256")
    .update(readFileSync(resolve(dbPackageRoot, "schema-fingerprint.json")))
    .digest("hex")
    .slice(0, 12);
}

function requireMigrationHistoryCurrent() {
  const expected = expectedMigrationVersions();
  const applied = appliedMigrationVersions();
  if (JSON.stringify(applied) !== JSON.stringify(expected)) {
    throw new Error("E2E migration history is not current for the repository migration set.");
  }
  return applied.length;
}

function migrate() {
  requireRunningE2EStack();
  const applied = appliedMigrationVersions();
  if (applied.length === 0) {
    const publicTableCount = Number(
      psqlScalar(
        "select count(*) from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'",
      ).output,
    );
    if (publicTableCount > 0) {
      throw new Error(
        "Refused baseline bootstrap because the E2E public schema is not genuinely empty.",
      );
    }
  }
  runSupabase(["migration", "up", "--local"]);
  const migrationCount = requireMigrationHistoryCurrent();
  console.info(
    `[db:e2e:migrate] project=gradientpeak_e2e migrations=${migrationCount} schema-fingerprint=${schemaFingerprintDigest()}`,
  );
}

function status() {
  const containers = runningProjectContainers();
  if (containers.length === 0) {
    console.info("[db:e2e:status] project=gradientpeak_e2e state=stopped volumes=preserved");
    return;
  }
  requireRunningE2EStack();
  const migrationCount = requireMigrationHistoryCurrent();
  console.info(
    `[db:e2e:status] project=gradientpeak_e2e state=running api=127.0.0.1:55321 db=127.0.0.1:55322 migrations=${migrationCount} schema-fingerprint=${schemaFingerprintDigest()}`,
  );
}

function execute(action: E2EAction, dryRun: boolean) {
  prepareRuntime();
  if (dryRun) {
    console.info(
      `[db:e2e:${action}] dry-run project=gradientpeak_e2e api=127.0.0.1:55321 db=127.0.0.1:55322 namespace=gradientpeak_e2e`,
    );
    return;
  }
  if (action === "start") {
    runSupabase(["start"]);
    requireRunningE2EStack();
    console.info("[db:e2e:start] project=gradientpeak_e2e state=running");
  } else if (action === "migrate") {
    migrate();
  } else if (action === "status") {
    status();
  } else {
    if (runningProjectContainers().length > 0) runSupabase(["stop"]);
    console.info("[db:e2e:stop] project=gradientpeak_e2e state=stopped volumes=preserved");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const action = process.argv[2] ?? "status";
    const dryRun = process.argv.slice(3).includes("--dry-run");
    const plan = planE2EDatabaseCommand(action, dryRun);
    execute(plan.action, plan.dryRun);
  } catch (error) {
    console.error(`[db:e2e] ${error instanceof Error ? error.message : "Unknown failure."}`);
    process.exitCode = 1;
  }
}
