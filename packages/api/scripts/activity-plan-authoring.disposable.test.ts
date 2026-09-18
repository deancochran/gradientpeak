#!/usr/bin/env tsx

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  activityPlanAdaptationSchema,
  activityPlanSemanticHash,
  activityPlanStructureSchema,
} from "@repo/core/activity-plan";
import {
  applySqlFile,
  bootstrapSupabaseSchemas,
  requireFreshBaseline,
  withDisposableDatabase,
} from "@repo/db/testing/disposable-database";
import { toVerifiedResolverCandidate } from "../src/application/activity-plans/resolver-candidate";
import { activityPlanStructureHash } from "../src/application/activity-plans/structure-hash";

// This cross-package regression belongs to API: API consumes both Core and DB.
// DB's own parity suite must not import the API resolver or hash implementation.
await withDisposableDatabase(
  process.argv.slice(2),
  "api_activity_plan_authoring",
  async (target) => {
    await bootstrapSupabaseSchemas(target);
    const migrations = requireFreshBaseline().migrationPaths;
    const authoringIndex = migrations.findIndex((path) =>
      path.endsWith("20260916000000_activity_plan_authoring_policy.sql"),
    );
    assert.ok(authoringIndex > 0, "authoring migration must follow the historical schema");
    for (const migration of migrations.slice(0, authoringIndex))
      await applySqlFile(target, migration);

    const profileId = randomUUID();
    const id = randomUUID();
    const segmentId = randomUUID();
    const intervalId = randomUUID();
    const stepId = randomUUID();
    const historical = activityPlanStructureSchema.parse({
      version: 3,
      activity_category: "run",
      segments: [
        {
          id: segmentId,
          role: "activity",
          name: "Run",
          intervals: [
            {
              id: intervalId,
              name: "Main",
              repetitions: 1,
              steps: [
                {
                  id: stepId,
                  name: "Legacy",
                  duration: { type: "untilFinished" },
                  targets: [{ type: "speed", intensity: 10 }],
                },
              ],
            },
          ],
        },
      ],
    });
    await target.query(
      "insert into auth.users(id,email,raw_user_meta_data) values ($1,'resolver@example.test','{}')",
      [profileId],
    );
    await target.query("insert into public.profiles(id) values ($1) on conflict do nothing", [
      profileId,
    ]);
    await target.query(
      `insert into public.activity_plans(id,profile_id,name,structure,structure_hash,semantic_hash,training_intent)
    values ($1,$2,'Legacy',$3,$4,$5,'general_maintenance')`,
      [
        id,
        profileId,
        JSON.stringify(historical),
        activityPlanStructureHash(historical),
        activityPlanSemanticHash({
          structure: historical,
          adaptation: null,
          trainingIntent: "general_maintenance",
        }),
      ],
    );
    for (const migration of migrations.slice(authoringIndex)) await applySqlFile(target, migration);

    const rejectHash = (operation: Promise<unknown>) =>
      assert.rejects(operation, (error: unknown) =>
        Boolean(
          error &&
            typeof error === "object" &&
            "code" in error &&
            error.code === "23514" &&
            "constraint" in error &&
            error.constraint === "activity_plans_hash_guard",
        ),
      );
    const readCandidate = async () => {
      const result = await target.query<Parameters<typeof toVerifiedResolverCandidate>[0]>(
        `select id,revision,structure,adaptation,structure_hash as "structureHash",semantic_hash as "semanticHash",
        training_intent as "trainingIntent" from public.activity_plans where id=$1`,
        [id],
      );
      const row = result.rows[0];
      assert.ok(row);
      // Execute the real consumer against the saved row, without mocking validation.
      return toVerifiedResolverCandidate(row);
    };

    const repaired = structuredClone(historical);
    const segment = repaired.segments[0];
    if (segment?.role !== "activity" || !segment.intervals[0]?.steps[0])
      throw new Error("Missing fixture step");
    segment.intervals[0].steps[0].purpose = "work";
    segment.intervals[0].steps[0].duration = { type: "time", seconds: 60 };
    await rejectHash(
      target.query("update public.activity_plans set structure=$2 where id=$1", [
        id,
        JSON.stringify(repaired),
      ]),
    );
    await target.query(
      "update public.activity_plans set structure=$2,structure_hash=$3,semantic_hash=$4,revision=999 where id=$1",
      [
        id,
        JSON.stringify(repaired),
        activityPlanStructureHash(repaired),
        activityPlanSemanticHash({
          structure: repaired,
          adaptation: null,
          trainingIntent: "general_maintenance",
        }),
      ],
    );
    assert.equal((await readCandidate()).revision, 2);
    await rejectHash(
      target.query("update public.activity_plans set semantic_hash=$2 where id=$1", [
        id,
        `v1:sha256:${"a".repeat(64)}`,
      ]),
    );

    const rawAdaptation = {
      controls: [
        {
          id: randomUUID(),
          key: "\tpace\u00a0",
          label: "\ufeffSpeed 😀\t",
          kind: "target_intensity",
          range: { minimum: 8, default: 10, maximum: 12, increment: 1 },
          targets: [
            {
              type: "target_intensity",
              activitySegmentId: segmentId,
              intervalId,
              stepId,
              targetType: "speed",
            },
          ],
        },
      ],
    };
    const adaptation = activityPlanAdaptationSchema.parse(rawAdaptation);
    await target.query(
      "update public.activity_plans set adaptation=$2,semantic_hash=$3,revision=999 where id=$1",
      [
        id,
        JSON.stringify(rawAdaptation),
        activityPlanSemanticHash({
          structure: repaired,
          adaptation,
          trainingIntent: "general_maintenance",
        }),
      ],
    );
    const adapted = await readCandidate();
    assert.equal(adapted.revision, 3);
    assert.deepEqual(adapted.adaptation, adaptation);

    await rejectHash(
      target.query("update public.activity_plans set training_intent='aerobic_base' where id=$1", [
        id,
      ]),
    );
    await target.query(
      "update public.activity_plans set training_intent='aerobic_base',semantic_hash=$2,revision=999 where id=$1",
      [
        id,
        activityPlanSemanticHash({
          structure: repaired,
          adaptation,
          trainingIntent: "aerobic_base",
        }),
      ],
    );
    assert.equal((await readCandidate()).revision, 4);
    await target.query(
      "update public.activity_plans set name='Metadata only',revision=999 where id=$1",
      [id],
    );
    assert.equal((await readCandidate()).revision, 4);

    console.info(
      "[api:activity-plan-authoring] real saved-row resolver checks passed after structure repair, normalized adaptation, intent update and metadata-only update; stale hashes rejected and DB-owned revisions preserved",
    );
  },
);
