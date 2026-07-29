#!/usr/bin/env tsx

import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { dbPackageRoot } from "./_helpers";
import { statementSha256 } from "./_migration-operations";

const fixtureRoot = mkdtempSync(resolve(tmpdir(), "gradientpeak-migration-workflow-"));
const workflow = resolve(dbPackageRoot, "scripts/migration-workflow.ts");

function restoreFixture() {
  rmSync(fixtureRoot, { force: true, recursive: true });
  cpSync(dbPackageRoot, fixtureRoot, {
    filter: (source) => !source.includes("/node_modules/") && !source.includes("/.turbo/"),
    recursive: true,
  });
}

function expectRejected(name: string, mutate: () => void) {
  restoreFixture();
  mutate();
  try {
    execFileSync("pnpm", ["exec", "tsx", workflow, "check"], {
      cwd: dbPackageRoot,
      env: { ...process.env, GRADIENTPEAK_MIGRATION_WORKFLOW_ROOT: fixtureRoot },
      stdio: "pipe",
    });
    throw new Error(`${name} was accepted`);
  } catch (error) {
    if (error instanceof Error && error.message === `${name} was accepted`) throw error;
  }
}

try {
  restoreFixture();
  execFileSync("pnpm", ["exec", "tsx", workflow, "check"], {
    cwd: dbPackageRoot,
    env: { ...process.env, GRADIENTPEAK_MIGRATION_WORKFLOW_ROOT: fixtureRoot },
    stdio: "pipe",
  });
  expectRejected("mirror tamper", () => {
    const path = resolve(
      fixtureRoot,
      "drizzle/deploy/20260727090002_add_planned_day_summary_index.sql",
    );
    writeFileSync(path, `${readFileSync(path, "utf8")}-- tampered\n`);
  });
  expectRejected("forward SQL hash tamper", () => {
    const path = resolve(
      fixtureRoot,
      "supabase/migrations/20260727090000_add_activity_plan_structure_canonical_check.sql",
    );
    writeFileSync(path, `${readFileSync(path, "utf8")}-- tampered\n`);
  });
  expectRejected("wrong forward order", () => {
    const path = resolve(fixtureRoot, "migration-ledger.json");
    const ledger = JSON.parse(readFileSync(path, "utf8")) as { entries: unknown[] };
    const second = ledger.entries[1];
    const third = ledger.entries[2];
    if (!second || !third) throw new Error("fixture ledger is missing forward entries");
    [ledger.entries[1], ledger.entries[2]] = [third, second];
    writeFileSync(path, `${JSON.stringify(ledger, null, 2)}\n`);
  });
  expectRejected("unsupported execution mode", () => {
    const path = resolve(fixtureRoot, "migration-ledger.json");
    const ledger = JSON.parse(readFileSync(path, "utf8")) as {
      entries: Array<{ executionMode: string }>;
    };
    const forward = ledger.entries[1];
    if (!forward) throw new Error("fixture ledger is missing first forward entry");
    forward.executionMode = "unsafe";
    writeFileSync(path, `${JSON.stringify(ledger, null, 2)}\n`);
  });
  expectRejected("unsupported autocommit operation kind", () => {
    const path = resolve(fixtureRoot, "migration-ledger.json");
    const ledger = JSON.parse(readFileSync(path, "utf8")) as {
      entries: Array<{ operation?: { kind: string } }>;
    };
    const index = ledger.entries[2];
    if (!index?.operation) throw new Error("fixture ledger is missing index operation metadata");
    index.operation.kind = "unsafe";
    writeFileSync(path, `${JSON.stringify(ledger, null, 2)}\n`);
  });
  expectRejected("extra-statement autocommit migration", () => {
    const migrationPath = resolve(
      fixtureRoot,
      "supabase/migrations/20260727090002_add_planned_day_summary_index.sql",
    );
    const changed = `${readFileSync(migrationPath, "utf8")}select 1;\n`;
    writeFileSync(migrationPath, changed);
    const ledgerPath = resolve(fixtureRoot, "migration-ledger.json");
    const ledger = JSON.parse(readFileSync(ledgerPath, "utf8")) as {
      entries: Array<{ sha256: string }>;
    };
    const index = ledger.entries[2];
    if (!index) throw new Error("fixture ledger is missing index entry");
    index.sha256 = statementSha256(changed);
    writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
  });
  expectRejected("exact ledger mismatch", () => {
    const path = resolve(fixtureRoot, "migration-ledger.json");
    const ledger = JSON.parse(readFileSync(path, "utf8")) as { entries: unknown[] };
    ledger.entries.pop();
    writeFileSync(path, `${JSON.stringify(ledger, null, 2)}\n`);
  });
  console.log(
    "[db:migration:workflow:test] integrity rejects forward mirror/hash/order/mode/ledger tampering",
  );
} finally {
  rmSync(fixtureRoot, { force: true, recursive: true });
}
