import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
const root = fileURLToPath(new URL("..", import.meta.url));
const expand = await readFile(
  `${root}/drizzle/0030_expand_and_backfill_activity_extensions.sql`,
  "utf8",
);
const contract = await readFile(`${root}/scripts/contract_activity_extension_tables.sql`, "utf8");
const supabaseExpand = await readFile(
  `${root}/supabase/migrations/20260714120000_expand_and_backfill_activity_extensions.sql`,
  "utf8",
);
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const client = new Client({
  connectionString: process.env.DATABASE_URL,
});
assertMigrationCutover(expand, "Drizzle");
assertMigrationCutover(supabaseExpand, "Supabase");

function assertMigrationCutover(sql: string, label: string) {
  if (!sql.includes("pg_advisory_xact_lock") || !sql.includes("DEPLOYMENT STOP CONDITION"))
    throw new Error(`${label} migration lacks quiescent-cutover guard/documentation`);
  if (sql.includes("create trigger") || sql.includes("sync_activity_"))
    throw new Error(`${label} migration contains unsafe compatibility synchronization`);
}

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

async function executionTime(sql: string) {
  const result = await client.query<{ "QUERY PLAN": string }>(
    `explain (analyze, buffers, format text) ${sql}`,
  );
  const plan = result.rows.map((row) => row["QUERY PLAN"]).join("\n");
  const match = /Execution Time: ([\d.]+) ms/.exec(plan);
  assert(match, "EXPLAIN did not report execution time");
  return { milliseconds: Number(match[1]), plan };
}

await client.connect();
try {
  await client.query("begin");
  await client.query("set local session_replication_role = replica");
  const profile = "f0000000-0000-4000-8000-000000000001";
  await client.query(
    "insert into public.profiles(id,email) values ($1,'activity-migration@test.invalid')",
    [profile],
  );
  await client.query("set local session_replication_role = origin");
  for (const [position, lapCount] of [0, 1, 10, 50, 200, 1000].entries()) {
    const id = `f0000000-0000-4000-8000-${String(position + 10).padStart(12, "0")}`;
    await client.query(
      "insert into public.activities(id,profile_id,name,type,started_at,finished_at,duration_seconds,moving_seconds,distance_meters,avg_power,laps) values($1,$2,$3,'run',now(),now(),1,1,1,321,'[]')",
      [id, profile, `laps-${lapCount}`],
    );
    await client.query(
      "insert into public.activity_summaries(activity_id,profile_id,duration_seconds,moving_seconds,distance_meters) values($1,$2,100,90,1000)",
      [id, profile],
    );
    if (position === 0)
      await client.query(
        "insert into public.activity_imports(activity_id,profile_id,provider,external_id) values($1,$2,'wahoo','provider-1')",
        [id, profile],
      );
    for (let lap = lapCount - 1; lap >= 0; lap -= 1)
      await client.query(
        "insert into public.activity_laps(activity_id,profile_id,lap_index,payload) values($1,$2,$3::integer,jsonb_build_object('index',$3::integer))",
        [id, profile, lap],
      );
  }
  await client.query(
    "insert into public.activities(id,profile_id,name,type,started_at,finished_at) select gen_random_uuid(),$1,'cardinality-'||n,'run',now()-(n||' seconds')::interval,now() from generate_series(1,5000)n",
    [profile],
  );
  await client.query(
    "insert into public.activity_summaries(activity_id,profile_id) select id,profile_id from public.activities where profile_id=$1 and name like 'cardinality-%'",
    [profile],
  );

  const legacyList = await executionTime(
    `select a.id,s.distance_meters from public.activities a left join public.activity_summaries s on s.activity_id=a.id where a.profile_id='${profile}' order by a.started_at desc limit 50`,
  );
  const legacyDetail = await executionTime(
    `select a.*,coalesce(jsonb_agg(l.payload order by l.lap_index) filter(where l.id is not null),'[]') laps_from_child from public.activities a left join public.activity_laps l on l.activity_id=a.id where a.profile_id='${profile}' group by a.id order by jsonb_array_length(coalesce(jsonb_agg(l.payload) filter(where l.id is not null),'[]')) desc limit 1`,
  );

  await client.query("savepoint conflict");
  await client.query(
    "update public.activities set provider='strava',external_id='different' where external_id is null and name='laps-0'",
  );
  let conflicted = false;
  try {
    await client.query(expand);
  } catch (error) {
    conflicted = String(error).includes("activity consolidation conflict");
  }
  assert(conflicted, "parent/child identity conflict was not rejected");
  await client.query("rollback to savepoint conflict");

  const policyId = "f0000000-0000-4000-8000-000000009999";
  await client.query("savepoint count_policy");
  await client.query(
    "insert into public.activities(id,profile_id,name,type,started_at,finished_at) values($1,$2,'policy','run',now(),now())",
    [policyId, profile],
  );
  await client.query(
    "insert into public.activity_laps(activity_id,profile_id,lap_index,payload) select $1,$2,n,'{}'::jsonb from generate_series(0,1000)n",
    [policyId, profile],
  );
  let countRejected = false;
  try {
    await client.query(expand);
  } catch (error) {
    countRejected = String(error).includes("laps exceed count/size policy");
  }
  assert(countRejected, ">1000 lap preflight was not rejected");
  await client.query("rollback to savepoint count_policy");

  await client.query("savepoint size_policy");
  await client.query(
    "insert into public.activities(id,profile_id,name,type,started_at,finished_at) values($1,$2,'policy','run',now(),now())",
    [policyId, profile],
  );
  await client.query(
    "insert into public.activity_laps(activity_id,profile_id,lap_index,payload) values($1,$2,0,jsonb_build_object('payload',repeat('x',1100000)))",
    [policyId, profile],
  );
  let sizeRejected = false;
  try {
    await client.query(expand);
  } catch (error) {
    sizeRejected = String(error).includes("laps exceed count/size policy");
  }
  assert(sizeRejected, ">1MiB lap preflight was not rejected");
  await client.query("rollback to savepoint size_policy");

  await client.query(expand);
  const preserved = await client.query<{ avg_power: number }>(
    "select avg_power from public.activities where name='laps-0'",
  );
  assert(preserved.rows[0]?.avg_power === 321, "null child summary erased parent value");
  const ordered = await client.query<{ laps: Array<{ index: number }> }>(
    "select laps from public.activities where name='laps-1000'",
  );
  assert(
    ordered.rows[0]?.laps.length === 1000 &&
      ordered.rows[0].laps[0]?.index === 0 &&
      ordered.rows[0].laps[999]?.index === 999,
    "lap order/backfill mismatch",
  );
  await client.query("savepoint duplicate");
  let duplicateRejected = false;
  try {
    await client.query(
      "insert into public.activities(id,profile_id,name,type,started_at,finished_at,provider,external_id) values(gen_random_uuid(),$1,'duplicate','run',now(),now(),'wahoo','provider-1')",
      [profile],
    );
  } catch (error) {
    duplicateRejected = String(error).includes("idx_activities_provider_external_unique");
  }
  assert(duplicateRejected, "provider uniqueness was not enforced");
  await client.query("rollback to savepoint duplicate");

  const parentList = await executionTime(
    `select id,distance_meters from public.activities where profile_id='${profile}' order by started_at desc limit 50`,
  );
  const parentDetail = await executionTime(
    `select * from public.activities where profile_id='${profile}' order by jsonb_array_length(laps) desc limit 1`,
  );
  const warmLegacyList = await executionTime(
    `select a.id,s.distance_meters from public.activities a left join public.activity_summaries s on s.activity_id=a.id where a.profile_id='${profile}' order by a.started_at desc limit 50`,
  );
  const warmParentList = await executionTime(
    `select id,distance_meters from public.activities where profile_id='${profile}' order by started_at desc limit 50`,
  );
  assert(
    Math.max(parentList.milliseconds, warmParentList.milliseconds) <=
      Math.max(Math.max(legacyList.milliseconds, warmLegacyList.milliseconds) * 1.05, 5),
    "list performance budget exceeded",
  );
  assert(
    parentDetail.milliseconds <= Math.max(legacyDetail.milliseconds * 1.1, 10),
    "detail performance budget exceeded",
  );
  assert(
    parentList.plan.includes("activities") && parentDetail.plan.includes("activities"),
    "EXPLAIN did not use parent table",
  );
  assert(
    !/activity_(summaries|imports|geometry|laps)/.test(parentList.plan + parentDetail.plan),
    "parent reads still query child tables",
  );
  assert(parentList.plan.includes("idx_activities_profile_started"), "hot list index was not used");

  await client.query(contract);
  const dropped = await client.query(
    "select to_regclass('public.activity_summaries') summary,to_regclass('public.activity_imports') imports,to_regclass('public.activity_geometry') geometry,to_regclass('public.activity_laps') laps",
  );
  assert(
    Object.values(dropped.rows[0] ?? {}).every((value) => value === null),
    "child tables were not dropped",
  );
  await client.query("rollback");
  const restored = await client.query(
    "select to_regclass('public.activity_summaries') summary,to_regclass('public.activity_imports') imports,to_regclass('public.activity_geometry') geometry,to_regclass('public.activity_laps') laps",
  );
  assert(
    Object.values(restored.rows[0] ?? {}).every(Boolean),
    "transaction rollback did not recreate child tables",
  );
  await client.query("begin");
  await client.query("set local session_replication_role=replica");
  await client.query(
    "insert into public.profiles(id,email) values($1,'activity-supabase@test.invalid')",
    [profile],
  );
  await client.query("set local session_replication_role=origin");
  await client.query(
    "insert into public.activities(id,profile_id,name,type,started_at,finished_at) values($1,$2,'supabase','run',now(),now())",
    ["f0000000-0000-4000-8000-000000000099", profile],
  );
  await client.query(
    "insert into public.activity_summaries(activity_id,profile_id) values($1,$2)",
    ["f0000000-0000-4000-8000-000000000099", profile],
  );
  await client.query(
    "update public.activity_summaries set distance_meters=4321 where activity_id=$1",
    ["f0000000-0000-4000-8000-000000000099"],
  );
  await client.query(supabaseExpand);
  const supabaseRoundTrip = await client.query<{ distance_meters: number }>(
    "select distance_meters from public.activities where id=$1",
    ["f0000000-0000-4000-8000-000000000099"],
  );
  assert(supabaseRoundTrip.rows[0]?.distance_meters === 4321, "Supabase one-time backfill failed");
  await client.query("rollback");
  console.log(
    JSON.stringify({
      legacyListMs: legacyList.milliseconds,
      parentListMs: parentList.milliseconds,
      legacyDetailMs: legacyDetail.milliseconds,
      parentDetailMs: parentDetail.milliseconds,
    }),
  );
} finally {
  await client.end();
}
