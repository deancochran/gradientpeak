#!/usr/bin/env tsx

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  applySqlFile,
  bootstrapSupabaseSchemas,
  withDisposableDatabase,
} from "./_disposable-target";
import { dbPackageRoot } from "./_helpers";

type Policy = { authorityDirectory: string };

async function main() {
  const args = process.argv.slice(2);
  await withDisposableDatabase(args, "fresh_verify", async (target, targetUrl) => {
    await bootstrapSupabaseSchemas(target);
    const policy = JSON.parse(
      readFileSync(resolve(dbPackageRoot, "migration-policy.json"), "utf8"),
    ) as Policy;
    const migrationDirectory = resolve(dbPackageRoot, policy.authorityDirectory);
    const migrations = readdirSync(migrationDirectory)
      .filter((file) => file.endsWith(".sql"))
      .sort();
    for (const migration of migrations) {
      await applySqlFile(target, resolve(migrationDirectory, migration));
    }

    const env = { ...process.env, DATABASE_URL: targetUrl, POSTGRES_URL: targetUrl };
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
    execFileSync(
      "pnpm",
      [
        "exec",
        "supabase",
        "db",
        "lint",
        "--db-url",
        targetUrl,
        "--schema",
        "public",
        "--fail-on",
        "warning",
      ],
      { cwd: dbPackageRoot, env, stdio: "inherit" },
    );
    if (args.includes("--diff")) {
      const diff = execFileSync(
        "pnpm",
        [
          "exec",
          "supabase",
          "--workdir",
          "supabase",
          "db",
          "diff",
          "--db-url",
          targetUrl,
          "--schema",
          "public",
        ],
        { cwd: dbPackageRoot, env, encoding: "utf8" },
      );
      if (diff.trim()) throw new Error(`fresh target schema diff is not empty:\n${diff}`);
      console.log("[db:diff] disposable authoritative target has no public schema diff");
    }
    console.log(
      `[db:migration:fresh] ${migrations.length} migrations, parity, fingerprint, storage, security, and lint passed in disposable target`,
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
