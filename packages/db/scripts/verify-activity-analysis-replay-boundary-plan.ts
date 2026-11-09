import type { Pool } from "pg";
import {
  applySqlFile,
  bootstrapSupabaseSchemas,
  withDisposableDatabase,
} from "./_disposable-target";
import { requireFreshBaseline } from "./baseline-workflow";

const denseProfileId = "00000000-0000-4000-8000-000000000011";
const sparseProfileId = "00000000-0000-4000-8000-000000000012";
const otherProfileId = "00000000-0000-4000-8000-000000000013";
const boundaryActivityId = "71000000-0000-4000-8000-000000000000";
const from = "2025-06-01T00:00:00.000Z";
const pageSize = 25;
const queryLimit = pageSize + 1;

type Cursor = { startedAt: string; activityId: string };

type ExplainNode = {
  "Actual Rows"?: number;
  "Node Type"?: string;
  "Relation Name"?: string;
  "Rows Removed by Filter"?: number;
  "Shared Hit Blocks"?: number;
  "Shared Read Blocks"?: number;
  "Temp Read Blocks"?: number;
  "Temp Written Blocks"?: number;
  Plans?: ExplainNode[];
};

type Explain = { Plan: ExplainNode; "Execution Time": number };
type ActivityRow = { id: string; started_at: Date; finished_at: Date };

function flatten(node: ExplainNode): ExplainNode[] {
  return [node, ...(node.Plans?.flatMap(flatten) ?? [])];
}

function diagnostics(explain: Explain) {
  const root = explain.Plan;
  // Buffer counters on ancestors include child work. Report the root counters only
  // rather than summing plan nodes and presenting a double-counted physical total.
  const rootBuffers = {
    sharedHitBlocks: root["Shared Hit Blocks"] ?? 0,
    sharedReadBlocks: root["Shared Read Blocks"] ?? 0,
    tempReadBlocks: root["Temp Read Blocks"] ?? 0,
    tempWrittenBlocks: root["Temp Written Blocks"] ?? 0,
  };
  const activityNodes = flatten(root)
    .filter((node) => node["Relation Name"] === "activities")
    .map((node) => ({
      nodeType: node["Node Type"] ?? "unknown",
      // These are local plan-node counters, not a physical-row scan estimate.
      localReturned: node["Actual Rows"] ?? 0,
      localRejected: node["Rows Removed by Filter"] ?? 0,
    }));
  return {
    activityNodes,
    executionMilliseconds: explain["Execution Time"],
    rootBuffers,
    sortNodes: flatten(root).filter((node) => node["Node Type"] === "Sort").length,
  };
}

function replayQuery(input: { cursor: Cursor | null; limited: boolean; to?: string }) {
  const predicates = [
    "profile_id = $1::uuid",
    "started_at is not null",
    "finished_at >= $2::timestamptz",
  ];
  const values: string[] = [];
  let parameter = 3;
  if (input.to) {
    predicates.push(`started_at < $${parameter}::timestamptz`);
    values.push(input.to);
    parameter += 1;
  }
  if (input.cursor) {
    predicates.push(
      `(started_at > $${parameter}::timestamptz or (started_at = $${parameter}::timestamptz and id > $${parameter + 1}::uuid))`,
    );
    values.push(input.cursor.startedAt, input.cursor.activityId);
  }
  return {
    sql: `select * from public.activities
      where ${predicates.join("\n        and ")}
      order by started_at asc, id asc${input.limited ? `\n      limit ${queryLimit}` : ""}`,
    values,
  };
}

function assertPage(
  name: string,
  rows: ActivityRow[],
  input: { cursor: Cursor | null; expectedRows?: number; limited: boolean; to?: string },
) {
  if (input.limited && rows.length !== queryLimit) {
    throw new Error(`${name} fixture did not return the ${queryLimit}-row max+1 page`);
  }
  if (!input.limited && rows.length !== input.expectedRows) {
    throw new Error(`${name} fixture did not return its ${input.expectedRows}-row unclaimed range`);
  }
  if (new Set(rows.map((row) => row.id)).size !== rows.length) {
    throw new Error(`${name} returned duplicate activity IDs`);
  }
  for (const [index, row] of rows.entries()) {
    if (row.finished_at < new Date(from)) {
      throw new Error(`${name} excluded the inclusive finished_at >= from boundary`);
    }
    if (input.to && row.started_at >= new Date(input.to)) {
      throw new Error(`${name} did not preserve the optional started_at < to boundary`);
    }
    const previous = rows[index - 1];
    if (
      previous &&
      (row.started_at < previous.started_at ||
        (row.started_at.getTime() === previous.started_at.getTime() && row.id <= previous.id))
    ) {
      throw new Error(`${name} did not preserve started_at, id ascending order`);
    }
    if (
      input.cursor &&
      (row.started_at < new Date(input.cursor.startedAt) ||
        (row.started_at.getTime() === new Date(input.cursor.startedAt).getTime() &&
          row.id <= input.cursor.activityId))
    ) {
      throw new Error(`${name} did not apply a strict started_at, id keyset cursor`);
    }
  }
}

async function runPage(
  db: Pool,
  input: {
    name: string;
    profileId: string;
    cursor: Cursor | null;
    expectedRows?: number;
    limited: boolean;
    to?: string;
  },
) {
  const query = replayQuery(input);
  const values = [input.profileId, from, ...query.values];
  const selected = await db.query<ActivityRow>(query.sql, values);
  assertPage(input.name, selected.rows, input);
  const explainResult = await db.query<{ "QUERY PLAN": Explain[] }>(
    `explain (analyze, buffers, format json) ${query.sql}`,
    values,
  );
  const explain = explainResult.rows[0]?.["QUERY PLAN"][0];
  if (!explain) throw new Error(`${input.name} explain output was empty`);
  const observed = diagnostics(explain);
  console.log(
    `[db:activity-analysis-replay:plan:test] ${input.name}: ` +
      `activity_node_local=${JSON.stringify(observed.activityNodes)} ` +
      `root_shared_hit=${observed.rootBuffers.sharedHitBlocks} ` +
      `root_shared_read=${observed.rootBuffers.sharedReadBlocks} ` +
      `root_temp_read=${observed.rootBuffers.tempReadBlocks} ` +
      `root_temp_written=${observed.rootBuffers.tempWrittenBlocks} ` +
      `sorts=${observed.sortNodes} execution=${observed.executionMilliseconds}ms`,
  );
  return selected.rows;
}

async function runFirstAndKeyset(
  db: Pool,
  input: { name: string; profileId: string },
  requireExactBoundary: boolean,
) {
  const first = await runPage(db, {
    ...input,
    name: `${input.name} first page`,
    cursor: null,
    limited: true,
  });
  if (requireExactBoundary) {
    const boundary = first.find((row) => row.id === boundaryActivityId);
    const fromMilliseconds = Date.parse(from);
    if (
      !boundary ||
      boundary.started_at.getTime() >= fromMilliseconds ||
      boundary.finished_at.getTime() !== fromMilliseconds
    ) {
      throw new Error(
        `${input.name} did not include the started-before-from, finished-at-from activity`,
      );
    }
  }
  const cursor = first[pageSize - 1];
  const lookahead = first[pageSize];
  if (!cursor || !lookahead) throw new Error(`${input.name} first page lacked cursor or lookahead`);
  const second = await runPage(db, {
    ...input,
    name: `${input.name} strict keyset page`,
    cursor: { startedAt: cursor.started_at.toISOString(), activityId: cursor.id },
    limited: true,
  });
  if (second[0]?.id !== lookahead.id) {
    throw new Error(`${input.name} second page did not begin with the first page lookahead row`);
  }
  const firstProcessedIds = new Set(first.slice(0, pageSize).map((row) => row.id));
  if (second.slice(0, pageSize).some((row) => firstProcessedIds.has(row.id))) {
    throw new Error(`${input.name} processed keyset pages were not disjoint`);
  }
}

await withDisposableDatabase(
  process.argv.slice(2),
  "activity_analysis_replay_boundary",
  async (db) => {
    await bootstrapSupabaseSchemas(db);
    for (const migrationPath of requireFreshBaseline().migrationPaths) {
      await applySqlFile(db, migrationPath);
    }
    await db.query(
      "insert into auth.users (id, email, raw_user_meta_data) values ($1, 'dense@example.test', '{}'::jsonb), ($2, 'sparse@example.test', '{}'::jsonb), ($3, 'other@example.test', '{}'::jsonb)",
      [denseProfileId, sparseProfileId, otherProfileId],
    );

    await db.query("begin");
    await db.query("set constraints all deferred");
    // Explicit late completion: it starts before `from` and finishes exactly at it.
    await db.query(
      `insert into public.activities (
        id, profile_id, name, started_at, finished_at, elapsed_ms, active_ms, moving_ms,
        timing_coverage, parser_version, decoded_contract_version, materializer_version, distance_meters
      ) values (
        $1::uuid, $2::uuid, 'finished-at-from-boundary', timestamptz '2025-02-28 00:00:00+00',
        $3::timestamptz, 8035200000, 8035200000, 8035200000, 'complete',
        'replay-proof-v1', 'replay-proof-v1', 'replay-proof-v1', 1000
      )`,
      [boundaryActivityId, denseProfileId, from],
    );
    await db.query(
      `insert into public.activities (
        id, profile_id, name, started_at, finished_at, elapsed_ms, active_ms, moving_ms,
        timing_coverage, parser_version, decoded_contract_version, materializer_version, distance_meters
      )
      select ('71000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, $1::uuid,
        'dense-owner-' || i,
        timestamptz '2025-03-01 00:00:00+00' + i * interval '1 hour',
        timestamptz '2025-03-01 00:00:00+00' + i * interval '1 hour' + interval '92 days',
        7948800000, 7948800000, 7948800000, 'complete', 'replay-proof-v1', 'replay-proof-v1', 'replay-proof-v1', 1000
      from generate_series(1, 6000) i`,
      [denseProfileId],
    );
    // This separate sparse profile has old history and more than two 25+1 pages
    // of qualifying late completions; its IDs are not a dense-profile prefix.
    await db.query(
      `insert into public.activities (
        id, profile_id, name, started_at, finished_at, elapsed_ms, active_ms, moving_ms,
        timing_coverage, parser_version, decoded_contract_version, materializer_version, distance_meters
      )
      select ('81000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, $1::uuid,
        'sparse-qualifying-' || i,
        timestamptz '2024-01-01 00:00:00+00' + i * interval '1 day',
        timestamptz '2025-06-01 00:00:00+00' + i * interval '1 day',
        44668800000, 44668800000, 44668800000, 'complete', 'replay-proof-v1', 'replay-proof-v1', 'replay-proof-v1', 1000
      from generate_series(1, 60) i`,
      [sparseProfileId],
    );
    await db.query(
      `insert into public.activities (
        id, profile_id, name, started_at, finished_at, elapsed_ms, active_ms, moving_ms,
        timing_coverage, parser_version, decoded_contract_version, materializer_version, distance_meters
      )
      select ('81100000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, $1::uuid,
        'sparse-old-history-' || i,
        timestamptz '2010-01-01 00:00:00+00' + i * interval '14 days',
        timestamptz '2010-01-01 00:00:00+00' + i * interval '14 days' + interval '1 hour',
        60000, 60000, 60000, 'complete', 'replay-proof-v1', 'replay-proof-v1', 'replay-proof-v1', 1000
      from generate_series(1, 300) i`,
      [sparseProfileId],
    );
    await db.query(
      `insert into public.activities (
        id, profile_id, name, started_at, finished_at, elapsed_ms, active_ms, moving_ms,
        timing_coverage, parser_version, decoded_contract_version, materializer_version, distance_meters
      )
      select ('82000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, $1::uuid,
        'other-profile-' || i,
        timestamptz '2024-01-01 00:00:00+00' + i * interval '1 hour',
        timestamptz '2024-01-01 00:00:00+00' + i * interval '1 hour' + interval '1 hour',
        60000, 60000, 60000, 'complete', 'replay-proof-v1', 'replay-proof-v1', 'replay-proof-v1', 1000
      from generate_series(1, 20000) i`,
      [otherProfileId],
    );
    await db.query(
      `insert into public.activity_artifacts (id, profile_id, digest, byte_size, bucket, path, media_type, format)
       values
        ('70000000-0000-4000-8000-000000000011', $1::uuid, repeat('a', 64), 1, 'activity-files', public.activity_artifact_content_path($1::uuid, repeat('a', 64)), 'application/vnd.ant.fit', 'fit'),
        ('70000000-0000-4000-8000-000000000012', $2::uuid, repeat('b', 64), 1, 'activity-files', public.activity_artifact_content_path($2::uuid, repeat('b', 64)), 'application/vnd.ant.fit', 'fit'),
        ('70000000-0000-4000-8000-000000000013', $3::uuid, repeat('c', 64), 1, 'activity-files', public.activity_artifact_content_path($3::uuid, repeat('c', 64)), 'application/vnd.ant.fit', 'fit')`,
      [denseProfileId, sparseProfileId, otherProfileId],
    );
    await db.query(
      `insert into public.activity_artifact_links (id, activity_id, artifact_id, profile_id, role, ordinal, is_current)
       select ('73000000-0000-4000-8000-' || lpad(row_number() over (order by id)::text, 12, '0'))::uuid,
         id,
         case profile_id
           when $1::uuid then '70000000-0000-4000-8000-000000000011'::uuid
           when $2::uuid then '70000000-0000-4000-8000-000000000012'::uuid
           else '70000000-0000-4000-8000-000000000013'::uuid
         end,
         profile_id, 'source', 0, true
       from public.activities`,
      [denseProfileId, sparseProfileId],
    );
    await db.query(
      `insert into public.activity_segments (
        id, activity_id, profile_id, ordinal, role, activity_category, start_offset_ms, end_offset_ms,
        source_artifact_id, summary, summary_version, timing_coverage, active_ms, moving_ms,
        segment_revision, parser_version, materializer_version
      )
      select ('74000000-0000-4000-8000-' || lpad(row_number() over (order by activity.id)::text, 12, '0'))::uuid,
        activity.id, activity.profile_id, 0, 'activity', 'run', 0, activity.elapsed_ms, link.artifact_id,
        jsonb_build_object(
          'version', 1,
          'timing', jsonb_build_object(
            'timingCoverage', 'complete',
            'activeMs', activity.active_ms,
            'movingMs', activity.moving_ms
          )
        ),
        1, 'complete', activity.active_ms, activity.moving_ms, 1, 'replay-proof-v1', 'replay-proof-v1'
      from public.activities activity
      join public.activity_artifact_links link
        on link.activity_id = activity.id and link.profile_id = activity.profile_id and link.role = 'source'`,
    );
    await db.query("commit");
    await db.query("analyze public.activities");

    // The durable worker supplies `from` but no `to`; both first/keyset pairs
    // therefore execute the production worker shape exactly.
    await runFirstAndKeyset(
      db,
      { name: "dense profile no-to replay", profileId: denseProfileId },
      true,
    );
    await runFirstAndKeyset(
      db,
      { name: "sparse profile no-to replay", profileId: sparseProfileId },
      false,
    );
    await runPage(db, {
      name: "optional-to manual replay range",
      profileId: denseProfileId,
      cursor: null,
      expectedRows: 1080,
      limited: false,
      to: "2025-04-15T00:00:00.000Z",
    });
  },
);

console.log(
  "[db:activity-analysis-replay:plan:test] methodology: guarded disposable fresh baseline; canonical artifact/link/segment graphs under deferred constraints; dense, sparse, and other-profile histories. EXPLAIN ANALYZE BUFFERS records diagnostics only: root-plan buffers avoid inclusive-node double counting, activity node counters are explicitly local returned/rejected values, and no elapsed-time, buffer, sort, temp, or filter threshold is used as a pass condition.",
);
