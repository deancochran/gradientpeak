#!/usr/bin/env tsx
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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
    writeFileSync(
      resolve(fixture, "supabase/migrations/20260825000000_forward_fix.sql"),
      "BEGIN;\nselect 1;\nCOMMIT;\n",
    ),
  );
  rejects(() =>
    writeFileSync(
      resolve(fixture, "supabase/migrations/20260730000000_duplicate.sql"),
      "select 1;\n",
    ),
  );
  rejects(() => mkdirSync(resolve(fixture, "supabase/migrations/nested")));
  rejects(() => writeFileSync(resolve(fixture, "supabase/migrations/README"), "unexpected\n"));
  rejects(() => {
    const mirror = resolve(fixture, "drizzle/deploy");
    mkdirSync(mirror, { recursive: true });
    writeFileSync(resolve(mirror, "20260730000000_mvp_baseline.sql"), "BEGIN;\nCOMMIT;\n");
  });
  rejects(() => writeFileSync(resolve(fixture, "migration-policy.json"), "{}\n"));
  rejects(() => writeFileSync(resolve(fixture, "migration-ledger.json"), "{}\n"));
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
    symlinkSync(resolve(fixture, "package.json"), linked);
  });
  rejects(() => {
    const path = resolve(fixture, "supabase/migrations/20260730000000_mvp_baseline.sql");
    writeFileSync(path, "select 1;\n");
  });
  console.log("[db:baseline:workflow:test] one fresh-only baseline enforced");
} finally {
  rmSync(fixture, { force: true, recursive: true });
}
