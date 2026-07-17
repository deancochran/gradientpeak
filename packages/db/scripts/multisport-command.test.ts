import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { completedActivitySegmentSchemaV1 } from "@repo/core/activity-segments";

import {
  buildHistoricalSegmentSummary,
  CUTOVER_MIGRATION_VERSION,
  CUTOVER_TOOL_VERSION,
  checksumManifest,
  promoteContentAddressed,
  verifyManifestChecksum,
  verifyPgRestoreDiagnostics,
  verifyStorageEntries,
} from "./multisport-command";
import {
  attestCleanup,
  attestStorageContainer,
  buildStorageContainerSpec,
  EXPECTED_STORAGE_API_IMAGE_ID,
  EXPECTED_STORAGE_API_REPO_DIGEST,
  parseExpectedArtifactCount,
  STORAGE_API_IMAGE,
  verifyExactArtifactSet,
} from "./verify-isolated-storage-api";

const base = {
  version: 2,
  toolVersion: CUTOVER_TOOL_VERSION,
  migrationVersion: CUTOVER_MIGRATION_VERSION,
  runId: "11111111-1111-4111-8111-111111111111",
  target: "rehearsal",
  generatedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  gitCommit: "abc",
  database: {
    database: "rehearsal",
    databaseOid: "1",
    server: "local",
    systemIdentifier: "1",
    ledger: [],
    ledgerHash: "a",
    schemaHash: "schema",
  },
  snapshot: {
    counts: {},
    ids: {},
    idHashes: {},
    rowHashes: {},
    applicationTables: {},
    applicationStateHash: "state",
    hash: "b",
  },
  backup: { path: "/backup", sha256: "c", restoreListHash: "d" },
  storageArchive: { path: "/storage", sha256: "e" },
  storageRoot: "/storage-root",
  sourceStorageInventory: [],
  sourceStorageInventoryHash: "f",
  phases: { guard: { at: new Date().toISOString(), hash: "g" } },
} as const;
const manifest = { ...base, checksum: checksumManifest(base as never) };
assert.doesNotThrow(() => verifyManifestChecksum(manifest as never));
assert.throws(
  () =>
    verifyManifestChecksum({
      ...manifest,
      snapshot: { ...manifest.snapshot, hash: "tampered" },
    } as never),
  /checksum mismatch/,
);
const harmlessRestore = `pg_restore: error: could not execute query: ERROR: permission denied to set parameter "log_min_messages"\nCommand was: CREATE FUNCTION realtime.list_changes()\npg_restore: error: could not execute query: ERROR: permission denied for table secrets\nCommand was: COPY vault.secrets FROM stdin;\npg_restore: warning: errors ignored on restore: 2\n`;
assert.deepEqual(verifyPgRestoreDiagnostics(1, harmlessRestore), [
  "realtime_log_min_messages",
  "vault_secrets_copy",
]);
assert.throws(
  () =>
    verifyPgRestoreDiagnostics(
      1,
      "pg_restore: error: relation missing\npg_restore: warning: errors ignored on restore: 1",
    ),
  /unapproved/,
);
const stale = { ...base, expiresAt: new Date(Date.now() - 1).toISOString() };
assert.throws(
  () => verifyManifestChecksum({ ...stale, checksum: checksumManifest(stale as never) } as never),
  /stale/,
);

const root = mkdtempSync(resolve(tmpdir(), "gradientpeak-content-address-"));
try {
  const source = resolve(root, "source.fit");
  writeFileSync(source, "immutable-bytes");
  const digest = "3e920b571c9cc6239e87c7bf5e8e86531beb4605b71adc6b8efcca976e39b913";
  const first = promoteContentAddressed({
    sourcePath: source,
    storageRoot: root,
    bucket: "activity-files",
    profileId: "22222222-2222-4222-8222-222222222222",
    digest,
    byteSize: 15,
  });
  const second = promoteContentAddressed({
    sourcePath: source,
    storageRoot: root,
    bucket: "activity-files",
    profileId: "22222222-2222-4222-8222-222222222222",
    digest,
    byteSize: 15,
  });
  assert.equal(first.destination, second.destination);
  writeFileSync(first.destination, "tampered");
  assert.throws(
    () => verifyStorageEntries(root, [first.entry]),
    /storage manifest mismatch/,
    "corrupt bytes extracted from an archive must fail full manifest verification",
  );
  const storageSpec = buildStorageContainerSpec({
    name: "isolated-test",
    network: "isolated-network",
    storageRoot: root,
    databaseUrl:
      "postgresql://postgres:postgres@127.0.0.1:54322/gradientpeak_multisport_rehearsal_test",
    sourceEnvironment: [
      "DATABASE_URL=postgresql://storage@db/postgres",
      "SERVICE_KEY=test-key",
      "FILE_STORAGE_BACKEND_PATH=/mnt",
    ],
  });
  assert.equal(storageSpec.image, STORAGE_API_IMAGE);
  assert.match(
    storageSpec.environment.find((item) => item.startsWith("DATABASE_URL=")) ?? "",
    /gradientpeak_multisport_rehearsal_test/,
  );
  const validContainer = {
    Config: { Image: STORAGE_API_IMAGE, Env: storageSpec.environment },
    NetworkSettings: { Networks: { "isolated-network": {} } },
    Mounts: [{ Destination: "/mnt", Source: root, RW: true }],
    Image: EXPECTED_STORAGE_API_IMAGE_ID,
  };
  const validImage = {
    Id: EXPECTED_STORAGE_API_IMAGE_ID,
    RepoDigests: [EXPECTED_STORAGE_API_REPO_DIGEST],
  };
  assert.deepEqual(attestStorageContainer(validContainer, validImage, storageSpec), {
    image: STORAGE_API_IMAGE,
    imageId: EXPECTED_STORAGE_API_IMAGE_ID,
    repoDigest: EXPECTED_STORAGE_API_REPO_DIGEST,
    network: "isolated-network",
    mountSource: root,
    mountDestination: "/mnt",
    database: "gradientpeak_multisport_rehearsal_test",
  });
  assert.throws(
    () =>
      attestStorageContainer(
        {
          ...validContainer,
          Config: { ...validContainer.Config, Image: "retagged/storage:latest" },
        },
        validImage,
        storageSpec,
      ),
    /tag attestation/,
  );
  assert.throws(
    () =>
      attestStorageContainer({ ...validContainer, Image: "sha256:wrong" }, validImage, storageSpec),
    /image ID/,
  );
  assert.throws(
    () =>
      attestStorageContainer(
        validContainer,
        { ...validImage, RepoDigests: [`${STORAGE_API_IMAGE}@sha256:wrong`] },
        storageSpec,
      ),
    /RepoDigests/,
  );
  const artifact = {
    id: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
    bucket: "activity-files",
    path: "artifacts/sha256/profile/digest",
    byteSize: 15,
    sha256: digest,
  };
  assert.equal(parseExpectedArtifactCount("45"), 45);
  assert.throws(() => parseExpectedArtifactCount(undefined), /required/);
  assert.throws(() => parseExpectedArtifactCount("0"), /positive integer/);
  assert.deepEqual(verifyExactArtifactSet([artifact], [artifact], 1, 1).count, 1);
  assert.throws(
    () => verifyExactArtifactSet([artifact], [artifact], 1, 2),
    /differs from manifest/,
  );
  assert.throws(() => verifyExactArtifactSet([], [], 0, 0), /positive and exact|positive integer/);
  assert.throws(() => verifyExactArtifactSet([artifact], [], 1, 1), /count mismatch/);
  assert.throws(
    () =>
      verifyExactArtifactSet(
        [artifact],
        [artifact, { ...artifact, id: "bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb" }],
        1,
        1,
      ),
    /count mismatch/,
  );
  assert.throws(
    () => verifyExactArtifactSet([artifact], [{ ...artifact, sha256: "0".repeat(64) }], 1, 1),
    /differ from manifest/,
  );
  assert.deepEqual(attestCleanup("container", 0, []), {
    attempted: true,
    removeStatus: 0,
    removed: true,
    containerAbsent: true,
  });
  assert.throws(() => attestCleanup("container", 1, ["container"]), /left its container behind/);
  assert.throws(
    () =>
      promoteContentAddressed({
        sourcePath: source,
        storageRoot: root,
        bucket: "activity-files",
        profileId: "22222222-2222-4222-8222-222222222222",
        digest,
        byteSize: 15,
      }),
    /destination mismatch/,
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log("Multisport cutover manifest and content-address tests passed.");

const invalidSummary = buildHistoricalSegmentSummary({
  type: "run",
  duration_ms: 1000,
  moving_ms: 1000,
  distance_meters: null,
  elevation_gain_meters: null,
  elevation_loss_meters: null,
  calories: null,
  avg_heart_rate: null,
  avg_power: null,
  avg_cadence: 501,
  avg_speed_mps: null,
  pool_length: null,
  laps: [],
  total_strokes: null,
  avg_swolf: null,
});
assert.throws(
  () =>
    completedActivitySegmentSchemaV1.parse({
      id: "dddddddd-dddd-4ddd-addd-dddddddddddd",
      ordinal: 0,
      startOffsetMs: 0,
      endOffsetMs: 1000,
      role: "activity",
      category: "run",
      summary: invalidSummary,
    }),
  /too big|500/i,
  "invalid historical cadence must fail before migration staging",
);
