import assert from "node:assert/strict";
import {
  type ActivityPlanTrainingIntent,
  activityPlanAuthoringStructureSchema,
  activityPlanSemanticHash,
  activityPlanStructureSchema,
} from "@repo/core/activity-plan";
import type { Pool } from "pg";
import {
  applySqlFile,
  bootstrapSupabaseSchemas,
  withDisposableDatabase,
} from "./_disposable-target";
import { installActivityPlanSqlFunctions } from "./activity-plan-sql-artifacts";
import { requireFreshBaseline } from "./baseline-workflow";
import { structureHash } from "./canonical-json";

const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
const structure = () => ({
  version: 5 as const,
  activity_category: "run" as const,
  items: [
    {
      type: "step" as const,
      id: id(1),
      duration: { type: "time" as const, seconds: 60 },
      targets: [{ type: "RPE" as const, intensity: 5 }],
    },
  ],
});
const hashes = (value: unknown, intent: ActivityPlanTrainingIntent = "general_maintenance") => ({
  structure: structureHash(value),
  semantic: activityPlanSemanticHash({
    structure: activityPlanStructureSchema.parse(value),
    trainingIntent: intent,
  }),
});
async function rejects(action: Promise<unknown>, constraint?: string) {
  await assert.rejects(action, (error: unknown) => {
    const pg = error as { code?: string; constraint?: string };
    return pg.code === "23514" && (!constraint || pg.constraint === constraint);
  });
}
async function valid(target: Pool, value: unknown) {
  return (
    await target.query<{ valid: boolean }>(
      "select public.activity_plan_authoring_structure_is_valid($1::jsonb) valid",
      [JSON.stringify(value)],
    )
  ).rows[0]?.valid;
}
await withDisposableDatabase(process.argv.slice(2), "activity_plan_vfive", async (target) => {
  await bootstrapSupabaseSchemas(target);
  for (const migration of requireFreshBaseline().migrationPaths)
    await applySqlFile(target, migration);
  const base = structure();
  assert.equal(activityPlanStructureSchema.safeParse(base).success, true);
  assert.equal(await valid(target, base), true, "standalone V5 steps are valid");
  const repeat = {
    ...base,
    items: [{ type: "repeat" as const, id: id(2), count: 2, steps: base.items }],
  };
  assert.equal(activityPlanStructureSchema.safeParse(repeat).success, true);
  assert.equal(await valid(target, repeat), true, "one-child repeats are valid");
  const cases = [
    { ...base, version: 4 },
    {
      ...base,
      items: [
        {
          type: "repeat",
          id: id(2),
          count: 2,
          steps: [{ type: "repeat", id: id(3), count: 2, steps: base.items }],
        },
      ],
    },
    { ...base, items: [{ ...base.items[0], id: id(1) }, { ...base.items[0] }] },
    { ...base, items: [{ ...base.items[0], duration: { type: "time", seconds: "60" } }] },
    { ...base, items: [{ ...base.items[0], name: "   " }] },
  ];
  for (const candidate of cases)
    assert.equal(await valid(target, candidate), false, "invalid V5 structure rejected");
  const candidates: Array<{ label: string; value: unknown }> = [];
  for (const category of ["run", "bike", "swim", "strength", "other"] as const) {
    for (const type of [
      "RPE",
      "cadence",
      "watts",
      "bpm",
      "%FTP",
      "%MaxHR",
      "%ThresholdHR",
      "speed",
    ] as const) {
      for (const intensity of [-1, 0, 0.5, 1, 5.25, 5.5, 10, 100, 101, 300, 1000, 10001]) {
        candidates.push({
          label: `${category}/${type}/${intensity}`,
          value: {
            ...base,
            activity_category: category,
            items: [{ ...base.items[0], targets: [{ type, intensity }] }],
          },
        });
      }
    }
    for (const duration of [
      { type: "untilFinished" },
      { type: "repetitions", count: 10 },
      { type: "distance", meters: 10 },
    ]) {
      candidates.push({
        label: `${category}/${duration.type}`,
        value: { ...base, activity_category: category, items: [{ ...base.items[0], duration }] },
      });
    }
  }
  for (const name of [
    "  named  ",
    "\u00a0",
    "\u200b",
    "\ufeff",
    "😀".repeat(100),
    "😀".repeat(101),
  ]) {
    candidates.push({
      label: `text/${JSON.stringify(name)}`,
      value: { ...base, items: [{ ...base.items[0], name }] },
    });
  }
  for (const value of [
    null,
    [],
    {},
    { ...base, version: "5" },
    { ...base, items: [{ ...base.items[0], id: "00000000-0000-0000-0000-000000000000" }] },
    { ...repeat, items: [{ ...repeat.items[0], count: 1 }] },
    { ...repeat, items: [{ ...repeat.items[0], count: 51 }] },
    {
      ...repeat,
      items: [
        {
          ...repeat.items[0],
          count: 50,
          steps: Array.from({ length: 20 }, (_, index) => ({
            ...base.items[0],
            id: id(index + 200),
            duration: { type: "time", seconds: 86400 },
          })),
        },
      ],
    },
  ]) {
    candidates.push({ label: `shape/${candidates.length}`, value });
  }
  for (const category of ["run", "bike", "swim", "strength", "other"]) {
    for (const [label, patch] of Object.entries({
      valid: { targets: [{ type: "rest" }] },
      intensity: { targets: [{ type: "rest", intensity: 0 }] },
      mixed: { targets: [{ type: "rest" }, { type: "RPE", intensity: 2 }] },
      duplicate: { targets: [{ type: "rest" }, { type: "rest" }] },
      distance: { targets: [{ type: "rest" }], duration: { type: "distance", meters: 10 } },
      repetitions: { targets: [{ type: "rest" }], duration: { type: "repetitions", count: 10 } },
      open: { targets: [{ type: "rest" }], duration: { type: "untilFinished" } },
      zero: { targets: [{ type: "rest" }], duration: { type: "time", seconds: 0 } },
    })) {
      candidates.push({
        label: `rest/${category}/${label}`,
        value: { ...base, activity_category: category, items: [{ ...base.items[0], ...patch }] },
      });
    }
  }
  for (const { label, value } of candidates) {
    const actual = (
      await target.query<{ structure: boolean; authoring: boolean }>(
        "select public.activity_plan_v5_structure_is_valid($1::jsonb) structure, public.activity_plan_authoring_structure_is_valid($1::jsonb) authoring",
        [JSON.stringify(value)],
      )
    ).rows[0];
    assert.equal(
      actual?.structure,
      activityPlanStructureSchema.safeParse(value).success,
      `executable parity: ${label}`,
    );
    assert.equal(
      actual?.authoring,
      activityPlanAuthoringStructureSchema.safeParse(value).success,
      `authoring parity: ${label}`,
    );
    if (activityPlanStructureSchema.safeParse(value).success) {
      const expected = hashes(value);
      const actualHash = (
        await target.query<{ structure: string; semantic: string }>(
          "select public.activity_plan_core_structure_hash($1::jsonb) structure, public.activity_plan_core_semantic_hash($1::jsonb, 'general_maintenance') semantic",
          [JSON.stringify(value)],
        )
      ).rows[0];
      assert.deepEqual(actualHash, expected, `hash parity: ${label}`);
    }
  }
  console.info(
    `[db:activity-plan-authoring] ${candidates.length} differential Core/SQL boundary cases passed`,
  );
  const profile = id(100);
  const hash = hashes(base);
  await target.query(
    "insert into auth.users(id,email,raw_user_meta_data) values($1,'v5@example.test','{}')",
    [profile],
  );
  await target.query(
    "insert into public.activity_plans(id,profile_id,name,structure,structure_hash,semantic_hash,training_intent) values($1,$2,'V5',$3,$4,$5,'general_maintenance')",
    [id(101), profile, JSON.stringify(base), hash.structure, hash.semantic],
  );
  await target.query("update public.activity_plans set name='metadata' where id=$1", [id(101)]);
  assert.equal(
    (
      await target.query<{ revision: number }>(
        "select revision from public.activity_plans where id=$1",
        [id(101)],
      )
    ).rows[0]?.revision,
    1,
  );
  await rejects(
    target.query("update public.activity_plans set semantic_hash=$2 where id=$1", [
      id(101),
      hash.structure,
    ]),
    "activity_plans_hash_guard",
  );
  const revised = {
    ...base,
    items: [{ ...base.items[0], duration: { type: "time" as const, seconds: 61 } }],
  };
  const revisedHash = hashes(revised);
  await target.query(
    "update public.activity_plans set structure=$2,structure_hash=$3,semantic_hash=$4,revision=999 where id=$1",
    [id(101), JSON.stringify(revised), revisedHash.structure, revisedHash.semantic],
  );
  assert.equal(
    (
      await target.query<{ revision: number }>(
        "select revision from public.activity_plans where id=$1",
        [id(101)],
      )
    ).rows[0]?.revision,
    2,
  );
  assert.equal(
    (
      await target.query<{ removed: boolean }>(
        "select to_regprocedure('public.activity_plan_authoring_content_is_valid(jsonb,jsonb,text)') IS NULL removed",
      )
    ).rows[0]?.removed,
    true,
    "legacy adaptation API removed",
  );
  assert.equal(
    (
      await target.query<{ removed: boolean }>(
        "select to_regprocedure('public.planned_session_resolution_manifest_is_valid(jsonb,uuid,integer)') IS NULL removed",
      )
    ).rows[0]?.removed,
    true,
    "scheduled prescription validator removed",
  );
  console.info(
    "[db:activity-plan-authoring] V5 structure, hash guard, revision, and snapshot-validator retirement passed",
  );
});
await withDisposableDatabase(
  process.argv.slice(2),
  "activity_plan_materialization",
  async (target) => {
    await bootstrapSupabaseSchemas(target);
    for (const migration of requireFreshBaseline().migrationPaths)
      await applySqlFile(target, migration);
    await installActivityPlanSqlFunctions(target);
    assert.equal(await valid(target, structure()), true);
    console.info("[db:activity-plan-materialization] pinned V5 validator passed");
  },
);
