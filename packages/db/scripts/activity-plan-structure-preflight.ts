#!/usr/bin/env tsx

import { pathToFileURL } from "node:url";
import { activityPlanStructureSchemaV3 } from "@repo/core/activity-plan";
import { Pool } from "pg";
import { requireExplicitGuardedDisposableLocalTarget } from "./_target-safety";

type ActivityPlanRow = { id: string; structure: unknown };

export type ActivityPlanStructureInventory = {
  scannedCount: number;
  invalidIds: string[];
};

/** Exact Core contract inventory; never logs persisted structures or validation details. */
export async function inspectActivityPlanStructureInventory(
  pool: Pick<Pool, "query">,
): Promise<ActivityPlanStructureInventory> {
  const result = await pool.query<ActivityPlanRow>(
    "select id, structure from public.activity_plans order by id",
  );
  const invalidIds = result.rows.flatMap(({ id, structure }) =>
    activityPlanStructureSchemaV3.safeParse(structure).success ? [] : [id],
  );
  return { scannedCount: result.rowCount ?? result.rows.length, invalidIds };
}

export async function assertCanonicalActivityPlanStructureInventory(pool: Pick<Pool, "query">) {
  const inventory = await inspectActivityPlanStructureInventory(pool);
  if (inventory.invalidIds.length !== 0) {
    throw new Error(
      `ActivityPlan Core preflight failed: scanned=${inventory.scannedCount} invalid=${inventory.invalidIds.length} invalidIds=${inventory.invalidIds.join(",")}. Explicit environment reset or cleanup is required; no compatibility migration or conversion exists.`,
    );
  }
  return inventory;
}

async function main() {
  const target = requireExplicitGuardedDisposableLocalTarget(process.argv.slice(2));
  const pool = new Pool({ connectionString: target });
  try {
    const inventory = await assertCanonicalActivityPlanStructureInventory(pool);
    console.log(
      `[db:activity-plans:preflight] scanned=${inventory.scannedCount} invalid=0 invalidIds=`,
    );
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(
      `[db:activity-plans:preflight] ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  });
}
