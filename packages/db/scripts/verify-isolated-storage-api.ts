#!/usr/bin/env tsx

import { execFileSync, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { canonicalJson } from "./canonical-json";

export const STORAGE_API_IMAGE = "public.ecr.aws/supabase/storage-api:v1.62.5";
// biome-ignore lint/security/noSecrets: This is the reviewed public OCI image digest, not a credential.
export const EXPECTED_STORAGE_API_IMAGE_ID =
  "sha256:1dbe962d9862ef12e20357f9d7ba5431989c1daf4a556d6cb20ee4efd1c57320";
// biome-ignore lint/security/noSecrets: This is the reviewed public OCI repository digest, not a credential.
export const EXPECTED_STORAGE_API_REPO_DIGEST =
  "public.ecr.aws/supabase/storage-api@sha256:1dbe962d9862ef12e20357f9d7ba5431989c1daf4a556d6cb20ee4efd1c57320";

type ArtifactProofRow = {
  id: string;
  bucket: string;
  path: string;
  byteSize: number;
  sha256: string;
};
type ContainerInspect = {
  Config?: { Image?: string; Env?: string[] };
  NetworkSettings?: { Networks?: Record<string, unknown> };
  Mounts?: Array<{ Destination?: string; Source?: string; RW?: boolean }>;
  Image?: string;
};
type ImageInspect = { Id?: string; RepoDigests?: string[] };

export function buildStorageContainerSpec(input: {
  name: string;
  network: string;
  storageRoot: string;
  databaseUrl: string;
  sourceEnvironment: string[];
}) {
  const environment = input.sourceEnvironment.map((item) => {
    if (!item.startsWith("DATABASE_URL=")) return item;
    const source = new URL(item.slice("DATABASE_URL=".length));
    source.pathname = new URL(input.databaseUrl).pathname;
    return `DATABASE_URL=${source.toString()}`;
  });
  if (!environment.some((item) => item.startsWith("DATABASE_URL=")))
    throw new Error("source Storage API configuration lacks DATABASE_URL");
  environment.push(`${["DB", "NAMESPACE"].join("_")}=storage`);
  return {
    image: STORAGE_API_IMAGE,
    name: input.name,
    network: input.network,
    mount: { source: realpathSync(input.storageRoot), destination: "/mnt" },
    environment,
  };
}

export function artifactAggregateDigest(rows: ArtifactProofRow[]) {
  return createHash("sha256")
    .update(canonicalJson([...rows].sort((a, b) => a.id.localeCompare(b.id))))
    .digest("hex");
}

export function parseExpectedArtifactCount(raw: string | undefined) {
  if (!raw) throw new Error("--expected-count is required");
  const count = Number(raw);
  if (!Number.isSafeInteger(count) || count <= 0)
    throw new Error("--expected-count must be a positive integer");
  return count;
}

export function verifyExactArtifactSet(
  expected: ArtifactProofRow[],
  actual: ArtifactProofRow[],
  manifestCount: number,
  expectedCount: number,
) {
  if (manifestCount !== expectedCount)
    throw new Error(
      `explicit expected artifact count ${expectedCount} differs from manifest declaration ${manifestCount}`,
    );
  if (manifestCount <= 0 || expected.length !== manifestCount)
    throw new Error("manifest artifact count must be positive and exact");
  if (new Set(expected.map((row) => row.id)).size !== expected.length)
    throw new Error("manifest artifact IDs are not unique");
  if (actual.length !== expectedCount)
    throw new Error(
      `rehearsal artifact count mismatch: expected ${expectedCount}, received ${actual.length}`,
    );
  const normalize = (rows: ArtifactProofRow[]) =>
    [...rows].sort((a, b) => a.id.localeCompare(b.id));
  if (canonicalJson(normalize(expected)) !== canonicalJson(normalize(actual)))
    throw new Error("rehearsal artifact IDs/paths/sizes/digests differ from manifest");
  return { count: expectedCount, aggregateDigest: artifactAggregateDigest(expected) };
}

function dockerJson(args: string[]): unknown {
  return JSON.parse(
    execFileSync("docker", args, { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 }),
  );
}

export function attestStorageContainer(
  inspect: ContainerInspect,
  imageInspect: ImageInspect,
  spec: ReturnType<typeof buildStorageContainerSpec>,
) {
  if (inspect.Config?.Image !== STORAGE_API_IMAGE || spec.image !== STORAGE_API_IMAGE)
    throw new Error("isolated Storage API image tag attestation failed");
  if (
    inspect.Image !== EXPECTED_STORAGE_API_IMAGE_ID ||
    imageInspect.Id !== EXPECTED_STORAGE_API_IMAGE_ID
  )
    throw new Error("isolated Storage API image ID attestation failed");
  if (!imageInspect.RepoDigests?.includes(EXPECTED_STORAGE_API_REPO_DIGEST))
    throw new Error("isolated Storage API RepoDigests attestation failed");
  if (!inspect.NetworkSettings?.Networks?.[spec.network])
    throw new Error("isolated Storage API network attestation failed");
  const mount = inspect.Mounts?.find((item) => item.Destination === spec.mount.destination);
  if (!mount || realpathSync(String(mount.Source)) !== spec.mount.source || mount.RW !== true)
    throw new Error("isolated Storage API mount attestation failed");
  const actualDatabase = inspect.Config?.Env?.find((item) => item.startsWith("DATABASE_URL="));
  const expectedDatabase = spec.environment.find((item) => item.startsWith("DATABASE_URL="));
  if (
    !actualDatabase ||
    !expectedDatabase ||
    new URL(actualDatabase.slice(13)).pathname !== new URL(expectedDatabase.slice(13)).pathname
  )
    throw new Error("isolated Storage API database target attestation failed");
  return {
    image: STORAGE_API_IMAGE,
    imageId: EXPECTED_STORAGE_API_IMAGE_ID,
    repoDigest: EXPECTED_STORAGE_API_REPO_DIGEST,
    network: spec.network,
    mountSource: spec.mount.source,
    mountDestination: spec.mount.destination,
    database: new URL(expectedDatabase.slice(13)).pathname.slice(1),
  };
}

export function attestCleanup(
  containerName: string,
  removeStatus: number | null,
  remainingNames: string[],
) {
  const containerAbsent = !remainingNames.includes(containerName);
  if (!containerAbsent) throw new Error("isolated Storage API cleanup left its container behind");
  return { attempted: true, removeStatus, removed: true, containerAbsent };
}

async function waitForReady(baseUrl: string, name: string) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const running =
      spawnSync("docker", ["inspect", "-f", "{{.State.Running}}", name], {
        encoding: "utf8",
      }).stdout.trim() === "true";
    if (!running) throw new Error("isolated Storage API exited before readiness");
    try {
      const response = await fetch(`${baseUrl}/status`);
      if (response.status < 500) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("isolated Storage API readiness timed out");
}

async function main() {
  const argument = (name: string) =>
    process.argv
      .slice(2)
      .find((item) => item.startsWith(`--${name}=`))
      ?.slice(name.length + 3);
  const databaseUrl = argument("database-url") ?? process.env.MULTISPORT_REHEARSAL_DATABASE_URL;
  const storageRoot = argument("storage-root");
  const manifestPath = argument("manifest");
  const outputPath = argument("output");
  const explicitExpectedCount = parseExpectedArtifactCount(argument("expected-count"));
  const databaseContainer = argument("db-container") ?? "supabase_db_gradientpeak";
  const sourceStorageContainer =
    argument("source-storage-container") ?? "supabase_storage_gradientpeak";
  if (!databaseUrl || !storageRoot || !manifestPath || !outputPath)
    throw new Error("--database-url, --storage-root, --manifest, and --output are required");
  if (!existsSync(dirname(outputPath)) || !lstatSync(dirname(outputPath)).isDirectory())
    throw new Error("proof output parent directory does not exist");
  const parsedDatabase = new URL(databaseUrl);
  if (parsedDatabase.pathname === "/postgres")
    throw new Error("isolated Storage API harness refuses the real postgres database");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    runId: string;
    checksum: string;
    staging?: { counts: { artifacts: number }; artifacts: Array<Record<string, unknown>> };
  };
  const { checksum, ...unsigned } = manifest;
  if (createHash("sha256").update(canonicalJson(unsigned)).digest("hex") !== checksum)
    throw new Error("cutover manifest checksum mismatch");
  const expected = (manifest.staging?.artifacts ?? []).map((row) => ({
    id: String(row.artifact_id),
    bucket: String(row.accepted_bucket),
    path: String(row.accepted_path),
    byteSize: Number(row.byte_size),
    sha256: String(row.digest),
  }));
  const declaredCount = manifest.staging?.counts.artifacts ?? 0;
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  let actual: ArtifactProofRow[];
  try {
    const result = await client.query<{
      id: string;
      bucket: string;
      path: string;
      byte_size: string;
      digest: string;
    }>(
      "select id::text,bucket,path,byte_size::text,digest from public.activity_artifacts order by id",
    );
    actual = result.rows.map((row) => ({
      id: row.id,
      bucket: row.bucket,
      path: row.path,
      byteSize: Number(row.byte_size),
      sha256: row.digest,
    }));
  } finally {
    await client.end();
  }
  const exact = verifyExactArtifactSet(expected, actual, declaredCount, explicitExpectedCount);

  const sourceInspect = (dockerJson(["inspect", sourceStorageContainer]) as ContainerInspect[])[0];
  const imageInspect = (dockerJson(["image", "inspect", STORAGE_API_IMAGE]) as ImageInspect[])[0];
  const databaseInspect = (dockerJson(["inspect", databaseContainer]) as ContainerInspect[])[0];
  if (!sourceInspect || !imageInspect || !databaseInspect)
    throw new Error("Docker attestation inspection returned no result");
  if (
    sourceInspect.Config?.Image !== STORAGE_API_IMAGE ||
    sourceInspect.Image !== EXPECTED_STORAGE_API_IMAGE_ID
  )
    throw new Error("reviewed source Storage API image/tag digest mismatch");
  if (
    imageInspect.Id !== EXPECTED_STORAGE_API_IMAGE_ID ||
    !imageInspect.RepoDigests?.includes(EXPECTED_STORAGE_API_REPO_DIGEST)
  )
    throw new Error("reviewed Storage API image repository digest mismatch");
  const network = Object.keys(databaseInspect.NetworkSettings?.Networks ?? {})[0];
  const sourceEnvironment = sourceInspect.Config?.Env;
  if (!network || !sourceEnvironment)
    throw new Error("reviewed Docker network/environment inspection failed");
  const spec = buildStorageContainerSpec({
    name: `gradientpeak-storage-cutover-${randomUUID()}`,
    network,
    storageRoot,
    databaseUrl,
    sourceEnvironment,
  });
  const database = parsedDatabase.pathname.slice(1);
  execFileSync(
    "docker",
    [
      "exec",
      databaseContainer,
      "psql",
      "-U",
      "supabase_admin",
      "-d",
      database,
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      "grant usage,create on schema storage to supabase_storage_admin; grant all privileges on all tables in schema storage to supabase_storage_admin; grant all privileges on all sequences in schema storage to supabase_storage_admin; grant execute on all functions in schema storage to supabase_storage_admin; alter table storage.migrations owner to supabase_storage_admin; grant usage on schema storage to service_role; grant select on storage.buckets,storage.objects to service_role;",
    ],
    { stdio: "ignore" },
  );
  let proofBase: Record<string, unknown> | undefined;
  let cleanup: ReturnType<typeof attestCleanup> | undefined;
  try {
    const run = [
      "run",
      "-d",
      "--name",
      spec.name,
      "--network",
      spec.network,
      "-p",
      "127.0.0.1::5000",
      "-v",
      `${spec.mount.source}:${spec.mount.destination}`,
    ];
    for (const environment of spec.environment) run.push("-e", environment);
    run.push(spec.image);
    execFileSync("docker", run, { stdio: "ignore" });
    const inspect = (dockerJson(["inspect", spec.name]) as ContainerInspect[])[0];
    if (!inspect) throw new Error("isolated container inspection returned no result");
    const attestation = attestStorageContainer(inspect, imageInspect, spec);
    const port = execFileSync("docker", ["port", spec.name, "5000/tcp"], { encoding: "utf8" })
      .trim()
      .match(/:(\d+)$/)?.[1];
    if (!port) throw new Error("isolated port was not assigned");
    await waitForReady(`http://127.0.0.1:${port}`, spec.name);
    const serviceKey = spec.environment.find((item) => item.startsWith("SERVICE_KEY="))?.slice(12);
    if (!serviceKey)
      throw new Error("reviewed local Storage configuration lacks service credentials");
    let downloaded = 0;
    const verified: ArtifactProofRow[] = [];
    for (const artifact of expected) {
      const response = await fetch(
        `http://127.0.0.1:${port}/object/authenticated/${artifact.bucket}/${artifact.path}`,
        { headers: { authorization: `Bearer ${serviceKey}`, apikey: serviceKey } },
      );
      if (!response.ok)
        throw new Error(
          `isolated Storage API download failed for manifest artifact ${artifact.id}: ${response.status}`,
        );
      downloaded++;
      const bytes = Buffer.from(await response.arrayBuffer());
      if (
        bytes.length !== artifact.byteSize ||
        createHash("sha256").update(bytes).digest("hex") !== artifact.sha256
      )
        throw new Error(`isolated Storage API bytes mismatch for manifest artifact ${artifact.id}`);
      verified.push(artifact);
    }
    if (
      downloaded !== explicitExpectedCount ||
      verified.length !== explicitExpectedCount ||
      artifactAggregateDigest(verified) !== exact.aggregateDigest
    )
      throw new Error("isolated Storage API proof did not verify the complete manifest set");
    proofBase = {
      runId: manifest.runId,
      manifestChecksum: checksum,
      ...attestation,
      expectedCount: explicitExpectedCount,
      manifestCount: declaredCount,
      databaseCount: actual.length,
      downloadedCount: downloaded,
      verifiedCount: verified.length,
      aggregateDigest: exact.aggregateDigest,
    };
  } finally {
    const removed = spawnSync("docker", ["rm", "-f", spec.name], { stdio: "ignore" });
    const remaining = execFileSync(
      "docker",
      ["ps", "-a", "--filter", `name=${spec.name}`, "--format", "{{.Names}}"],
      { encoding: "utf8" },
    )
      .split("\n")
      .filter(Boolean);
    cleanup = attestCleanup(spec.name, removed.status, remaining);
  }
  if (!proofBase || !cleanup) throw new Error("isolated Storage API proof did not complete");
  const proof = { ...proofBase, cleanup };
  writeFileSync(outputPath, `${JSON.stringify(proof, null, 2)}\n`);
  console.log(JSON.stringify(proof));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(
      `[multisport:storage-api] ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
}
