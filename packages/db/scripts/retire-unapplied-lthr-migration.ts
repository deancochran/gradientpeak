#!/usr/bin/env tsx

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { dbPackageRoot } from "./_local-database-config";

const artifacts = [
  {
    // biome-ignore lint/security/noSecrets: SHA-256 identity of a public generated artifact.
    digest: "d1b206d01f87aa8551c779b29842f3bf0394e67f548468c3e67b3a25e053b552",
    file: "20260904190452_add_lthr_threshold_calibration.sql",
    version: "20260904190452",
  },
  {
    // biome-ignore lint/security/noSecrets: SHA-256 identity of a public generated artifact.
    digest: "c5c5cb5edd095099080830da0f762f5747ba7888dd4b76d51c3656f4f4893fd6",
    file: "20260909185322_restore_current_schema.sql",
    version: "20260909185322",
  },
  {
    // biome-ignore lint/security/noSecrets: SHA-256 identity of a public generated artifact.
    digest: "abfc8bfedb2d923d90bed66831e24ff3ae15be572495cdda5bc8796186aa215a",
    file: "20260909235612_add_activity_source_reference_sync_overview_fields.sql",
    version: "20260909235612",
  },
  {
    // biome-ignore lint/security/noSecrets: SHA-256 identity of a public generated artifact.
    digest: "37ddb1043096afef1b614098012fc62743d0a8d080c744f69055fe462bc18f94",
    file: "20260910001443_restore_current_schema_1.sql",
    version: "20260910001443",
  },
  {
    // biome-ignore lint/security/noSecrets: SHA-256 identity of a public generated artifact.
    digest: "06caa6e4e7730f60014b5f79e938acf74b31aedad594439efcc9157db7884102",
    file: "20260910001444_restore_current_schema_2.sql",
    version: "20260910001444",
  },
] as const;

export function requireRetirableMigration(
  contents: Buffer,
  appliedVersions: string,
  requiredDigest: string,
  migrationVersion = "20260904190452",
) {
  const digest = createHash("sha256").update(contents).digest("hex");
  if (digest !== requiredDigest) {
    throw new Error("Refused to retire an unknown or modified migration artifact.");
  }
  if (appliedVersions.split(/\s+/).includes(migrationVersion)) {
    throw new Error("Refused to retire a migration recorded in local migration history.");
  }
}

function retireMigration() {
  const history = spawnSync(
    "docker",
    [
      "exec",
      "supabase_db_gradientpeak",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-Atc",
      "select version from supabase_migrations.schema_migrations order by version",
    ],
    { encoding: "utf8", stdio: "pipe" },
  );
  if (history.status !== 0) {
    throw new Error("The guarded local database must be running before migration retirement.");
  }

  let retired = 0;
  for (const artifact of artifacts) {
    const migrationFile = resolve(dbPackageRoot, "supabase/migrations", artifact.file);
    if (!existsSync(migrationFile)) continue;
    requireRetirableMigration(
      readFileSync(migrationFile),
      history.stdout ?? "",
      artifact.digest,
      artifact.version,
    );
    rmSync(migrationFile);
    retired += 1;
    console.info(`[db:migration:retire] retired unapplied migration ${artifact.version}`);
  }
  if (retired === 0) console.info("[db:migration:retire] no known unapplied artifact remained");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    retireMigration();
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Migration retirement failed.");
    process.exitCode = 1;
  }
}
