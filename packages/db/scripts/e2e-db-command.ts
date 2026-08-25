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
import { dbPackageRoot, defaultLocalDatabaseUrl, supabaseCliRoot } from "./_local-database-config";
import { buildE2ESupabaseConfig, requireSafeE2EEnvironment } from "./e2e-db-environment";

type E2EAction = "migrate" | "start" | "status" | "stop";

const runtimeRoot = resolve(process.env.TMPDIR ?? "/tmp", "gradientpeak-supabase-e2e");
const runtimeSupabaseRoot = resolve(runtimeRoot, "supabase");
const expectedDatabaseContainer = "supabase_db_gradientpeak_e2e";
const expectedApiContainer = "supabase_kong_gradientpeak_e2e";
const e2eNetworkName = "gradientpeak_e2e_loopback";
const require = createRequire(import.meta.url);
const supabaseCliEntryPoint = resolve(
  dirname(require.resolve("supabase/package.json")),
  "dist",
  "supabase.js",
);
const tsxCliEntryPoint = require.resolve("tsx/cli");

type ContainerInspection = {
  Config?: { Labels?: Record<string, string> };
  Name?: string;
  NetworkSettings?: {
    Ports?: Record<string, Array<{ HostIp?: string; HostPort?: string }> | null>;
  };
};

type NetworkInspection = {
  Driver?: string;
  Labels?: Record<string, string>;
  Name?: string;
  Options?: Record<string, string>;
};

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

function run(
  command: string,
  args: string[],
  optional = false,
  environment: NodeJS.ProcessEnv = process.env,
) {
  const result = spawnSync(command, args, {
    cwd: dbPackageRoot,
    encoding: "utf8",
    env: environment,
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

export function e2eSupabaseStartArguments() {
  return ["start", "--network-id", e2eNetworkName];
}

export function requireE2ELoopbackNetwork(inspection: NetworkInspection) {
  if (
    inspection.Name !== e2eNetworkName ||
    inspection.Driver !== "bridge" ||
    inspection.Labels?.["com.gradientpeak.environment"] !== "e2e" ||
    inspection.Options?.["com.docker.network.bridge.host_binding_ipv4"] !== "127.0.0.1"
  ) {
    throw new Error("Docker E2E loopback network identity did not match gradientpeak_e2e.");
  }
  return inspection.Name;
}

function prepareE2ELoopbackNetwork() {
  const existing = run("docker", ["network", "inspect", e2eNetworkName], true);
  if (existing.status !== 0) {
    run("docker", [
      "network",
      "create",
      "--driver",
      "bridge",
      "--label",
      "com.gradientpeak.environment=e2e",
      "--opt",
      "com.docker.network.bridge.host_binding_ipv4=127.0.0.1",
      e2eNetworkName,
    ]);
  }
  const inspected = run("docker", ["network", "inspect", e2eNetworkName]);
  let networks: NetworkInspection[];
  try {
    networks = JSON.parse(inspected.output) as NetworkInspection[];
  } catch {
    throw new Error("Docker E2E loopback network inspection returned invalid identity metadata.");
  }
  if (networks.length !== 1 || !networks[0]) {
    throw new Error("Docker E2E loopback network inspection was not unique.");
  }
  requireE2ELoopbackNetwork(networks[0]);
}

function runningProjectContainers() {
  const result = run("docker", ["ps", "--format", "{{.Names}}"], true);
  if (result.status !== 0) return [];
  return result.output.split(/\r?\n/).filter((name) => name.endsWith("_gradientpeak_e2e"));
}

export function requireE2EContainerIdentity(inspections: ContainerInspection[]) {
  for (const inspection of inspections) {
    const labels = inspection.Config?.Labels;
    if (
      !inspection.Name?.endsWith("_gradientpeak_e2e") ||
      labels?.["com.supabase.cli.project"] !== "gradientpeak_e2e" ||
      labels["com.docker.compose.project"] !== "gradientpeak_e2e"
    ) {
      throw new Error("E2E Supabase container namespace metadata did not match gradientpeak_e2e.");
    }
  }
  const names = new Set(inspections.map(({ Name }) => Name));
  if (
    inspections.length === 0 ||
    (!names.has(`/${expectedDatabaseContainer}`) && !names.has(`/${expectedApiContainer}`))
  ) {
    throw new Error("E2E Supabase stack identity did not contain an expected E2E service.");
  }
  return inspections.length;
}

export function requireE2EContainerNamespace(inspections: ContainerInspection[]) {
  const isLoopbackBinding = (hostIp: string | undefined) =>
    hostIp === "127.0.0.1" || hostIp === "::1";

  requireE2EContainerIdentity(inspections);
  const publishedBindings = inspections.flatMap((inspection) =>
    Object.values(inspection.NetworkSettings?.Ports ?? {}).flatMap((bindings) => bindings ?? []),
  );
  if (publishedBindings.some(({ HostIp }) => !isLoopbackBinding(HostIp))) {
    throw new Error("E2E Supabase container published port was not bound to loopback.");
  }
  const byName = new Map(inspections.map((inspection) => [inspection.Name, inspection]));
  const expected = [
    { containerPort: "5432/tcp", hostPort: "55322", name: `/${expectedDatabaseContainer}` },
    { containerPort: "8000/tcp", hostPort: "55321", name: `/${expectedApiContainer}` },
  ];

  for (const identity of expected) {
    const inspection = byName.get(identity.name);
    const labels = inspection?.Config?.Labels;
    if (
      labels?.["com.supabase.cli.project"] !== "gradientpeak_e2e" ||
      labels["com.docker.compose.project"] !== "gradientpeak_e2e"
    ) {
      throw new Error("E2E Supabase container namespace metadata did not match gradientpeak_e2e.");
    }
    const bindings = inspection?.NetworkSettings?.Ports?.[identity.containerPort] ?? [];
    if (
      !bindings.some(
        ({ HostIp, HostPort }) => HostPort === identity.hostPort && isLoopbackBinding(HostIp),
      )
    ) {
      throw new Error(`E2E Supabase container published port did not match ${identity.hostPort}.`);
    }
  }

  if (
    publishedBindings.some(({ HostPort }) => {
      const numericPort = Number(HostPort);
      return !Number.isInteger(numericPort) || numericPort < 55_320 || numericPort > 55_329;
    })
  ) {
    throw new Error(
      "E2E Supabase container published port was outside the reserved 55320-55329 range.",
    );
  }
  return inspections.length;
}

function requireRunningE2EStack() {
  const containers = runningProjectContainers();
  if (
    !containers.includes(expectedDatabaseContainer) ||
    !containers.includes(expectedApiContainer)
  ) {
    throw new Error("E2E Supabase stack is not running in the gradientpeak_e2e namespace.");
  }
  requireE2EContainerNamespace(inspectContainers(containers));
  return containers;
}

function inspectContainers(containers: string[]) {
  const inspectionResult = run("docker", ["inspect", ...containers]);
  let inspections: ContainerInspection[];
  try {
    inspections = JSON.parse(inspectionResult.output) as ContainerInspection[];
  } catch {
    throw new Error("E2E Supabase container inspection returned invalid identity metadata.");
  }
  return inspections;
}

function stopIdentifiedE2EStack() {
  const containers = runningProjectContainers();
  if (containers.length === 0) return;
  requireE2EContainerIdentity(inspectContainers(containers));
  runSupabase(["stop"]);
}

export function runGuardedE2EStart(
  start: () => unknown,
  validate: () => unknown,
  stopIdentifiedStack: () => unknown,
) {
  try {
    start();
    return validate();
  } catch (error) {
    try {
      stopIdentifiedStack();
    } catch {
      throw new Error("E2E start failed and targeted cleanup could not be verified.");
    }
    throw error;
  }
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

export function requireOrderedMigrationPrefix(applied: string[], expected: string[]) {
  if (
    applied.length > expected.length ||
    applied.some((version, index) => expected[index] !== version)
  ) {
    throw new Error("E2E migration history is not an ordered prefix of repository migrations.");
  }
  return applied.length;
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

function requireSchemaFingerprintCurrent() {
  const databaseUrl = new URL(defaultLocalDatabaseUrl);
  if (
    !["127.0.0.1", "localhost", "::1"].includes(databaseUrl.hostname) ||
    databaseUrl.port !== "54322"
  ) {
    throw new Error(
      "Refused E2E schema verification because the local DB authority is unexpected.",
    );
  }
  databaseUrl.port = "55322";
  run(
    process.execPath,
    [tsxCliEntryPoint, resolve(dbPackageRoot, "scripts/check-schema-fingerprint.ts")],
    false,
    {
      ...process.env,
      DATABASE_URL: databaseUrl.toString(),
      POSTGRES_URL: databaseUrl.toString(),
    },
  );
  return schemaFingerprintDigest();
}

function migrate() {
  requireRunningE2EStack();
  const expected = expectedMigrationVersions();
  const applied = appliedMigrationVersions();
  requireOrderedMigrationPrefix(applied, expected);
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
  const fingerprint = requireSchemaFingerprintCurrent();
  console.info(
    `[db:e2e:migrate] project=gradientpeak_e2e migrations=${migrationCount} schema-fingerprint=${fingerprint}`,
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
  const fingerprint = requireSchemaFingerprintCurrent();
  console.info(
    `[db:e2e:status] project=gradientpeak_e2e state=running api=127.0.0.1:55321 db=127.0.0.1:55322 migrations=${migrationCount} schema-fingerprint=${fingerprint}`,
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
    prepareE2ELoopbackNetwork();
    runGuardedE2EStart(
      () => runSupabase(e2eSupabaseStartArguments()),
      () => requireRunningE2EStack(),
      () => stopIdentifiedE2EStack(),
    );
    const expected = expectedMigrationVersions();
    const applied = appliedMigrationVersions();
    requireOrderedMigrationPrefix(applied, expected);
    if (applied.length === expected.length) {
      const fingerprint = requireSchemaFingerprintCurrent();
      console.info(
        `[db:e2e:start] project=gradientpeak_e2e state=running migrations=${applied.length} schema-fingerprint=${fingerprint}`,
      );
    } else {
      console.info(
        `[db:e2e:start] project=gradientpeak_e2e state=running readiness=pending-migration applied=${applied.length} expected=${expected.length}`,
      );
    }
  } else if (action === "migrate") {
    migrate();
  } else if (action === "status") {
    status();
  } else {
    stopIdentifiedE2EStack();
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
