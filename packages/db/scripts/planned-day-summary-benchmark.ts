import { activityPlanSemanticHash, activityPlanStructureSchema } from "@repo/core/activity-plan";
import { resolvePrescription } from "@repo/core/plan";
import {
  applySqlFile,
  bootstrapSupabaseSchemas,
  withDisposableDatabase,
} from "./_disposable-target";
import { requireFreshBaseline } from "./baseline-workflow";
import { structureHash } from "./canonical-json";

const ownerId = "00000000-0000-4000-8000-000000000001";
const otherId = "00000000-0000-4000-8000-000000000002";
const activityPlanId = "00000000-0000-4000-8000-000000000003";
const targetDate = "2026-07-27";
const indexName = "planned_sessions_profile_date_idx";
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
  const sessionNodes = nodes.filter((node) => node["Relation Name"] === "planned_sessions");
  const indexNode = nodes.find((node) => node["Index Name"] === indexName);
  if (!indexNode) throw new Error(`${name} did not use ${indexName}`);
  if (sessionNodes.some((node) => node["Node Type"] === "Seq Scan"))
    throw new Error(`${name} scanned planned-session history sequentially`);
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
  const prescription = activityPlanStructureSchema.parse({
    version: 5,
    activity_category: "run",
    items: [
      {
        type: "step",
        id: "10000000-0000-4000-8000-000000000003",
        name: "Steady",
        duration: { type: "time", seconds: 60 },
        targets: [{ type: "RPE", intensity: 4 }],
      },
    ],
  });
  const prescriptionHash = structureHash(prescription);
  const semanticHash = activityPlanSemanticHash({
    structure: prescription,
    trainingIntent: "general_maintenance",
  });
  await db.query(
    `insert into public.activity_plans
       (id, profile_id, name, training_intent, structure, structure_hash, semantic_hash)
     values ($1, $2, 'Benchmark plan', 'general_maintenance', $3::jsonb, $4, $5)`,
    [activityPlanId, ownerId, JSON.stringify(prescription), prescriptionHash, semanticHash],
  );
  const resolved = resolvePrescription({
    demand: {
      activity_category: "run",
      training_intent: "general_maintenance",
      target_duration_minutes: null,
      target_common_load: null,
      importance: "normal",
    },
    preferences: {
      weekly_session_count: null,
      target_weekly_duration_minutes: null,
      maximum_session_duration_minutes: null,
      preferred_weekdays: [],
      rest_days: [],
      progression_style: null,
      recovery_priority: null,
    },
    baseline: { status: "no_context", as_of: "2026-06-01T00:00:00.000Z" },
    candidates: [
      {
        id: activityPlanId,
        revision: 1,
        semantic_hash: semanticHash,
        activity_category: "run",
        training_intent: "general_maintenance",
        structure: prescription,
      },
    ],
  });
  if (resolved.status !== "resolved")
    throw new Error("Core benchmark resolver fixture did not resolve");
  const manifest = JSON.stringify(resolved.manifest);
  // 50,000 non-target rows span history/future dates, lifecycle states, and owners.
  await db.query(
    `insert into public.planned_sessions
       (id, profile_id, planning_date, original_target_date, source_kind, direct_operation_id,
        idempotency_key, activity_plan_id, activity_plan_revision, resolution_manifest,
        prescription_captured_at, status, cancellation_reason, cancelled_at)
       select ('30000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
          case when i % 5 = 0 then $2::uuid else $1::uuid end,
          case when i <= 25000 then date '2010-01-01' + i else date '2040-01-01' + (i - 25000) end,
          case when i <= 25000 then date '2010-01-01' + i else date '2040-01-01' + (i - 25000) end,
          'direct'::public.planned_session_source_kind, 'benchmark-history-' || lpad(i::text, 16, '0'),
           'direct:benchmark-history-' || lpad(i::text, 16, '0'), $3::uuid, 1, $4::jsonb, now(),
          case when i % 3 = 0 then 'cancelled' else 'scheduled' end::public.planned_session_status,
          case when i % 3 = 0 then 'user_requested'::public.planned_session_cancellation_reason else null end,
          case when i % 3 = 0 then now() else null end
       from generate_series(1, 50000) as i`,
    [ownerId, otherId, activityPlanId, manifest],
  );
  // Cancelled rows sort before the 1,001 eligible rows. They must not consume the cap.
  await db.query(
    `insert into public.planned_sessions
       (id, profile_id, planning_date, original_target_date, source_kind, direct_operation_id,
        idempotency_key, activity_plan_id, activity_plan_revision, resolution_manifest,
        prescription_captured_at, status, cancellation_reason, cancelled_at)
       select ('40000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, $1::uuid, $2::date, $2::date,
          'direct', 'benchmark-cancelled-' || lpad(i::text, 16, '0'),
           'direct:benchmark-cancelled-' || lpad(i::text, 16, '0'), $3::uuid, 1, $4::jsonb, now(),
          'cancelled', 'user_requested', now()
       from generate_series(1, 200) as i`,
    [ownerId, targetDate, activityPlanId, manifest],
  );
  await db.query(
    `insert into public.planned_sessions
       (id, profile_id, planning_date, original_target_date, source_kind, direct_operation_id,
        idempotency_key, activity_plan_id, activity_plan_revision, resolution_manifest,
        prescription_captured_at, status)
       select ('50000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, $1::uuid, $2::date, $2::date,
          'direct', 'benchmark-eligible-' || lpad(i::text, 16, '0'),
           'direct:benchmark-eligible-' || lpad(i::text, 16, '0'), $3::uuid, 1, $4::jsonb, now(), 'scheduled'
       from generate_series(1, 50000) as i`,
    [ownerId, targetDate, activityPlanId, manifest],
  );
  await db.query("analyze public.planned_sessions");

  const query = (
    date: string,
  ) => `select activity_plan_id, id, planning_date from public.planned_sessions
      where profile_id = '${ownerId}'::uuid
        and planning_date >= '${date}'::date
        and planning_date < '${date}'::date + 1
      order by planning_date asc, id asc
      limit ${summaryLimit}`;
  const populatedRows = await db.query<{ status: "scheduled" | "cancelled" }>(
    `select status from (${query(targetDate)}) bounded join public.planned_sessions using (id)`,
  );
  if (populatedRows.rowCount !== summaryLimit)
    throw new Error("eligible planned-day rows did not reach the max+1 cap");
  if (!populatedRows.rows.some((row) => row.status === "cancelled"))
    throw new Error("cancelled planned-day lifecycle rows were not included");
  if (!populatedRows.rows.some((row) => row.status === "scheduled"))
    throw new Error("scheduled planned-day rows were not included");

  const normalExplainResult = await db.query<{ "QUERY PLAN": Explain[] }>(
    `explain (analyze, buffers, format json) ${query(targetDate)}`,
  );
  const normalExplain = normalExplainResult.rows[0]?.["QUERY PLAN"][0];
  if (!normalExplain) throw new Error("normal planner explain output was empty");
  const normalMetrics = assertBoundedIndexedPlan("normal populated target day", normalExplain);
  console.log(
    `[db:benchmark:planned-day-summary] normal planner selected ${indexName}: bounded_rows=${populatedRows.rowCount} execution=${normalExplain["Execution Time"]}ms shared_hit=${normalMetrics.sharedHitBlocks} shared_read=${normalMetrics.sharedReadBlocks}`,
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
    "[db:benchmark:planned-day-summary] methodology: normal planner, 50,000 mixed historical/future planned sessions plus 200 cancelled and 50,000 scheduled target-day rows; JSON EXPLAIN requires the profile/date index, no Sort/temp spill, zero post-index filtering, and at most the 1,001 max+1 rows.",
  );
});
