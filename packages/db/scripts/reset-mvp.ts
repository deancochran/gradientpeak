#!/usr/bin/env tsx

import { pathToFileURL } from "node:url";
import { defaultLocalDatabaseUrl, prepareDbEnv, runPnpmExec, runSupabaseCli } from "./_helpers";
import { requireFreshBaseline } from "./baseline-workflow";

export function assertMvpResetSafe(databaseUrl: string) {
  const expected = new URL(defaultLocalDatabaseUrl);
  let actual: URL;
  try {
    actual = new URL(databaseUrl);
  } catch {
    throw new Error("refusing malformed database URL for MVP reset");
  }
  if (
    actual.protocol !== expected.protocol ||
    actual.hostname !== expected.hostname ||
    actual.port !== expected.port ||
    actual.pathname !== expected.pathname
  ) {
    throw new Error("refusing MVP reset outside the repository-managed local database");
  }
}

export function resetMvp(
  databaseUrl = prepareDbEnv(),
  run: (args: string[]) => void = (args) => {
    runSupabaseCli(args);
  },
  runSeed: (args: string[]) => void = (args) => {
    runPnpmExec(args);
  },
) {
  assertMvpResetSafe(databaseUrl);
  requireFreshBaseline();
  run(["db", "reset", "--local"]);
  runSeed(["tsx", "scripts/seed-templates.ts"]);
  runSeed(["tsx", "scripts/seed-training-plan-templates.ts"]);
  runSeed(["tsx", "scripts/verify-system-content-seed.ts"]);
}

function main() {
  if (process.argv.length !== 2) {
    throw new Error("db:reset:mvp accepts no target or Supabase CLI flags");
  }
  resetMvp();
  console.log(
    "[db:reset:mvp] repository-managed local MVP baseline and Core system content reset completed",
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(`[db:reset:mvp] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
