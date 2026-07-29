#!/usr/bin/env tsx

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  applySqlFile,
  bootstrapSupabaseSchemas,
  withDisposableDatabase,
} from "./_disposable-target";
import { dbPackageRoot, runSupabaseCli } from "./_helpers";
import {
  autocommitSettings,
  type MigrationLedgerEntry,
  type MigrationPolicy,
} from "./_migration-plan";
import { assertCanonicalActivityPlanStructureInventory } from "./activity-plan-structure-preflight";

async function main() {
  const args = process.argv.slice(2);
  await withDisposableDatabase(args, "fresh_verify", async (target, targetUrl) => {
    await bootstrapSupabaseSchemas(target);
    const policy = JSON.parse(
      readFileSync(resolve(dbPackageRoot, "migration-policy.json"), "utf8"),
    ) as MigrationPolicy;
    const migrationDirectory = resolve(dbPackageRoot, policy.authorityDirectory);
    const ledger = JSON.parse(
      readFileSync(resolve(dbPackageRoot, policy.activeLedgerFile), "utf8"),
    ) as { entries: MigrationLedgerEntry[] };
    for (const migration of ledger.entries) {
      await applySqlFile(
        target,
        resolve(migrationDirectory, `${migration.version}_${migration.name}.sql`),
        migration.executionMode,
        autocommitSettings(policy, migration),
      );
    }
    await assertCanonicalActivityPlanStructureInventory(target);

    const env = {
      ...process.env,
      DATABASE_URL: targetUrl,
      POSTGRES_URL: targetUrl,
      GRADIENTPEAK_FRESH_FINGERPRINT_WRITE: "1",
    };
    const fingerprintArgs = ["exec", "tsx", "scripts/check-schema-fingerprint.ts"];
    if (args.includes("--write-fingerprint")) fingerprintArgs.push("--write");
    execFileSync("pnpm", fingerprintArgs, { cwd: dbPackageRoot, env, stdio: "inherit" });
    execFileSync("pnpm", ["exec", "tsx", "scripts/check-schema-parity.ts"], {
      cwd: dbPackageRoot,
      env,
      stdio: "inherit",
    });
    execFileSync("pnpm", ["exec", "tsx", "scripts/verify-public-table-security.ts"], {
      cwd: dbPackageRoot,
      env,
      stdio: "inherit",
    });
    execFileSync("pnpm", ["exec", "tsx", "scripts/verify-storage-assets.ts"], {
      cwd: dbPackageRoot,
      env,
      stdio: "inherit",
    });
    runSupabaseCli([
      "db",
      "lint",
      "--db-url",
      targetUrl,
      "--schema",
      "public",
      "--fail-on",
      "warning",
    ]);
    if (args.includes("--diff")) {
      const diff = runSupabaseCli(
        ["db", "diff", "--db-url", targetUrl, "--schema", "public"],
        dbPackageRoot,
        "utf8",
      ).toString();
      if (diff.trim()) throw new Error(`fresh target schema diff is not empty:\n${diff}`);
      console.log("[db:diff] disposable authoritative target has no public schema diff");
    }
    console.log(
      `[db:migration:fresh] ${ledger.entries.length} migrations, parity, fingerprint, storage, security, and lint passed in disposable target`,
    );
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[db:migration:fresh] ${error instanceof Error ? error.message : String(error)}`);
    if (error instanceof Error && error.cause) console.error(String(error.cause));
    process.exit(1);
  });
}
