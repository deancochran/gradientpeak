import {
  applySqlFile,
  bootstrapSupabaseSchemas,
  withDisposableDatabase,
} from "./_disposable-target";
import { requireFreshBaseline } from "./baseline-workflow";

const ownerId = "00000000-0000-4000-8000-000000000001";
const otherId = "00000000-0000-4000-8000-000000000002";
const activityIndexName = "idx_activities_athlete_state_replay";
const effortIndexName = "idx_activity_efforts_athlete_state_replay";
const pageLimit = 100;

type ExplainNode = {
  "Actual Rows"?: number;
  "Index Cond"?: string;
  "Index Name"?: string;
  "Node Type"?: string;
  "Relation Name"?: string;
  "Rows Removed by Filter"?: number;
  Plans?: ExplainNode[];
};

type Explain = { Plan: ExplainNode; "Execution Time": number };

function flatten(node: ExplainNode): ExplainNode[] {
  return [node, ...(node.Plans?.flatMap(flatten) ?? [])];
}

function assertReplayPlan(name: string, explain: Explain, requireKeyset: boolean) {
  const nodes = flatten(explain.Plan);
  const indexNode = nodes.find((node) => node["Index Name"] === activityIndexName);
  if (!indexNode) throw new Error(`${name} did not use ${activityIndexName}`);
  if (
    nodes.some((node) => node["Relation Name"] === "activities" && node["Node Type"] === "Seq Scan")
  )
    throw new Error(`${name} scanned multi-profile activity history sequentially`);
  if (nodes.some((node) => node["Node Type"] === "Sort"))
    throw new Error(`${name} did not preserve profile_id, finished_at, id index order`);
  if ((indexNode["Actual Rows"] ?? 0) > pageLimit)
    throw new Error(`${name} read beyond the bounded replay page`);
  if ((indexNode["Rows Removed by Filter"] ?? 0) !== 0)
    throw new Error(`${name} filtered rows after the replay index scan`);
  const indexCondition = indexNode["Index Cond"] ?? "";
  if (!indexCondition.includes("profile_id") || !indexCondition.includes("finished_at"))
    throw new Error(`${name} did not constrain profile and replay position in the index`);
  if (requireKeyset && !indexCondition.includes("id"))
    throw new Error(`${name} did not constrain the full finished_at, id keyset in the index`);
}

function assertEffortReplayPlan(name: string, explain: Explain, requireKeyset: boolean) {
  const nodes = flatten(explain.Plan);
  const indexNode = nodes.find((node) => node["Index Name"] === effortIndexName);
  if (!indexNode)
    throw new Error(
      `${name} did not use ${effortIndexName}: ${JSON.stringify(
        nodes.map((node) => ({
          index: node["Index Name"],
          node: node["Node Type"],
          relation: node["Relation Name"],
        })),
      )}`,
    );
  if (
    nodes.some(
      (node) => node["Relation Name"] === "activity_efforts" && node["Node Type"] === "Seq Scan",
    )
  )
    throw new Error(`${name} scanned multi-profile effort history sequentially`);
  const indexCondition = indexNode["Index Cond"] ?? "";
  if (!indexCondition.includes("profile_id"))
    throw new Error(`${name} did not constrain the effort profile in the index`);
  if (requireKeyset && !indexCondition.includes("id"))
    throw new Error(`${name} did not constrain the effort id keyset in the index`);
}

await withDisposableDatabase(
  process.argv.slice(2),
  "athlete_state_replay_benchmark",
  async (db) => {
    await bootstrapSupabaseSchemas(db);
    await applySqlFile(db, requireFreshBaseline().sourcePath);
    await db.query(
      "insert into auth.users (id, email, raw_user_meta_data) values ($1, 'replay-owner@example.test', '{}'::jsonb), ($2, 'replay-other@example.test', '{}'::jsonb)",
      [ownerId, otherId],
    );
    await db.query("begin");
    // Complete replay rows are split across profiles and across the as-of boundary.
    await db.query(
      `insert into public.activities (
       id, profile_id, name, started_at, finished_at, elapsed_ms, active_ms, moving_ms,
       timing_coverage, parser_version, decoded_contract_version, materializer_version,
       athlete_state_common_load, athlete_state_activity_category,
       athlete_state_evidence_confidence, athlete_state_input_version, athlete_state_computed_at
     )
     select ('61000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
        case when i % 20 = 0 then $1::uuid else $2::uuid end,
       'complete-replay-' || i,
       completed_at - interval '1 minute', completed_at,
       60000, 60000, 60000, 'complete', 'proof-v1', 'proof-v1', 'proof-v1',
       10, 'run', 0.9, 'canonical-activity-state-v1', completed_at
     from (
       select i, case when i <= 30000
         then timestamp with time zone '2025-01-01 00:00:00+00' + (i * interval '1 minute')
         else timestamp with time zone '2035-01-01 00:00:00+00' + (i * interval '1 minute')
       end as completed_at
       from generate_series(1, 60000) i
     ) rows`,
      [ownerId, otherId],
    );
    // Incomplete rows must stay outside the partial replay index.
    await db.query(
      `insert into public.activities (
       id, profile_id, name, started_at, finished_at, elapsed_ms,
       parser_version, decoded_contract_version, materializer_version
     )
     select ('62000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
        case when i % 20 = 0 then $1::uuid else $2::uuid end,
       'incomplete-replay-' || i,
       timestamp with time zone '2025-01-01 00:00:00+00' + (i * interval '1 minute'),
       timestamp with time zone '2025-01-01 00:01:00+00' + (i * interval '1 minute'),
       60000, 'proof-v1', 'proof-v1', 'proof-v1'
     from generate_series(1, 30000) i`,
      [ownerId, otherId],
    );
    await db.query(
      `insert into public.activity_segments (
         id, activity_id, profile_id, ordinal, role, activity_category,
         start_offset_ms, end_offset_ms, summary, summary_version,
         timing_coverage, active_ms, moving_ms, segment_revision,
         parser_version, materializer_version, created_at
       )
       select ('63000000-0000-4000-8000-' || lpad(row_number() over (order by id)::text, 12, '0'))::uuid,
         id, profile_id, 0, 'activity', 'run', 0, 60000,
         jsonb_build_object(
           'version', 1,
           'timing', jsonb_build_object(
             'timingCoverage', 'complete', 'activeMs', 60000, 'movingMs', 60000
           )
         ),
         1, 'complete', 60000, 60000, 1, 'proof-v1', 'proof-v1', finished_at
        from public.activities`,
    );
    await db.query(
      `insert into public.activity_efforts (
         id, created_at, profile_id, activity_id, segment_id, recorded_at,
         activity_category, effort_type, duration_seconds, distance_meters,
          start_offset, unit, value, source, method, calculation_version, quality_score, provenance
       )
       select ('64000000-0000-4000-8000-' || lpad(rn::text, 12, '0'))::uuid,
         recorded_at, profile_id, activity_id, segment_id, recorded_at,
         'run', 'speed', 60, 240, 0, 'meters_per_second', 4,
          'derived', 'athlete-state-replay-proof', 'proof-v1', 0.9,
          jsonb_build_object('observation_id', ('64000000-0000-4000-8000-' || lpad(rn::text, 12, '0')))
       from (
         select row_number() over (order by activity.id) as rn,
           activity.id as activity_id, activity.profile_id, segment.id as segment_id,
           case when row_number() over (order by activity.id) % 7 = 0
             then timestamp with time zone '2036-01-01 00:00:00+00'
             else activity.finished_at
           end as recorded_at
         from public.activities activity
         join public.activity_segments segment
           on segment.activity_id = activity.id and segment.profile_id = activity.profile_id
         where activity.athlete_state_common_load is not null
       ) efforts`,
    );
    await db.query("commit");
    await db.query("analyze public.activities");
    await db.query("analyze public.activity_efforts");

    const asOf = "2026-08-06T12:00:00.000Z";
    const predicate = `profile_id = '${ownerId}'::uuid
    and athlete_state_common_load is not null
    and athlete_state_activity_category is not null
    and athlete_state_evidence_confidence is not null
    and athlete_state_input_version is not null
    and athlete_state_computed_at is not null
    and finished_at <= '${asOf}'::timestamptz`;
    const explain = async (name: string, cursor?: { finishedAt: string; id: string }) => {
      const cursorPredicate = cursor
        ? `and (finished_at, id) > ('${cursor.finishedAt}'::timestamptz, '${cursor.id}'::uuid)`
        : "";
      const result = await db.query<{ "QUERY PLAN": Explain[] }>(
        `explain (analyze, buffers, format json)
       select id, finished_at, athlete_state_activity_category,
         athlete_state_common_load, athlete_state_evidence_confidence
       from public.activities
       where ${predicate} ${cursorPredicate}
       order by finished_at, id
       limit ${pageLimit}`,
      );
      const value = result.rows[0]?.["QUERY PLAN"][0];
      if (!value) throw new Error(`${name} explain output was empty`);
      assertReplayPlan(name, value, Boolean(cursor));
      console.log(
        `[db:athlete-state-replay:plan:test] ${name} selected ${activityIndexName}: execution=${value["Execution Time"]}ms`,
      );
    };

    await explain("first multi-profile replay page");
    await explain("keyset multi-profile replay page", {
      finishedAt: "2025-01-07T22:40:00.000Z",
      id: "61000000-0000-4000-8000-000000010000",
    });

    const explainEfforts = async (name: string, cursorId?: string) => {
      const cursorPredicate = cursorId ? `and effort.id > '${cursorId}'::uuid` : "";
      const result = await db.query<{ "QUERY PLAN": Explain[] }>(
        `explain (analyze, buffers, format json)
         select effort.id, effort.activity_category, effort.effort_type,
           effort.duration_seconds, effort.value, effort.quality_score, effort.recorded_at
         from public.activity_efforts effort
         join public.activities activity
           on activity.id = effort.activity_id and activity.profile_id = effort.profile_id
         where effort.profile_id = '${ownerId}'::uuid
           and effort.activity_id is not null
           and effort.recorded_at <= '${asOf}'::timestamptz
           and activity.finished_at <= '${asOf}'::timestamptz
           ${cursorPredicate}
         order by effort.id
         limit ${pageLimit}`,
      );
      const value = result.rows[0]?.["QUERY PLAN"][0];
      if (!value) throw new Error(`${name} explain output was empty`);
      assertEffortReplayPlan(name, value, Boolean(cursorId));
      console.log(
        `[db:athlete-state-replay:plan:test] ${name} selected ${effortIndexName}: execution=${value["Execution Time"]}ms`,
      );
    };

    await explainEfforts("first multi-profile effort replay page");
    await explainEfforts(
      "keyset multi-profile effort replay page",
      "64000000-0000-4000-8000-000000010000",
    );
  },
);
