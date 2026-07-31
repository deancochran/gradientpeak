#!/usr/bin/env tsx
import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { dbPackageRoot } from "./_helpers";

const fixture = mkdtempSync(resolve(tmpdir(), "gradientpeak-fresh-only-"));
const workflow = resolve(dbPackageRoot, "scripts/baseline-workflow.ts");
function restore() {
  rmSync(fixture, { force: true, recursive: true });
  cpSync(dbPackageRoot, fixture, {
    recursive: true,
    filter: (path) => !path.includes("node_modules"),
  });
}
function rejects(mutate: () => void) {
  restore();
  mutate();
  try {
    execFileSync("pnpm", ["exec", "tsx", workflow, "check"], {
      cwd: dbPackageRoot,
      env: { ...process.env, GRADIENTPEAK_BASELINE_WORKFLOW_ROOT: fixture },
      stdio: "pipe",
    });
    throw new Error("unsafe migration layout accepted");
  } catch (error) {
    if (error instanceof Error && error.message === "unsafe migration layout accepted") throw error;
  }
}
try {
  restore();
  execFileSync("pnpm", ["exec", "tsx", workflow, "check"], {
    cwd: dbPackageRoot,
    env: { ...process.env, GRADIENTPEAK_BASELINE_WORKFLOW_ROOT: fixture },
    stdio: "pipe",
  });
  rejects(() =>
    writeFileSync(resolve(fixture, "supabase/migrations/20260730000001_extra.sql"), "select 1;\n"),
  );
  rejects(() => mkdirSync(resolve(fixture, "supabase/migrations/nested")));
  rejects(() => writeFileSync(resolve(fixture, "supabase/migrations/README"), "unexpected\n"));
  rejects(() => {
    const baseline = resolve(fixture, "supabase/migrations/20260730000000_mvp_baseline.sql");
    const replacement = resolve(fixture, "supabase/migrations/20260730000000_renamed.sql");
    rmSync(baseline);
    writeFileSync(replacement, "select 1;\n");
  });
  rejects(() => {
    const baseline = resolve(fixture, "supabase/migrations/20260730000000_mvp_baseline.sql");
    const linked = resolve(fixture, "supabase/migrations/linked.sql");
    rmSync(baseline);
    symlinkSync(resolve(fixture, "migration-ledger.json"), linked);
  });
  rejects(() =>
    writeFileSync(
      resolve(fixture, "drizzle/deploy/20260730000000_mvp_baseline.sql"),
      `${readFileSync(resolve(fixture, "drizzle/deploy/20260730000000_mvp_baseline.sql"))}-- drift\n`,
    ),
  );
  rejects(() => rmSync(resolve(fixture, "drizzle/deploy/20260730000000_mvp_baseline.sql")));
  rejects(() => mkdirSync(resolve(fixture, "drizzle/deploy/nested")));
  rejects(() => writeFileSync(resolve(fixture, "drizzle/deploy/README"), "unexpected\n"));
  rejects(() => {
    const policyPath = resolve(fixture, "migration-policy.json");
    const policy = JSON.parse(readFileSync(policyPath, "utf8"));
    policy.baseline.name = "renamed_baseline";
    writeFileSync(policyPath, `${JSON.stringify(policy)}\n`);
  });
  rejects(() => {
    const path = resolve(fixture, "migration-ledger.json");
    const ledger = JSON.parse(readFileSync(path, "utf8"));
    ledger.entries.push(ledger.entries[0]);
    writeFileSync(path, `${JSON.stringify(ledger)}\n`);
  });
  console.log("[db:baseline:workflow:test] fresh-only file, mirror, and ledger restrictions OK");
} finally {
  rmSync(fixture, { force: true, recursive: true });
}
