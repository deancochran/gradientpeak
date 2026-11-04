#!/usr/bin/env tsx

import assert from "node:assert/strict";
import { getSystemActivityTemplateDefinitions, getSystemTrainingPlanDefinitions } from "@repo/core";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { activityPlans, trainingPlans } from "../src/schema/tables";
import { prepareDbEnv } from "./_helpers";

type ContentIdentity = {
  id: string;
  key: string | null;
  version: number | null;
  hash: string | null;
};

function sorted(identities: ContentIdentity[]) {
  return identities.toSorted((left, right) => left.id.localeCompare(right.id));
}

const pool = new Pool({ connectionString: prepareDbEnv() });
const db = drizzle({ client: pool, casing: "snake_case" });

try {
  const [activityDefinitions, trainingDefinitions, activityRows, trainingRows] = await Promise.all([
    getSystemActivityTemplateDefinitions(),
    getSystemTrainingPlanDefinitions(),
    db
      .select({
        id: activityPlans.id,
        key: activityPlans.system_content_key,
        version: activityPlans.system_content_version,
        hash: activityPlans.system_content_hash,
      })
      .from(activityPlans)
      .where(eq(activityPlans.is_system_template, true)),
    db
      .select({
        id: trainingPlans.id,
        key: trainingPlans.system_content_key,
        version: trainingPlans.system_content_version,
        hash: trainingPlans.system_content_hash,
      })
      .from(trainingPlans)
      .where(eq(trainingPlans.is_system_template, true)),
  ]);

  assert.deepEqual(
    sorted(activityRows),
    sorted(
      activityDefinitions.map((definition) => ({
        id: definition.content.id,
        key: definition.key,
        version: definition.version,
        hash: definition.contentHash,
      })),
    ),
    "activity system content does not match the complete Core catalogue",
  );
  assert.deepEqual(
    sorted(trainingRows),
    sorted(
      trainingDefinitions.map((definition) => ({
        id: definition.content.id,
        key: definition.key,
        version: definition.version,
        hash: definition.contentHash,
      })),
    ),
    "training-plan system content does not match the complete Core catalogue",
  );

  console.log(
    `[db:system-content-seed] Core catalogue verified: ${activityRows.length} activity and ${trainingRows.length} training-plan templates`,
  );
} finally {
  await pool.end();
}
