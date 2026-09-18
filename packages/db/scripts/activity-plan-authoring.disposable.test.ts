import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { SYSTEM_TEMPLATES } from "@repo/core";
import {
  type ActivityPlanIntervalStep,
  activityPlanAdaptationSchema,
  activityPlanAuthoringContentSchema,
  activityPlanSemanticHash,
  activityPlanStructureSchema,
  activityPlanTrainingIntentSchema,
  type EditableActivityPlanStructure,
} from "@repo/core/activity-plan";
import { stringifyCanonicalJson } from "@repo/core/athlete-intelligence";
import { sha256Hex } from "@repo/core/utils";
import { Pool } from "pg";
import {
  ACTIVITY_PLAN_AUTHORING_MIGRATION,
  installActivityPlanSqlFunctions,
} from "./activity-plan-sql-artifacts";
import {
  applySqlFile,
  bootstrapSupabaseSchemas,
  requireFreshBaseline,
  withDisposableDatabase,
} from "./disposable-database-test-harness";

const ids = {
  segment: "11111111-1111-4111-8111-111111111111",
  interval: "22222222-2222-4222-8222-222222222222",
  step: "33333333-3333-4333-8333-333333333333",
  control: "44444444-4444-4444-8444-444444444444",
};
const hash = `v1:sha256:${"a".repeat(64)}`;
function structure(
  category: EditableActivityPlanStructure["activity_category"] = "run",
  step: Partial<ActivityPlanIntervalStep> = {},
): EditableActivityPlanStructure {
  return {
    version: 3,
    activity_category: category,
    segments: [
      {
        id: ids.segment,
        role: "activity",
        name: "Activity",
        intervals: [
          {
            id: ids.interval,
            name: "Main",
            repetitions: 3,
            steps: [
              {
                id: ids.step,
                name: "Work",
                purpose: "work",
                duration: { type: "time", seconds: 60 },
                targets: [{ type: "RPE", intensity: 5 }],
                ...step,
              },
            ],
          },
        ],
      },
    ],
  };
}
function adaptation(range = { minimum: 5, default: 5, maximum: 6, increment: 0.5 }) {
  return {
    controls: [
      {
        id: ids.control,
        key: "intensity",
        label: "Intensity",
        kind: "target_intensity",
        range,
        targets: [
          {
            type: "target_intensity",
            activitySegmentId: ids.segment,
            intervalId: ids.interval,
            stepId: ids.step,
            targetType: "RPE",
          },
        ],
      },
    ],
  };
}
const content = (s: unknown = structure(), a: unknown = null, intent = "general_maintenance") => ({
  structure: s,
  adaptation: a,
  intent: { training_intent: intent },
});
const fixtures: Array<{ name: string; value: ReturnType<typeof content> }> = [];
fixtures.push({
  name: "valid tiny speed increment uses Core floating-point alignment",
  value: content(structure("run", { targets: [{ type: "speed", intensity: 5 }] }), {
    controls: adaptation({
      minimum: 5,
      default: 5,
      maximum: 5 + 2 ** -32,
      increment: 2 ** -32,
    }).controls.map((control) => ({
      ...control,
      targets: control.targets.map((target) => ({ ...target, targetType: "speed" })),
    })),
  }),
});
assert.equal(activityPlanAuthoringContentSchema.safeParse(fixtures[0]?.value).success, true);
for (const category of ["run", "bike", "swim", "strength", "other"] as const) {
  for (const duration of [
    { type: "time", seconds: 60 },
    { type: "distance", meters: 100 },
    { type: "repetitions", count: 8 },
    { type: "untilFinished" },
  ] as const)
    fixtures.push({
      name: `${category}/${duration.type}`,
      value: content(structure(category, { duration })),
    });
}
for (const intensity of [0, 1, 1.5, 5.25, 9.5, 10, 10.5])
  fixtures.push({
    name: `RPE/${intensity}`,
    value: content(structure("run", { targets: [{ type: "RPE", intensity }] })),
  });
for (const type of ["%MaxHR", "%ThresholdHR"] as const)
  for (const intensity of [100, 100.5, 105])
    fixtures.push({
      name: `${type}/${intensity}`,
      value: content(structure("run", { targets: [{ type, intensity }] })),
    });
fixtures.push(
  { name: "missing purpose", value: content(structure("run", { purpose: undefined })) },
  {
    name: "cadence only",
    value: content(structure("run", { targets: [{ type: "cadence", intensity: 90 }] })),
  },
  {
    name: "supporting cadence",
    value: content(
      structure("run", {
        targets: [
          { type: "RPE", intensity: 5 },
          { type: "cadence", intensity: 90 },
        ],
      }),
    ),
  },
  {
    name: "duplicate target",
    value: content(
      structure("run", {
        targets: [
          { type: "RPE", intensity: 5 },
          { type: "RPE", intensity: 6 },
        ],
      }),
    ),
  },
  {
    name: "multiple objective",
    value: content(
      structure("run", {
        targets: [
          { type: "%MaxHR", intensity: 75 },
          { type: "speed", intensity: 10 },
        ],
      }),
    ),
  },
  {
    name: "distance zero speed",
    value: content(
      structure("run", {
        duration: { type: "distance", meters: 100 },
        targets: [{ type: "speed", intensity: 0 }],
      }),
    ),
  },
  {
    name: "distance positive speed",
    value: content(
      structure("run", {
        duration: { type: "distance", meters: 100 },
        targets: [{ type: "speed", intensity: 0.001 }],
      }),
    ),
  },
  { name: "valid adaptation", value: content(structure(), adaptation()) },
  {
    name: "quarter point adaptation",
    value: content(
      structure(),
      adaptation({ minimum: 5, default: 5, maximum: 6, increment: 0.25 }),
    ),
  },
  {
    name: "tiny RPE increment",
    value: content(
      structure(),
      adaptation({ minimum: 5, default: 5, maximum: 5 + 2 ** -32, increment: 2 ** -32 }),
    ),
  },
  {
    name: "invalid defaults",
    value: content(
      structure(),
      adaptation({ minimum: 5, default: 5.5, maximum: 6, increment: 0.5 }),
    ),
  },
  {
    name: "oversized surface",
    value: content(
      structure(),
      adaptation({ minimum: 1, default: 5, maximum: 10, increment: 0.0001 }),
    ),
  },
  {
    name: "allowed subset",
    value: content(structure(), {
      ...adaptation({ minimum: 5, default: 5, maximum: 6, increment: 0.25 }),
      allowedStates: [
        { id: ids.segment, label: "Default", values: { intensity: 5 } },
        { id: ids.interval, label: "Harder", values: { intensity: 6 } },
      ],
    }),
  },
  {
    name: "multiple owners",
    value: content(structure(), {
      controls: [
        ...adaptation().controls,
        { ...adaptation().controls[0], id: ids.step, key: "second" },
      ],
    }),
  },
  {
    name: "null target discriminator",
    value: content(structure(), {
      controls: [
        {
          id: ids.control,
          key: "seconds",
          label: "Seconds",
          kind: "step_quantity",
          range: { minimum: 60, default: 60, maximum: 60, increment: 1 },
          targets: [
            {
              type: null,
              activitySegmentId: ids.segment,
              intervalId: ids.interval,
              stepId: ids.step,
              quantityType: "time",
            },
          ],
        },
      ],
    }),
  },
  { name: "invalid intent", value: content(structure(), null, "vo2max") },
  {
    name: "valid intent",
    value: content(structure("run", { targets: [{ type: "RPE", intensity: 8 }] }), null, "vo2max"),
  },
  { name: "technique required", value: content(structure(), null, "technique") },
  {
    name: "technique present",
    value: content(structure("run", { purpose: "technique" }), null, "technique"),
  },
  { name: "null structure", value: content(null) },
  { name: "malformed structure", value: content({ version: 3, segments: {} }) },
  { name: "malformed adaptation", value: content(structure(), { controls: null }) },
);
const jsWhitespace = [
  "\t",
  "\n",
  "\v",
  "\f",
  "\r",
  " ",
  "\u00a0",
  "\u1680",
  "\u2000",
  "\u2001",
  "\u2002",
  "\u2003",
  "\u2004",
  "\u2005",
  "\u2006",
  "\u2007",
  "\u2008",
  "\u2009",
  "\u200a",
  "\u2028",
  "\u2029",
  "\u202f",
  "\u205f",
  "\u3000",
  "\ufeff",
];
for (const label of [
  ...jsWhitespace,
  "😀".repeat(50),
  "😀".repeat(51),
  "😀".repeat(100),
  "\u0085",
  "\u180e",
  "\u200b",
]) {
  fixtures.push({
    name: `control label ${JSON.stringify(label)}`,
    value: content(structure(), {
      controls: adaptation().controls.map((control) => ({ ...control, label })),
    }),
  });
  fixtures.push({
    name: `state label ${JSON.stringify(label)}`,
    value: content(structure(), {
      ...adaptation(),
      allowedStates: [{ id: ids.step, label, values: { intensity: 5 } }],
    }),
  });
}
for (const whitespace of jsWhitespace) {
  const key = `${whitespace}intensity${whitespace}`;
  fixtures.push({
    name: `trimmed control key ${JSON.stringify(whitespace)}`,
    value: content(structure(), {
      controls: adaptation().controls.map((control) => ({ ...control, key })),
    }),
  });
  fixtures.push({
    name: `trimmed state key ${JSON.stringify(whitespace)}`,
    value: content(structure(), {
      ...adaptation(),
      allowedStates: [{ id: ids.step, label: "Default", values: { [key]: 5 } }],
    }),
  });
}
for (const template of SYSTEM_TEMPLATES)
  fixtures.push({
    name: `catalog/${template.name}`,
    value: content(template.structure, template.adaptation, template.training_intent),
  });

fixtures.push(
  {
    name: "step name 50 astral code points",
    value: content(structure("run", { name: "😀".repeat(50) })),
  },
  {
    name: "step name code-point boundary differs from adaptation labels",
    value: content(structure("run", { name: "😀".repeat(100) })),
  },
  {
    name: "step notes retain code-point length semantics",
    value: content(structure("run", { notes: "😀".repeat(501) })),
  },
  {
    name: "step description retains code-point length semantics",
    value: content(structure("run", { description: "😀".repeat(251) })),
  },
);

async function assertParity(target: Pool) {
  for (const fixture of fixtures) {
    const parsed = activityPlanAuthoringContentSchema.safeParse(fixture.value);
    const core = parsed.success;
    const result = await target.query<{ valid: boolean }>(
      "select public.activity_plan_authoring_content_is_valid($1::jsonb,$2::jsonb,$3::text) as valid",
      [
        JSON.stringify(fixture.value.structure),
        JSON.stringify(fixture.value.adaptation),
        fixture.value.intent.training_intent,
      ],
    );
    assert.equal(result.rows[0]?.valid, core, `SQL/Core mismatch: ${fixture.name}`);
    if (parsed.success) {
      const hashes = await target.query<{ structure: string; semantic: string }>(
        "select public.activity_plan_core_structure_hash($1::jsonb) as structure, public.activity_plan_core_semantic_hash($1::jsonb,$2::jsonb,$3) as semantic",
        [
          JSON.stringify(fixture.value.structure),
          JSON.stringify(fixture.value.adaptation),
          fixture.value.intent.training_intent,
        ],
      );
      assert.equal(
        hashes.rows[0]?.structure,
        coreStructureHash(parsed.data.structure),
        `structure hash: ${fixture.name}`,
      );
      assert.equal(
        hashes.rows[0]?.semantic,
        activityPlanSemanticHash({
          structure: parsed.data.structure,
          adaptation: parsed.data.adaptation ?? null,
          trainingIntent: parsed.data.intent.training_intent,
        }),
        `semantic hash: ${fixture.name}`,
      );
    }
  }
}

function coreStructureHash(value: unknown) {
  return `v1:sha256:${sha256Hex(stringifyCanonicalJson(value))}`;
}

function hashesFor(s: unknown, a: unknown = null, intent = "general_maintenance") {
  const parsed = activityPlanStructureSchema.parse(JSON.parse(JSON.stringify(s)));
  return {
    structureHash: coreStructureHash(parsed),
    semanticHash: activityPlanSemanticHash({
      structure: parsed,
      adaptation: activityPlanAdaptationSchema.nullish().parse(a) ?? null,
      trainingIntent: activityPlanTrainingIntentSchema.parse(intent),
    }),
  };
}

async function assertPersistedCoreContent(target: Pool, id: string) {
  const result = await target.query<{
    id: string;
    revision: number;
    structure: unknown;
    adaptation: unknown;
    trainingIntent: string;
    structureHash: string;
    semanticHash: string;
  }>(
    'select id, revision, structure, adaptation, training_intent as "trainingIntent", structure_hash as "structureHash", semantic_hash as "semanticHash" from public.activity_plans where id=$1',
    [id],
  );
  const row = result.rows[0];
  assert.ok(row);
  activityPlanAuthoringContentSchema.parse({
    structure: row.structure,
    adaptation: row.adaptation,
    intent: { training_intent: row.trainingIntent },
  });
  const expected = hashesFor(row.structure, row.adaptation, row.trainingIntent);
  assert.equal(row.structureHash, expected.structureHash);
  assert.equal(row.semanticHash, expected.semanticHash);
  assert.ok(Number.isInteger(row.revision) && row.revision > 0);
  return row;
}

async function assertCanonicalJsonParity(target: Pool) {
  const values: unknown[] = [
    0,
    -0,
    1e-7,
    1e-6,
    1e20,
    1e21,
    Number.MIN_VALUE,
    Number.MAX_VALUE,
    1000000000000000100,
    -61346878300597980,
    {
      "10": 1,
      "2": 2,
      "4294967294": 3,
      "4294967295": 4,
      "00": 5,
      "😀": 'é\t\n"\\',
      "\ue000": "\ufeff",
      𐀀: [true, null, -0, 0.000001],
    },
  ];
  let state = 1n;
  const bytes = Buffer.alloc(8);
  for (let index = 0; index < 10000; index++) {
    state = BigInt.asUintN(64, state * 6364136223846793005n + 1442695040888963407n);
    bytes.writeBigUInt64LE(state);
    const number = bytes.readDoubleLE();
    if (Number.isFinite(number)) values.push(number);
  }
  const rows = await target.query<{ canonical: string }>(
    "select public.activity_plan_core_canonical_json(value) as canonical from jsonb_array_elements($1::jsonb) with ordinality order by ordinality",
    [JSON.stringify(values)],
  );
  assert.equal(rows.rowCount, values.length);
  rows.rows.forEach((row, index) =>
    assert.equal(
      row.canonical,
      stringifyCanonicalJson(values[index]),
      `canonical JSON case ${index}: ${JSON.stringify(values[index])}`,
    ),
  );
  console.info(
    `[db:canonical-json] ${values.length} deterministic number/string/key-order cases match Core`,
  );
}

await withDisposableDatabase(
  process.argv.slice(2),
  "activity_plan_authoring",
  async (target, connectionString) => {
    await bootstrapSupabaseSchemas(target);
    const migrations = requireFreshBaseline().migrationPaths;
    const index = migrations.findIndex((path) => path.endsWith(ACTIVITY_PLAN_AUTHORING_MIGRATION));
    assert.ok(index > 0);
    for (const path of migrations.slice(0, index)) await applySqlFile(target, path);
    const profileId = randomUUID();
    const legacyId = randomUUID();
    const currentId = randomUUID();
    await target.query(
      "insert into auth.users (id,email,raw_user_meta_data) values ($1,'authoring@example.test','{}')",
      [profileId],
    );
    await target.query("insert into public.profiles (id) values ($1) on conflict do nothing", [
      profileId,
    ]);
    const historical = structure("run", {
      purpose: undefined,
      duration: { type: "untilFinished" },
    });
    assert.equal(activityPlanStructureSchema.safeParse(historical).success, true);
    const insert = (id: string, s: unknown, a: unknown = null, supplied = hashesFor(s, a)) =>
      target.query(
        "insert into public.activity_plans(id,profile_id,name,structure,structure_hash,semantic_hash,training_intent,adaptation) values ($1,$2,'Fixture',$3,$4,$5,'general_maintenance',$6)",
        [
          id,
          profileId,
          JSON.stringify(s),
          supplied.structureHash,
          supplied.semanticHash,
          a === null ? null : JSON.stringify(a),
        ],
      );
    await insert(legacyId, historical);
    const frozenId = randomUUID();
    const frozen = {
      resolver_version: "fixture",
      policy_version: "fixture",
      activity_plan_id: legacyId,
      activity_plan_revision: 1,
      activity_plan_semantic_hash: hash,
      session_demand: {},
      adaptation_values: {},
      effective_target_duration_minutes: null,
      effective_target_common_load: null,
      evidence_facts: [],
      reason_codes: [],
      resolved_structure: historical,
      resolved_structure_hash: hash,
      prescription_estimate: {},
      fingerprint: hash,
    };
    await target.query(
      `insert into public.planned_sessions(id,profile_id,planning_date,original_target_date,source_kind,idempotency_key,direct_operation_id,activity_plan_id,activity_plan_revision,resolution_manifest,prescription_captured_at)
    values ($1,$2,'2026-09-16','2026-09-16','direct',$3,$4,$5,1,$6,now())`,
      [
        frozenId,
        profileId,
        `direct:${"b".repeat(32)}`,
        "b".repeat(32),
        legacyId,
        JSON.stringify(frozen),
      ],
    );
    const historicalFunction = await target.query<{ definition: string }>(
      "select pg_get_functiondef('public.activity_plan_structure_is_canonical(jsonb)'::regprocedure) as definition",
    );
    for (const path of migrations.slice(index)) await applySqlFile(target, path);
    assert.deepEqual(
      (
        await target.query(
          "select pg_get_functiondef('public.activity_plan_structure_is_canonical(jsonb)'::regprocedure) as definition",
        )
      ).rows,
      historicalFunction.rows,
    );
    await assertParity(target);
    await assertCanonicalJsonParity(target);
    const reject = (work: Promise<unknown>, constraint?: string) =>
      assert.rejects(work, (error: unknown) =>
        Boolean(
          error &&
            typeof error === "object" &&
            "code" in error &&
            error.code === "23514" &&
            (!constraint || ("constraint" in error && error.constraint === constraint)),
        ),
      );
    await reject(insert(randomUUID(), historical));
    await reject(
      insert(randomUUID(), structure("run", { targets: [{ type: "RPE", intensity: 5.25 }] })),
    );
    await insert(currentId, structure());
    await assertPersistedCoreContent(target, currentId);
    await reject(
      insert(randomUUID(), structure(), null, { structureHash: hash, semanticHash: hash }),
      "activity_plans_hash_guard",
    );
    await reject(
      target.query("update public.activity_plans set semantic_hash=$2 where id=$1", [
        currentId,
        hash,
      ]),
      "activity_plans_hash_guard",
    );
    for (const label of ["\t", "😀".repeat(100)]) {
      await reject(
        insert(
          randomUUID(),
          structure(),
          { controls: adaptation().controls.map((control) => ({ ...control, label })) },
          hashesFor(structure()),
        ),
        "activity_plans_authoring_guard",
      );
    }
    for (const whitespace of jsWhitespace) {
      const id = randomUUID();
      const key = `${whitespace}intensity${whitespace}`;
      const rawAdaptation = {
        controls: adaptation().controls.map((control) => ({
          ...control,
          key,
          label: `${whitespace}😀${whitespace}`,
        })),
        allowedStates: [
          { id: ids.step, label: `${whitespace}Default${whitespace}`, values: { [key]: 5 } },
        ],
      };
      await insert(id, structure(), rawAdaptation);
      await assertPersistedCoreContent(target, id);
    }
    await target.query(
      "update public.activity_plans set name='Legacy metadata', revision=999 where id=$1",
      [legacyId],
    );
    assert.deepEqual(
      (
        await target.query("select structure, revision from public.activity_plans where id=$1", [
          legacyId,
        ])
      ).rows[0],
      { structure: JSON.parse(JSON.stringify(historical)), revision: 1 },
    );
    await reject(
      target.query("update public.activity_plans set training_intent='aerobic_base' where id=$1", [
        legacyId,
      ]),
    );
    await reject(
      target.query("update public.activity_plans set structure=$2 where id=$1", [
        legacyId,
        JSON.stringify(structure()),
      ]),
      "activity_plans_hash_guard",
    );
    const repairedHashes = hashesFor(structure());
    await target.query(
      "update public.activity_plans set structure=$2,structure_hash=$3,semantic_hash=$4 where id=$1",
      [
        legacyId,
        JSON.stringify(structure()),
        repairedHashes.structureHash,
        repairedHashes.semanticHash,
      ],
    );
    await assertPersistedCoreContent(target, legacyId);
    assert.equal(
      (await target.query("select revision from public.activity_plans where id=$1", [legacyId]))
        .rows[0]?.revision,
      2,
    );
    assert.deepEqual(
      (
        await target.query("select resolution_manifest from public.planned_sessions where id=$1", [
          frozenId,
        ])
      ).rows[0]?.resolution_manifest,
      JSON.parse(JSON.stringify(frozen)),
    );
    await target.query(
      "update public.planned_sessions set planning_date='2026-09-17' where id=$1",
      [frozenId],
    );
    await reject(
      target.query("update public.activity_plans set adaptation=$2 where id=$1", [
        currentId,
        JSON.stringify(adaptation({ minimum: 5, default: 5, maximum: 6, increment: 0.25 })),
      ]),
    );
    // Real row-lock race: an adaptation-only edit must invalidate an older token
    // even though structure_hash is unchanged and the caller tries to set revision.
    const pool = new Pool({ connectionString, max: 2 });
    const first = await pool.connect();
    const second = await pool.connect();
    try {
      await first.query("begin");
      await first.query(
        "update public.activity_plans set adaptation=$2, semantic_hash=$3, revision=999 where id=$1 and revision=1",
        [
          currentId,
          JSON.stringify(adaptation()),
          hashesFor(structure(), adaptation()).semanticHash,
        ],
      );
      const secondPid = (await second.query("select pg_backend_pid() as pid")).rows[0]?.pid;
      const waiting = second.query(
        "update public.activity_plans set training_intent='aerobic_base' where id=$1 and structure_hash=$2 and revision=1 returning revision",
        [currentId, hashesFor(structure()).structureHash],
      );
      let blocked = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        const locks = await target.query<{ blocked: boolean }>(
          "select cardinality(pg_blocking_pids($1)) > 0 as blocked",
          [secondPid],
        );
        if (locks.rows[0]?.blocked) {
          blocked = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert.equal(blocked, true, "stale writer must actually wait on the first transaction");
      await first.query("commit");
      assert.equal((await waiting).rowCount, 0);
      await assertPersistedCoreContent(target, currentId);
      assert.deepEqual(
        (
          await target.query(
            "select revision, training_intent from public.activity_plans where id=$1",
            [currentId],
          )
        ).rows[0],
        { revision: 2, training_intent: "general_maintenance" },
      );
      await reject(
        target.query(
          "update public.activity_plans set training_intent='aerobic_base' where id=$1",
          [currentId],
        ),
        "activity_plans_hash_guard",
      );
      await target.query(
        "update public.activity_plans set training_intent='aerobic_base', semantic_hash=$2, revision=999 where id=$1",
        [currentId, hashesFor(structure(), adaptation(), "aerobic_base").semanticHash],
      );
      await assertPersistedCoreContent(target, currentId);
      assert.equal(
        (await target.query("select revision from public.activity_plans where id=$1", [currentId]))
          .rows[0]?.revision,
        3,
      );
      await target.query(
        "update public.activity_plans set name='Metadata', revision=999 where id=$1",
        [currentId],
      );
      assert.equal(
        (await target.query("select revision from public.activity_plans where id=$1", [currentId]))
          .rows[0]?.revision,
        3,
      );
    } finally {
      await first.query("rollback");
      first.release();
      second.release();
      await pool.end();
    }
    console.info(
      `[db:activity-plan-authoring] ${fixtures.length} SQL/Core fixtures; direct writes, legacy metadata, frozen manifests, repair, authoritative revisions and blocked stale-writer concurrency passed`,
    );
  },
);

// No live/local source database definitions are used: the materializer's pinned
// functions must independently work in an otherwise empty disposable database.
await withDisposableDatabase(
  process.argv.slice(2),
  "activity_plan_materialization",
  async (target) => {
    await bootstrapSupabaseSchemas(target);
    await installActivityPlanSqlFunctions(target);
    await assertParity(target);
    await assertCanonicalJsonParity(target);
    console.info(
      `[db:activity-plan-materialization] ${fixtures.length} SQL/Core fixtures passed using pinned functions in an empty disposable target`,
    );
  },
);
