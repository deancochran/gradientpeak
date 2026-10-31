#!/usr/bin/env tsx

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { activityPlanSemanticHash, activityPlanStructureSchema } from "@repo/core/activity-plan";
import {
  applySqlFile,
  bootstrapSupabaseSchemas,
  requireFreshBaseline,
  withDisposableDatabase,
} from "@repo/db/testing/disposable-database";
import { toVerifiedResolverCandidate } from "../src/application/activity-plans/resolver-candidate";
import { activityPlanStructureHash } from "../src/application/activity-plans/structure-hash";

/** Exercises the API's V5 saved-row boundary against only a guarded disposable target. */
await withDisposableDatabase(
  process.argv.slice(2),
  "api_activity_plan_authoring",
  async (target) => {
    await bootstrapSupabaseSchemas(target);
    for (const migration of requireFreshBaseline().migrationPaths)
      await applySqlFile(target, migration);

    const profileId = randomUUID();
    const planId = randomUUID();
    const structure = activityPlanStructureSchema.parse({
      version: 5,
      activity_category: "run",
      items: [
        {
          type: "step",
          id: randomUUID(),
          name: "Easy",
          duration: { type: "time", seconds: 60 },
          targets: [],
        },
      ],
    });
    const semanticHash = activityPlanSemanticHash({
      structure,
      trainingIntent: "general_maintenance",
    });
    await target.query(
      "insert into auth.users(id,email,raw_user_meta_data) values ($1,'resolver@example.test','{}')",
      [profileId],
    );
    await target.query("insert into public.profiles(id) values ($1) on conflict do nothing", [
      profileId,
    ]);
    await target.query(
      "insert into public.activity_plans(id,profile_id,name,structure,structure_hash,semantic_hash,training_intent) values ($1,$2,'V5',$3,$4,$5,'general_maintenance')",
      [
        planId,
        profileId,
        JSON.stringify(structure),
        activityPlanStructureHash(structure),
        semanticHash,
      ],
    );
    const [row] = (
      await target.query<Parameters<typeof toVerifiedResolverCandidate>[0]>(
        'select id,revision,structure,structure_hash as "structureHash",semantic_hash as "semanticHash",training_intent as "trainingIntent" from public.activity_plans where id=$1',
        [planId],
      )
    ).rows;
    assert.ok(row);
    assert.equal(toVerifiedResolverCandidate(row).semantic_hash, semanticHash);
    await assert.rejects(
      target.query("update public.activity_plans set structure=$2 where id=$1", [
        planId,
        JSON.stringify({ version: 3, segments: [] }),
      ]),
    );
    console.info(
      "[api:activity-plan-authoring] V5 saved-row resolver and SQL authoring guard passed",
    );
  },
);
