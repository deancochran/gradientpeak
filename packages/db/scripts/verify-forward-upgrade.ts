#!/usr/bin/env tsx

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  applySqlFile,
  bootstrapSupabaseSchemas,
  withDisposableDatabase,
} from "./_disposable-target";
import { dbPackageRoot } from "./_helpers";
import {
  autocommitSettings,
  type MigrationLedgerEntry,
  type MigrationPolicy,
} from "./_migration-plan";
import { assertCanonicalActivityPlanStructureInventory } from "./activity-plan-structure-preflight";

const ownerId = "10000000-0000-4000-8000-000000000001";
const planId = "20000000-0000-4000-8000-000000000001";
const existingActivityId = "40000000-0000-4000-8000-000000000001";
const existingSegmentId = "50000000-0000-4000-8000-000000000001";
const newActivityId = "40000000-0000-4000-8000-000000000002";
const newSegmentId = "50000000-0000-4000-8000-000000000002";
const effortActivityId = "40000000-0000-4000-8000-000000000004";
const effortSegmentId = "50000000-0000-4000-8000-000000000004";
const effortId = "60000000-0000-4000-8000-000000000004";
const outOfRangeEffortId = "60000000-0000-4000-8000-000000000005";
const hash = `v1:sha256:${"a".repeat(64)}`;
const validStructure = {
  version: 3,
  segments: [
    {
      id: "30000000-0000-4000-8000-000000000001",
      role: "activity",
      activity_category: "run",
      name: "Run",
      intervals: [
        {
          id: "30000000-0000-4000-8000-000000000002",
          name: "Work",
          repetitions: 1,
          steps: [
            {
              id: "30000000-0000-4000-8000-000000000003",
              name: "Step",
              duration: { type: "time", seconds: 60 },
              targets: [{ type: "RPE", intensity: 5 }],
            },
          ],
        },
      ],
    },
  ],
};
const restSegment = {
  id: "30000000-0000-4000-8000-000000000010",
  role: "rest",
  name: "Rest",
  duration: { type: "time", seconds: 60 },
};

const policy = JSON.parse(
  readFileSync(resolve(dbPackageRoot, "migration-policy.json"), "utf8"),
) as MigrationPolicy & { baseline: { version: string; name: string } };
const ledger = JSON.parse(
  readFileSync(resolve(dbPackageRoot, policy.activeLedgerFile), "utf8"),
) as { entries: MigrationLedgerEntry[] };
const baseline = ledger.entries[0];
const canonicalMigration = ledger.entries[1];
const rawSourceMigrationIndex = ledger.entries.findIndex(
  (entry) => entry.name === "add_activity_segments_raw_sub_sport",
);
const rawSourceMigration = ledger.entries[rawSourceMigrationIndex];
if (!baseline || !canonicalMigration || rawSourceMigrationIndex < 0 || !rawSourceMigration)
  throw new Error("canonical migration ledger entries are missing");
const baselineMigration: MigrationLedgerEntry = baseline;
const canonicalCheckMigration: MigrationLedgerEntry = canonicalMigration;

async function applyBaseline(target: Parameters<typeof applySqlFile>[0]) {
  await bootstrapSupabaseSchemas(target);
  await applySqlFile(
    target,
    resolve(
      dbPackageRoot,
      policy.authorityDirectory,
      `${baselineMigration.version}_${baselineMigration.name}.sql`,
    ),
    baselineMigration.executionMode,
  );
  await target.query(
    "insert into auth.users (id, email, raw_user_meta_data) values ($1, 'owner@example.test', '{}'::jsonb)",
    [ownerId],
  );
}

async function insertPlan(target: Parameters<typeof applySqlFile>[0], structure: unknown) {
  await target.query(
    `insert into public.activity_plans (id, profile_id, name, structure, structure_hash, content_visibility)
     values ($1, $2, 'sentinel', $3::jsonb, $4, 'followers')`,
    [planId, ownerId, JSON.stringify(structure), hash],
  );
}

async function insertActivityWithSegment(
  target: Parameters<typeof applySqlFile>[0],
  {
    activityId,
    segmentId,
    rawSubSportString,
    rawSubSportInteger,
    rawSportString = "multisport",
  }: {
    activityId: string;
    segmentId: string;
    rawSubSportString?: string;
    rawSubSportInteger?: number;
    rawSportString?: string;
  },
) {
  await target.query("begin");
  try {
    await target.query("set constraints all deferred");
    await target.query(
      `insert into public.activities (
         id, profile_id, name, started_at, finished_at, elapsed_ms, timing_coverage,
         parser_version, decoded_contract_version, materializer_version
       ) values ($1, $2, 'sentinel', now(), now() + interval '1 second', 1000, 'unavailable',
         'fixture', 'fixture', 'fixture')`,
      [activityId, ownerId],
    );
    await target.query(
      `insert into public.activity_segments (
         id, activity_id, profile_id, ordinal, role, start_offset_ms, end_offset_ms,
          raw_sport_string${rawSubSportString === undefined && rawSubSportInteger === undefined ? "" : rawSubSportString !== undefined ? ", raw_sub_sport_string" : ", raw_sub_sport_integer"},
         summary, timing_coverage, parser_version, materializer_version
        ) values (
           $1, $2, $3, 0, 'unknown', 0, 1000, $4${rawSubSportString === undefined && rawSubSportInteger === undefined ? "" : ", $5"},
         '{"version":1,"timing":{"timingCoverage":"unavailable"}}'::jsonb,
         'unavailable', 'fixture', 'fixture'
       )`,
      rawSubSportString === undefined && rawSubSportInteger === undefined
        ? [segmentId, activityId, ownerId, rawSportString]
        : [segmentId, activityId, ownerId, rawSportString, rawSubSportString ?? rawSubSportInteger],
    );
    await target.query("commit");
  } catch (error) {
    await target.query("rollback").catch(() => undefined);
    throw error;
  }
}

async function expectRawSubSportConstraintFailure(
  target: Parameters<typeof applySqlFile>[0],
  input: { activityId: string; segmentId: string; value: string },
) {
  try {
    await insertActivityWithSegment(target, {
      activityId: input.activityId,
      segmentId: input.segmentId,
      rawSubSportString: input.value,
    });
  } catch (error) {
    if ((error as { code?: unknown }).code === "23514") return;
    throw error;
  }
  throw new Error("raw sub-sport string bypassed its durable bounds");
}

async function verifyActivityCategoryEffortTrigger(target: Parameters<typeof applySqlFile>[0]) {
  const registry = await target.query<{ code: string; display_name: string; enabled: boolean }>(
    `select code, display_name, enabled
     from public.canonical_activity_categories
     order by code`,
  );
  if (
    JSON.stringify(registry.rows) !==
    JSON.stringify([
      { code: "bike", display_name: "Bike", enabled: true },
      { code: "other", display_name: "Other", enabled: true },
      { code: "run", display_name: "Run", enabled: true },
      { code: "strength", display_name: "Strength", enabled: true },
      { code: "swim", display_name: "Swim", enabled: true },
    ])
  ) {
    throw new Error("canonical activity-category registry was not seeded exactly");
  }
  await target.query("begin");
  try {
    await target.query("set constraints all deferred");
    await target.query(
      `insert into public.activities (
         id, profile_id, name, started_at, finished_at, elapsed_ms, timing_coverage,
         parser_version, decoded_contract_version, materializer_version
       ) values ($1, $2, 'effort fixture', now(), now() + interval '1 second', 1000,
         'unavailable', 'fixture', 'fixture', 'fixture')`,
      [effortActivityId, ownerId],
    );
    await target.query(
      `insert into public.activity_segments (
         id, activity_id, profile_id, ordinal, role, activity_category,
         start_offset_ms, end_offset_ms, summary, timing_coverage, parser_version,
         materializer_version
       ) values (
         $1, $2, $3, 0, 'activity', 'run', 0, 1000,
         '{"version":1,"timing":{"timingCoverage":"unavailable"}}'::jsonb,
         'unavailable', 'fixture', 'fixture'
       )`,
      [effortSegmentId, effortActivityId, ownerId],
    );
    await target.query(
      `insert into public.activity_efforts (
         id, created_at, profile_id, activity_id, segment_id, recorded_at,
         activity_category, effort_type, duration_seconds, start_offset, unit, value
       ) values ($1, now(), $2, $3, $4, now(), 'run', 'speed', 1, 0,
         'meters_per_second', 3)`,
      [effortId, ownerId, effortActivityId, effortSegmentId],
    );
    await target.query("commit");
  } catch (error) {
    await target.query("rollback").catch(() => undefined);
    throw error;
  }

  try {
    await target.query(
      `insert into public.activity_efforts (
         id, created_at, profile_id, activity_id, segment_id, recorded_at,
         activity_category, effort_type, duration_seconds, start_offset, unit, value
       ) values ($1, now(), $2, $3, $4, now(), 'run', 'speed', 1, 1,
         'meters_per_second', 3)`,
      [outOfRangeEffortId, ownerId, effortActivityId, effortSegmentId],
    );
  } catch (error) {
    if ((error as { code?: unknown }).code === "P0001") return;
    throw error;
  }
  throw new Error("activity-category effort trigger accepted an out-of-range effort");
}

async function segmentConstraintDefinitions(target: Parameters<typeof applySqlFile>[0]) {
  const result = await target.query<{ conname: string; definition: string }>(`
    select conname, pg_get_constraintdef(oid, true) as definition
    from pg_constraint
    where conrelid = 'public.activity_segments'::regclass
      and conname in (
          'activity_segments_role_category_check',
          'activity_segments_source_indexes_check',
          'activity_segments_unknown_source_check',
          'activity_segments_raw_sub_sport_type_check',
          'activity_segments_raw_source_string_bounds_check'
      )
    order by conname
  `);
  return result.rows;
}

async function expectConstraintFailure(
  target: Parameters<typeof applySqlFile>[0],
  structure: unknown,
  label: string,
) {
  try {
    await target.query("update public.activity_plans set structure = $1::jsonb where id = $2", [
      JSON.stringify(structure),
      planId,
    ]);
  } catch {
    return;
  }
  throw new Error(`${label} structure bypassed the canonical ActivityPlan constraint`);
}

await withDisposableDatabase(process.argv.slice(2), "forward_upgrade", async (target) => {
  await applyBaseline(target);
  await insertPlan(target, validStructure);
  await insertActivityWithSegment(target, {
    activityId: existingActivityId,
    segmentId: existingSegmentId,
  });
  const existingBefore = await target.query<{
    role: string;
    raw_sport_string: string | null;
    summary: unknown;
    timing_coverage: string;
  }>(
    `select role, raw_sport_string, summary, timing_coverage
     from public.activity_segments where id = $1`,
    [existingSegmentId],
  );
  for (const entry of ledger.entries.slice(1)) {
    await applySqlFile(
      target,
      resolve(dbPackageRoot, policy.authorityDirectory, `${entry.version}_${entry.name}.sql`),
      entry.executionMode,
      autocommitSettings(policy, entry),
    );
  }
  const existingAfter = await target.query<{
    role: string;
    raw_sport_string: string | null;
    raw_sub_sport_string: string | null;
    raw_sub_sport_integer: number | null;
    summary: unknown;
    timing_coverage: string;
  }>(
    `select role, raw_sport_string, summary, timing_coverage, raw_sub_sport_string, raw_sub_sport_integer
     from public.activity_segments where id = $1`,
    [existingSegmentId],
  );
  if (
    JSON.stringify(existingAfter.rows[0]) !==
    JSON.stringify({
      ...existingBefore.rows[0],
      raw_sub_sport_string: null,
      raw_sub_sport_integer: null,
    })
  ) {
    throw new Error("forward migration changed an existing activity segment");
  }
  const constraintsAfter = await segmentConstraintDefinitions(target);
  if (
    !constraintsAfter.some(
      (constraint) => constraint.conname === "activity_segments_raw_sub_sport_type_check",
    )
  )
    throw new Error("forward migration did not constrain raw sub-sport variants");
  if (
    !constraintsAfter.some(
      (constraint) => constraint.conname === "activity_segments_raw_source_string_bounds_check",
    )
  )
    throw new Error("forward migration did not bound raw source strings");
  await insertActivityWithSegment(target, {
    activityId: newActivityId,
    segmentId: newSegmentId,
    rawSubSportString: "transition",
  });
  const rawSubSport = await target.query<{ raw_sub_sport_string: string | null }>(
    "select raw_sub_sport_string from public.activity_segments where id = $1",
    [newSegmentId],
  );
  if (rawSubSport.rows[0]?.raw_sub_sport_string !== "transition") {
    throw new Error("raw_sub_sport_string did not preserve imported segment evidence");
  }
  await insertActivityWithSegment(target, {
    activityId: "40000000-0000-4000-8000-000000000003",
    segmentId: "50000000-0000-4000-8000-000000000003",
    rawSubSportInteger: 42,
  });
  const numericRawSubSport = await target.query<{ raw_sub_sport_integer: number | null }>(
    "select raw_sub_sport_integer from public.activity_segments where id = $1",
    ["50000000-0000-4000-8000-000000000003"],
  );
  if (numericRawSubSport.rows[0]?.raw_sub_sport_integer !== 42)
    throw new Error("raw_sub_sport_integer did not preserve imported numeric evidence");
  await expectRawSubSportConstraintFailure(target, {
    activityId: "40000000-0000-4000-8000-000000000004",
    segmentId: "50000000-0000-4000-8000-000000000004",
    value: "",
  });
  await expectRawSubSportConstraintFailure(target, {
    activityId: "40000000-0000-4000-8000-000000000005",
    segmentId: "50000000-0000-4000-8000-000000000005",
    value: "😀".repeat(129),
  });
  await verifyActivityCategoryEffortTrigger(target);
  await assertCanonicalActivityPlanStructureInventory(target);
  const constraint = await target.query<{ convalidated: boolean }>(
    "select convalidated from pg_constraint where conname = 'activity_plans_structure_canonical_check'",
  );
  if (constraint.rows[0]?.convalidated !== true)
    throw new Error("canonical check is not validated");
  const unicodeBoundaryStructure = {
    ...validStructure,
    segments: [{ ...validStructure.segments[0], name: "😀".repeat(100) }],
  };
  await target.query("update public.activity_plans set structure = $1::jsonb where id = $2", [
    JSON.stringify(unicodeBoundaryStructure),
    planId,
  ]);
  await assertCanonicalActivityPlanStructureInventory(target);
  await expectConstraintFailure(
    target,
    {
      ...validStructure,
      segments: [{ ...validStructure.segments[0], name: "😀".repeat(101) }],
    },
    "unicode-name-too-long",
  );
  await target.query("update public.activity_plans set structure = $1::jsonb where id = $2", [
    JSON.stringify(validStructure),
    planId,
  ]);
  await expectConstraintFailure(
    target,
    {
      ...validStructure,
      segments: [
        ...validStructure.segments,
        {
          ...validStructure.segments[0],
          id: "30000000-0000-4000-8000-000000000004",
          activity_category: "bike",
        },
      ],
    },
    "mixed",
  );
  await expectConstraintFailure(
    target,
    { ...validStructure, segments: [{ role: "transition" }] },
    "transition",
  );
  await expectConstraintFailure(
    target,
    { ...validStructure, segments: [{ role: "unknown" }] },
    "role-invalid",
  );
  await expectConstraintFailure(
    target,
    { version: 3, segments: [{ role: "rest" }] },
    "zero-activity",
  );
  const [validActivitySegment] = validStructure.segments;
  const [validInterval] = validActivitySegment?.intervals ?? [];
  const [validStep] = validInterval?.steps ?? [];
  if (!validActivitySegment || !validInterval || !validStep)
    throw new Error("forward-upgrade valid structure fixture is incomplete");
  for (const [label, structure] of [
    [
      "nil-uuid",
      {
        ...validStructure,
        segments: [
          {
            ...validActivitySegment,
            id: "00000000-0000-0000-0000-000000000000",
          },
        ],
      },
    ],
    ["extra-top-key", { ...validStructure, ignored: true }],
    [
      "extra-segment-key",
      { ...validStructure, segments: [{ ...validActivitySegment, ignored: true }] },
    ],
    [
      "invalid-activity_category",
      { ...validStructure, segments: [{ ...validActivitySegment, activity_category: "hike" }] },
    ],
    [
      "missing-step-name",
      {
        ...validStructure,
        segments: [
          {
            ...validActivitySegment,
            intervals: [{ ...validInterval, steps: [{ ...validStep, name: undefined }] }],
          },
        ],
      },
    ],
    [
      "unsupported-duration",
      {
        ...validStructure,
        segments: [
          {
            ...validActivitySegment,
            intervals: [
              {
                ...validInterval,
                steps: [{ ...validStep, duration: { type: "time", seconds: 0 } }],
              },
            ],
          },
        ],
      },
    ],
    [
      "incompatible-target",
      {
        ...validStructure,
        segments: [
          {
            ...validActivitySegment,
            intervals: [
              {
                ...validInterval,
                steps: [{ ...validStep, targets: [{ type: "watts", intensity: 200 }] }],
              },
            ],
          },
        ],
      },
    ],
  ] as const)
    await expectConstraintFailure(target, structure, label);
  await expectConstraintFailure(
    target,
    {
      ...validStructure,
      segments: [
        validActivitySegment,
        restSegment,
        { ...restSegment, id: "30000000-0000-4000-8000-000000000011" },
      ],
    },
    "consecutive-rests",
  );
  await expectConstraintFailure(
    target,
    {
      ...validStructure,
      segments: [
        { ...validActivitySegment, intervals: [{ ...validInterval, id: validActivitySegment.id }] },
      ],
    },
    "duplicate-id",
  );
  await expectConstraintFailure(
    target,
    {
      ...validStructure,
      segments: [
        {
          ...validActivitySegment,
          intervals: [
            {
              ...validInterval,
              repetitions: 8,
              steps: [{ ...validStep, duration: { type: "time", seconds: 86400 } }],
            },
          ],
        },
      ],
    },
    "explicit-timed-budget",
  );
  const distinctSteps = Array.from({ length: 20 }, (_, index) => ({
    ...validStep,
    id: `30000000-0000-4000-8000-${String(index + 20).padStart(12, "0")}`,
  }));
  await expectConstraintFailure(
    target,
    {
      ...validStructure,
      segments: [
        {
          ...validActivitySegment,
          intervals: [
            {
              ...validInterval,
              id: "30000000-0000-4000-8000-000000000040",
              repetitions: 50,
              steps: distinctSteps,
            },
            {
              ...validInterval,
              id: "30000000-0000-4000-8000-000000000041",
              repetitions: 50,
              steps: distinctSteps.map((step, index) => ({
                ...step,
                id: `30000000-0000-4000-8000-${String(index + 60).padStart(12, "0")}`,
              })),
            },
          ],
        },
      ],
    },
    "expanded-occurrences",
  );
  const oversizedIntervals = Array.from({ length: 50 }, (_, intervalIndex) => ({
    ...validInterval,
    id: `30000000-0000-4000-8000-${String(intervalIndex + 100).padStart(12, "0")}`,
    repetitions: 1,
    steps: Array.from({ length: 20 }, (_, stepIndex) => ({
      ...validStep,
      id: `30000000-0000-4000-8000-${String(intervalIndex * 20 + stepIndex + 200).padStart(12, "0")}`,
      notes: "x".repeat(1000),
    })),
  }));
  await expectConstraintFailure(
    target,
    { ...validStructure, segments: [{ ...validActivitySegment, intervals: oversizedIntervals }] },
    "encoded-size",
  );
});

await withDisposableDatabase(process.argv.slice(2), "forward_abort", async (target) => {
  await applyBaseline(target);
  const invalidStructure = {
    version: 3,
    segments: [
      { role: "activity", activity_category: "run" },
      { role: "activity", activity_category: "bike" },
    ],
  };
  await insertPlan(target, invalidStructure);
  try {
    await applySqlFile(
      target,
      resolve(
        dbPackageRoot,
        policy.authorityDirectory,
        `${canonicalCheckMigration.version}_${canonicalCheckMigration.name}.sql`,
      ),
      canonicalCheckMigration.executionMode,
    );
  } catch (error) {
    if (!String(error).includes("require explicit environment reset or cleanup")) throw error;
    const preserved = await target.query<{ structure: unknown }>(
      "select structure from public.activity_plans where id = $1",
      [planId],
    );
    const functionExists = await target.query<{ exists: boolean }>(
      "select to_regprocedure('public.activity_plan_structure_is_canonical(jsonb)') is not null as exists",
    );
    const constraintExists = await target.query(
      "select 1 from pg_constraint where conname = 'activity_plans_structure_canonical_check'",
    );
    if (
      JSON.stringify(preserved.rows[0]?.structure) !== JSON.stringify(invalidStructure) ||
      functionExists.rows[0]?.exists !== false ||
      constraintExists.rowCount !== 0
    ) {
      throw new Error("aborted canonical migration mutated ActivityPlan data or schema");
    }
    return;
  }
  throw new Error("noncanonical ActivityPlan did not abort the forward migration");
});

await withDisposableDatabase(process.argv.slice(2), "raw_source_abort", async (target) => {
  await applyBaseline(target);
  for (const entry of ledger.entries.slice(1, rawSourceMigrationIndex)) {
    await applySqlFile(
      target,
      resolve(dbPackageRoot, policy.authorityDirectory, `${entry.version}_${entry.name}.sql`),
      entry.executionMode,
      autocommitSettings(policy, entry),
    );
  }
  const legacyActivityId = "40000000-0000-4000-8000-000000000099";
  const legacySegmentId = "50000000-0000-4000-8000-000000000099";
  await insertActivityWithSegment(target, {
    activityId: legacyActivityId,
    segmentId: legacySegmentId,
    rawSportString: "",
  });

  try {
    await applySqlFile(
      target,
      resolve(
        dbPackageRoot,
        policy.authorityDirectory,
        `${rawSourceMigration.version}_${rawSourceMigration.name}.sql`,
      ),
      rawSourceMigration.executionMode,
    );
  } catch (error) {
    if (!String(error).includes("Activity segment raw-source migration aborted")) {
      throw error;
    }
    const preserved = await target.query<{ raw_sport_string: string | null }>(
      "select raw_sport_string from public.activity_segments where id = $1",
      [legacySegmentId],
    );
    const columns = await target.query<{ column_name: string }>(
      `select column_name
         from information_schema.columns
        where table_schema = 'public'
          and table_name = 'activity_segments'
          and column_name in ('category', 'activity_category', 'raw_sub_sport_string')
        order by column_name`,
    );
    if (
      preserved.rows[0]?.raw_sport_string !== "" ||
      JSON.stringify(columns.rows.map((row) => row.column_name)) !== JSON.stringify(["category"])
    ) {
      throw new Error("aborted raw-source migration mutated activity segment data or schema");
    }
    return;
  }
  throw new Error("invalid legacy raw source string did not abort the forward migration");
});

console.log(
  "[db:migration:upgrade] canonical rows, activity segment source fidelity, activity-category effort trigger, strict Core inventory, durable constraint failures, and non-mutating migration aborts passed",
);
