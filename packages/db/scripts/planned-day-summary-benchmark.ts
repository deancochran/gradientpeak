import {
  applySqlFile,
  bootstrapSupabaseSchemas,
  withDisposableDatabase,
} from "./_disposable-target";
import { requireFreshBaseline } from "./baseline-workflow";

const ownerId = "00000000-0000-4000-8000-000000000001";
const otherId = "00000000-0000-4000-8000-000000000002";
const targetDate = "2026-07-27";
const indexName = "idx_events_planned_day_summary";
const summaryLimit = 1_001;

type ExplainNode = {
  "Actual Rows"?: number;
  "Actual Loops"?: number;
  "Index Name"?: string;
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

function flatten(node: ExplainNode): ExplainNode[] {
  return [node, ...(node.Plans?.flatMap(flatten) ?? [])];
}

function planMetrics(plan: ExplainNode) {
  return flatten(plan).reduce(
    (metrics, node) => ({
      sharedHitBlocks: metrics.sharedHitBlocks + (node["Shared Hit Blocks"] ?? 0),
      sharedReadBlocks: metrics.sharedReadBlocks + (node["Shared Read Blocks"] ?? 0),
      tempReadBlocks: metrics.tempReadBlocks + (node["Temp Read Blocks"] ?? 0),
      tempWrittenBlocks: metrics.tempWrittenBlocks + (node["Temp Written Blocks"] ?? 0),
    }),
    { sharedHitBlocks: 0, sharedReadBlocks: 0, tempReadBlocks: 0, tempWrittenBlocks: 0 },
  );
}

function assertBoundedIndexedPlan(name: string, explain: Explain) {
  const nodes = flatten(explain.Plan);
  const eventNodes = nodes.filter((node) => node["Relation Name"] === "events");
  const indexNode = nodes.find((node) => node["Index Name"] === indexName);
  if (!indexNode) throw new Error(`${name} did not use ${indexName}`);
  if (eventNodes.some((node) => node["Node Type"] === "Seq Scan"))
    throw new Error(`${name} scanned event history sequentially`);
  if (nodes.some((node) => node["Node Type"] === "Sort"))
    throw new Error(`${name} did not preserve starts_at, id index order`);
  if ((indexNode["Actual Rows"] ?? 0) > summaryLimit)
    throw new Error(`${name} inspected more than the ${summaryLimit}-row max+1 bound`);
  if ((indexNode["Rows Removed by Filter"] ?? 0) !== 0)
    throw new Error(`${name} filtered rows after scanning ${indexName}`);
  const metrics = planMetrics(explain.Plan);
  if (metrics.tempReadBlocks > 0 || metrics.tempWrittenBlocks > 0)
    throw new Error(`${name} spilled to temporary storage`);
  return metrics;
}

await withDisposableDatabase(process.argv.slice(2), "planned_day_summary_benchmark", async (db) => {
  await bootstrapSupabaseSchemas(db);
  for (const migrationPath of requireFreshBaseline().migrationPaths) {
    await applySqlFile(db, migrationPath);
  }
  await db.query(
    "insert into auth.users (id, email, raw_user_meta_data) values ($1, 'owner@example.test', '{}'::jsonb), ($2, 'other@example.test', '{}'::jsonb)",
    [ownerId, otherId],
  );
  // 50,000 non-target rows span history and future dates, types, statuses, and owners.
  await db.query(
    `insert into public.events (id, profile_id, event_type, status, title, starts_at, scheduled_date)
       select ('30000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
         case when i % 5 = 0 then $2::uuid else $1::uuid end,
          (case when i % 3 = 0 then 'custom' when i % 3 = 1 then 'planned' else 'race_target' end)::public.event_type,
         (case when i % 3 = 0 then 'cancelled' when i % 3 = 1 then 'scheduled' else 'completed' end)::public.event_status,
         'history-or-future-' || i,
         case when i <= 25000 then timestamp '2010-01-01 06:00:00+00' + (i || ' days')::interval else timestamp '2040-01-01 06:00:00+00' + ((i - 25000) || ' days')::interval end,
         (case when i <= 25000 then date '2010-01-01' + i else date '2040-01-01' + (i - 25000) end)::text
       from generate_series(1, 50000) as i`,
    [ownerId, otherId],
  );
  // Cancelled rows sort before the 1,001 eligible rows. They must not consume the cap.
  await db.query(
    `insert into public.events (id, profile_id, event_type, status, title, starts_at, scheduled_date)
       select ('40000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, $1::uuid,
         'planned'::public.event_type, 'cancelled'::public.event_status, 'cancelled-' || i,
         timestamp '2026-07-27 06:00:00+00' + (i || ' seconds')::interval, $2
       from generate_series(1, 200) as i`,
    [ownerId, targetDate],
  );
  await db.query(
    `insert into public.events (id, profile_id, event_type, status, title, starts_at, scheduled_date)
       select ('50000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, $1::uuid,
         'planned'::public.event_type, (case when i % 2 = 0 then 'completed' else 'scheduled' end)::public.event_status, 'eligible-' || i,
         timestamp '2026-07-27 06:00:00+00' + ((200 + i) || ' seconds')::interval, $2
       from generate_series(1, 50000) as i`,
    [ownerId, targetDate],
  );
  await db.query("analyze public.events");

  const query = (date: string) => `select activity_plan_id, id, starts_at from public.events
      where profile_id = '${ownerId}'::uuid
        and event_type = 'planned'
        and scheduled_date = '${date}'
        and status in ('scheduled', 'completed')
      order by starts_at asc, id asc
      limit ${summaryLimit}`;
  const populatedRows = await db.query<{ status: "scheduled" | "completed" | "cancelled" }>(
    `select status from (${query(targetDate)}) bounded join public.events using (id)`,
  );
  if (populatedRows.rowCount !== summaryLimit)
    throw new Error("eligible planned-day rows did not reach the max+1 cap");
  if (populatedRows.rows.some((row) => row.status === "cancelled"))
    throw new Error("cancelled planned-day rows were included before the max+1 cap");
  if (!populatedRows.rows.some((row) => row.status === "scheduled"))
    throw new Error("scheduled planned-day rows were not included");
  if (!populatedRows.rows.some((row) => row.status === "completed"))
    throw new Error("completed planned-day rows were not included");

  const normalExplainResult = await db.query<{ "QUERY PLAN": Explain[] }>(
    `explain (analyze, buffers, format json) ${query(targetDate)}`,
  );
  const normalExplain = normalExplainResult.rows[0]?.["QUERY PLAN"][0];
  if (!normalExplain) throw new Error("normal planner explain output was empty");
  const normalMetrics = assertBoundedIndexedPlan("normal populated target day", normalExplain);
  console.log(
    `[db:benchmark:planned-day-summary] normal planner selected ${indexName}: eligible_rows=${populatedRows.rowCount} cancelled_rows=0 execution=${normalExplain["Execution Time"]}ms shared_hit=${normalMetrics.sharedHitBlocks} shared_read=${normalMetrics.sharedReadBlocks}`,
  );

  const explain = async (name: string, date: string) => {
    const result = await db.query<{ "QUERY PLAN": Explain[] }>(
      `explain (analyze, buffers, format json) ${query(date)}`,
    );
    const value = result.rows[0]?.["QUERY PLAN"][0];
    if (!value) throw new Error(`${name} explain output was empty`);
    const metrics = assertBoundedIndexedPlan(name, value);
    console.log(
      `[db:benchmark:planned-day-summary] ${name}: execution=${value["Execution Time"]}ms shared_hit=${metrics.sharedHitBlocks} shared_read=${metrics.sharedReadBlocks} temp_read=${metrics.tempReadBlocks} temp_written=${metrics.tempWrittenBlocks}`,
    );
  };
  await explain("empty target day", "2026-07-28");
  console.log(
    "[db:benchmark:planned-day-summary] methodology: normal planner, 50,000 mixed historical/future rows plus 200 early cancelled and 50,000 eligible target-day rows; JSON EXPLAIN requires the covering partial index, no Sort/temp spill, zero post-index filtering, and at most the 1,001 max+1 rows.",
  );
});
