#!/usr/bin/env tsx

import { lookup } from "node:dns/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import type {
  ReanalyzeProfileActivityArtifactsInput,
  ReanalyzeProfileActivityArtifactsResult,
} from "../src/application/activity-file-ingestion/reanalyze-accepted-activity-artifacts";

const uuidSchema = z.string().uuid();
const repositoryDatabasePort = "54322";
const repositoryStoragePort = "54321";
const permittedEndpointHosts = new Set(["127.0.0.1", "localhost", "[::1]"]);
const apiPackageRoot = resolve(dirname(new URL(import.meta.url).pathname), "..");
const repoRoot = resolve(apiPackageRoot, "../..");

const defaultLocalDatabaseUrl =
  // biome-ignore lint/security/noSecrets: Fixed local Supabase development credential, not a deployable secret.
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

type LoadEnvFile = (filePath: string) => void;

/** Loads the same repository-local environment files as other local scripts, before client imports. */
export function prepareReanalysisEnvironment(
  env: Record<string, string | undefined> = process.env,
  loadEnvFile: LoadEnvFile = (filePath) => process.loadEnvFile(filePath),
) {
  const envFiles = [
    join(apiPackageRoot, ".env.local"),
    join(apiPackageRoot, ".env"),
    join(repoRoot, "apps/web/.env.local"),
    join(repoRoot, "apps/web/.env"),
    join(repoRoot, "apps/mobile/.env.local"),
    join(repoRoot, "apps/mobile/.env"),
    join(repoRoot, "packages/db/supabase/.env.local"),
    join(repoRoot, "packages/db/supabase/.env"),
  ];
  for (const filePath of envFiles) {
    if (existsSync(filePath)) loadEnvFile(filePath);
  }

  const databaseUrl = env.DATABASE_URL ?? env.POSTGRES_URL ?? defaultLocalDatabaseUrl;
  env.DATABASE_URL ??= databaseUrl;
  env.POSTGRES_URL ??= databaseUrl;
}

prepareReanalysisEnvironment();

type ReanalyzeProfileActivityArtifactsCliInput = ReanalyzeProfileActivityArtifactsInput & {
  local: boolean;
};

type ResolveEndpoint = (
  hostname: string,
) => Promise<readonly { address: string; family?: number }[]>;

function isLoopbackAddress(address: string) {
  const normalized = address.toLowerCase();
  return (
    normalized.startsWith("127.") ||
    normalized === "::1" ||
    normalized === "0:0:0:0:0:0:0:1" ||
    normalized.startsWith("::ffff:127.")
  );
}

function parseEndpoint(raw: string | undefined, label: "database" | "storage") {
  if (!raw) throw new Error(`Local ${label} endpoint is required`);
  try {
    return new URL(raw);
  } catch {
    throw new Error(`Local ${label} endpoint is invalid`);
  }
}

async function assertEndpointResolvesOnlyToLoopback(
  endpoint: URL,
  label: "database" | "storage",
  resolveEndpoint: ResolveEndpoint,
) {
  if (!permittedEndpointHosts.has(endpoint.hostname)) {
    throw new Error(`Refusing non-loopback ${label} endpoint`);
  }
  let addresses: readonly { address: string }[];
  try {
    addresses = await resolveEndpoint(endpoint.hostname.replace(/^\[|\]$/g, ""));
  } catch {
    throw new Error(`Local ${label} endpoint could not be resolved`);
  }
  if (addresses.length === 0 || addresses.some(({ address }) => !isLoopbackAddress(address))) {
    throw new Error(`Refusing non-loopback resolved ${label} endpoint`);
  }
}

export async function assertRepositoryManagedLocalReanalysisEndpoints(
  env: Record<string, string | undefined>,
  resolveEndpoint: ResolveEndpoint = (hostname) => lookup(hostname, { all: true, verbatim: true }),
) {
  const database = parseEndpoint(env.DATABASE_URL ?? env.POSTGRES_URL, "database");
  if (
    (database.protocol !== "postgresql:" && database.protocol !== "postgres:") ||
    database.port !== repositoryDatabasePort ||
    database.pathname !== "/postgres" ||
    database.search !== "" ||
    database.hash !== ""
  ) {
    throw new Error("Refusing database endpoint outside repository-managed local Supabase");
  }
  await assertEndpointResolvesOnlyToLoopback(database, "database", resolveEndpoint);

  const storage = parseEndpoint(
    env.NEXT_PRIVATE_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL,
    "storage",
  );
  if (
    storage.protocol !== "http:" ||
    storage.port !== repositoryStoragePort ||
    (storage.pathname !== "" && storage.pathname !== "/") ||
    storage.username !== "" ||
    storage.password !== "" ||
    storage.search !== "" ||
    storage.hash !== ""
  ) {
    throw new Error("Refusing storage endpoint outside repository-managed local Supabase");
  }
  await assertEndpointResolvesOnlyToLoopback(storage, "storage", resolveEndpoint);
}

function valueAfter(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

export function parseReanalyzeProfileActivityArtifactsArgs(
  args: string[],
): ReanalyzeProfileActivityArtifactsCliInput {
  let profileId: string | undefined;
  let confirmProfileId: string | undefined;
  let apply = false;
  let local = false;
  let explicitDryRun = false;
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === "--profile-id") {
      profileId = uuidSchema.parse(valueAfter(args, index, flag));
      index += 1;
    } else if (flag === "--confirm-profile-id") {
      confirmProfileId = uuidSchema.parse(valueAfter(args, index, flag));
      index += 1;
    } else if (flag === "--apply") {
      apply = true;
    } else if (flag === "--local") {
      local = true;
    } else if (flag === "--dry-run") {
      explicitDryRun = true;
    } else {
      throw new Error(`Unknown argument: ${flag ?? ""}`);
    }
  }
  if (!profileId) throw new Error("--profile-id is required");
  if (apply && explicitDryRun) throw new Error("--apply and --dry-run cannot be combined");
  if (apply && !local) throw new Error("--apply requires explicit --local");
  if (!apply && local) throw new Error("--local is only valid with --apply");
  if (apply && confirmProfileId !== profileId) {
    throw new Error("--apply requires --confirm-profile-id to exactly match --profile-id");
  }
  if (!apply && confirmProfileId !== undefined) {
    throw new Error("--confirm-profile-id is only valid with --apply");
  }
  return {
    profileId,
    apply,
    local,
    ...(confirmProfileId === undefined ? {} : { confirmProfileId }),
  };
}

async function execute(input: ReanalyzeProfileActivityArtifactsInput) {
  const [
    { db, pool },
    { getActivityArtifactStorageService },
    { reanalyzeProfileActivityArtifacts },
  ] = await Promise.all([
    import("@repo/db/client"),
    import("../src/storage-service"),
    import("../src/application/activity-file-ingestion/reanalyze-accepted-activity-artifacts"),
  ]);
  try {
    return await reanalyzeProfileActivityArtifacts(db, getActivityArtifactStorageService(), input);
  } finally {
    await pool.end();
  }
}

export async function runReanalyzeProfileActivityArtifactsCli(
  args: string[],
  dependencies: {
    execute?: (
      input: ReanalyzeProfileActivityArtifactsInput,
    ) => Promise<ReanalyzeProfileActivityArtifactsResult>;
    env?: Record<string, string | undefined>;
    resolveEndpoint?: ResolveEndpoint;
    write?: (output: string) => void;
  } = {},
) {
  const parsed = parseReanalyzeProfileActivityArtifactsArgs(args);
  if (parsed.apply) {
    await assertRepositoryManagedLocalReanalysisEndpoints(
      dependencies.env ?? process.env,
      dependencies.resolveEndpoint,
    );
  }
  const { local: _local, ...input } = parsed;
  const result = await (dependencies.execute ?? execute)(input);
  (dependencies.write ?? ((output) => process.stdout.write(output)))(
    `${JSON.stringify(result, null, 2)}\n`,
  );
  return result;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  runReanalyzeProfileActivityArtifactsCli(process.argv.slice(2)).catch(() => {
    // This boundary intentionally suppresses parser, storage, and persistence details.
    process.stderr.write("Reanalysis failed\n");
    process.exitCode = 1;
  });
}
