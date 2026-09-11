#!/usr/bin/env tsx

import { pathToFileURL } from "node:url";
import { activityPlanDocumentSchema } from "@repo/core/activity-plan";
import { canonicalTrainingPlanStructureSchema } from "@repo/core/schemas";
import { Pool, type PoolClient } from "pg";
import { defaultLocalDatabaseUrl } from "./_local-database-config";
import { structureHash } from "./canonical-json";

type HashedStructureRow = {
  id: string;
  structure: unknown;
  structure_hash: string;
};

function requireLocalCheck(args: string[]) {
  if (!args.includes("--local")) {
    throw new Error("Activity-plan hash verification requires --local.");
  }
  if (!args.includes("--check") || args.includes("--apply")) {
    throw new Error("Activity-plan hash verification requires --check and never repairs rows.");
  }

  const url = new URL(defaultLocalDatabaseUrl);
  if (url.hostname !== "127.0.0.1" || url.port !== "54322" || url.pathname !== "/postgres") {
    throw new Error(
      "Activity-plan hash verification requires the repository-managed local database.",
    );
  }
}

async function countHashMismatches(
  client: PoolClient,
  table: "activity_plans" | "training_plans",
  schema: { parse: (value: unknown) => unknown },
): Promise<number> {
  const result = await client.query<HashedStructureRow>(
    `select id, structure, structure_hash from public.${table} order by id for update`,
  );
  let mismatchCount = 0;

  for (const row of result.rows) {
    const structure = schema.parse(row.structure);
    const expectedHash = structureHash(structure);
    if (row.structure_hash === expectedHash) continue;
    mismatchCount += 1;
  }

  return mismatchCount;
}

async function main() {
  requireLocalCheck(process.argv.slice(2));
  const pool = new Pool({ connectionString: defaultLocalDatabaseUrl, max: 1 });
  const client = await pool.connect();

  try {
    await client.query("begin");
    await client.query(
      "lock table public.activity_plans, public.training_plans in share row exclusive mode",
    );
    const activityPlanMismatches = await countHashMismatches(
      client,
      "activity_plans",
      activityPlanDocumentSchema,
    );
    const trainingPlanMismatches = await countHashMismatches(
      client,
      "training_plans",
      canonicalTrainingPlanStructureSchema,
    );

    if (activityPlanMismatches + trainingPlanMismatches > 0) {
      throw new Error(
        `Canonical structure hash mismatch: activity_plans=${activityPlanMismatches}, training_plans=${trainingPlanMismatches}`,
      );
    }

    await client.query("rollback");
    process.stdout.write(
      `[db:activity-plan-variants:check] activity_plans=${activityPlanMismatches} training_plans=${trainingPlanMismatches}\n`,
    );
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Activity-plan hash verification failed.",
    );
    process.exitCode = 1;
  });
}
