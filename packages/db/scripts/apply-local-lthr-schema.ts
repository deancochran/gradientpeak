#!/usr/bin/env tsx

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { Pool, type PoolClient } from "pg";
import { dbPackageRoot, defaultLocalDatabaseUrl, supabaseCliRoot } from "./_local-database-config";

const PROJECT_ID = "gradientpeak";
const DATABASE_PORT = "54322";
const DATABASE_CONTAINER = "supabase_db_gradientpeak";
const EVIDENCE_UNIQUE = "threshold_evidence_profile_category_activity_unique";
const LEGACY_EVIDENCE_UNIQUE = "UNIQUE (profile_id, activity_category, activity_id)";
const CURRENT_EVIDENCE_UNIQUE = "UNIQUE (profile_id, activity_category, metric, activity_id)";

export type ThresholdConstraint = {
  definition: string;
  name: string;
  schema: string;
  table: string;
  type: string;
};

export const KNOWN_LOCAL_THRESHOLD_CONSTRAINTS: readonly ThresholdConstraint[] = [
  {
    definition:
      "CHECK (metric = 'power'::threshold_metric AND activity_category = 'bike'::text AND effort_type = 'power'::effort_type AND source_series = 'power'::activity_effort_source_series OR metric = 'speed'::threshold_metric AND activity_category = 'run'::text AND effort_type = 'speed'::effort_type AND (source_series = ANY (ARRAY['grade_adjusted_speed'::activity_effort_source_series, 'raw_speed'::activity_effort_source_series])) OR metric = 'speed'::threshold_metric AND activity_category = 'swim'::text AND effort_type = 'speed'::effort_type AND source_series = 'swim_speed'::activity_effort_source_series)",
    name: "threshold_evaluation_efforts_metric_check",
    schema: "public",
    table: "threshold_evaluation_efforts",
    type: "c",
  },
  {
    definition:
      "CHECK (activity_category = 'bike'::text AND metric = 'power'::threshold_metric AND method = 'bike_power_30m'::text AND unit = 'watts'::text OR activity_category = 'run'::text AND metric = 'speed'::threshold_metric AND method = 'run_speed_30m'::text AND unit = 'meters_per_second'::text OR activity_category = 'swim'::text AND metric = 'speed'::threshold_metric AND method = 'swim_speed_15m'::text AND unit = 'meters_per_second'::text)",
    name: "threshold_evaluations_identity_check",
    schema: "public",
    table: "threshold_evaluations",
    type: "c",
  },
  {
    definition:
      "CHECK (activity_category = 'bike'::text AND metric = 'power'::threshold_metric AND unit = 'watts'::text AND method = 'bike_power_30m'::text AND source_series_metric = 'power'::text OR activity_category = 'run'::text AND metric = 'speed'::threshold_metric AND unit = 'meters_per_second'::text AND method = 'run_speed_30m'::text AND (source_series_metric = ANY (ARRAY['speed'::text, 'grade_adjusted_speed'::text])) OR activity_category = 'swim'::text AND metric = 'speed'::threshold_metric AND unit = 'meters_per_second'::text AND method = 'swim_speed_15m'::text AND source_series_metric = 'speed'::text)",
    name: "threshold_evidence_identity_check",
    schema: "public",
    table: "threshold_evidence",
    type: "c",
  },
  {
    definition:
      "CHECK (activity_category = 'bike'::text AND metric = 'power'::threshold_metric AND method = 'bike_power_30m'::text AND unit = 'watts'::text OR activity_category = 'run'::text AND metric = 'speed'::threshold_metric AND method = 'run_speed_30m'::text AND unit = 'meters_per_second'::text OR activity_category = 'swim'::text AND metric = 'speed'::threshold_metric AND method = 'swim_speed_15m'::text AND unit = 'meters_per_second'::text)",
    name: "thresholds_identity_check",
    schema: "public",
    table: "thresholds",
    type: "c",
  },
];

export type ActivityCountSnapshot = {
  profileActivityCounts: ReadonlyArray<readonly [string, string]>;
  totalActivities: string;
};

type LocalAuthority = { databaseUrl: string; port: string; projectId: string };
export type EvidenceUniqueState = "current" | "legacy" | "missing";
export type EvidenceUniqueOwner = "constraint" | "index";
export type EvidenceUniqueRepresentation = {
  definition: string;
  owner: EvidenceUniqueOwner;
};

function normalizeDefinition(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function constraintKey(constraint: Pick<ThresholdConstraint, "name" | "schema" | "table">) {
  return `${constraint.schema}.${constraint.table}.${constraint.name}`;
}

export function parseLthrLocalMode(args: string[]) {
  const normalizedArgs = args[0] === "--" ? args.slice(1) : args;
  const allowed = new Set(["--apply", "--dry-run", "--local"]);
  if (normalizedArgs.some((argument) => !allowed.has(argument))) {
    throw new Error("Local LTHR schema repair refused unsupported arguments.");
  }
  if (
    normalizedArgs.some((argument) => normalizedArgs.filter((item) => item === argument).length > 1)
  ) {
    throw new Error("Local LTHR schema repair refused duplicate flags.");
  }
  const apply = normalizedArgs.includes("--apply");
  if (apply && !normalizedArgs.includes("--local")) {
    throw new Error("Local LTHR schema repair requires --local --apply for writes.");
  }
  if (apply && normalizedArgs.includes("--dry-run")) {
    throw new Error("Local LTHR schema repair cannot combine --apply with --dry-run.");
  }
  return { apply } as const;
}

export function requireLocalAuthority(config: string, databaseUrl: string): LocalAuthority {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error("Refused malformed local database authority.");
  }
  const projectId = config.match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];
  const dbSection = config.match(/\[db\]([\s\S]*?)(?:\n\[|$)/)?.[1];
  const port = dbSection?.match(/^port\s*=\s*(\d+)/m)?.[1];
  if (
    projectId !== PROJECT_ID ||
    port !== DATABASE_PORT ||
    url.protocol !== "postgresql:" ||
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    url.port !== DATABASE_PORT ||
    url.pathname !== "/postgres"
  ) {
    throw new Error(
      "Refused database target outside the repository-managed local Supabase database.",
    );
  }
  return { databaseUrl: url.toString(), port, projectId };
}

type ContainerInspection = {
  Config?: { Labels?: Record<string, string> };
  Name?: string;
  NetworkSettings?: { Ports?: Record<string, Array<{ HostPort?: string }> | null> };
  State?: { Running?: boolean };
};

export function requireLocalContainerIdentity(inspection: ContainerInspection) {
  const bindings = inspection.NetworkSettings?.Ports?.["5432/tcp"] ?? [];
  const labels = inspection.Config?.Labels;
  if (
    inspection.Name !== `/${DATABASE_CONTAINER}` ||
    inspection.State?.Running !== true ||
    labels?.["com.supabase.cli.project"] !== PROJECT_ID ||
    labels["com.docker.compose.project"] !== PROJECT_ID ||
    bindings.length === 0 ||
    bindings.some(({ HostPort }) => HostPort !== DATABASE_PORT)
  ) {
    throw new Error("Local Supabase container identity did not match.");
  }
}

function attestLocalTarget() {
  const config = readFileSync(resolve(supabaseCliRoot, "config.toml"), "utf8");
  const authority = requireLocalAuthority(config, defaultLocalDatabaseUrl);
  const result = spawnSync("docker", ["inspect", DATABASE_CONTAINER], {
    cwd: dbPackageRoot,
    encoding: "utf8",
    stdio: "pipe",
  });
  if (result.status !== 0)
    throw new Error("Repository-managed local Supabase database is not running.");
  let inspections: ContainerInspection[];
  try {
    inspections = JSON.parse(result.stdout ?? "") as ContainerInspection[];
  } catch {
    throw new Error("Local Supabase container inspection returned invalid metadata.");
  }
  if (inspections.length !== 1 || !inspections[0]) {
    throw new Error("Local Supabase database container inspection was not unique.");
  }
  requireLocalContainerIdentity(inspections[0]);
  return authority;
}

export function requireKnownLocalThresholdConstraints(actual: ThresholdConstraint[]) {
  const expected = new Map(
    KNOWN_LOCAL_THRESHOLD_CONSTRAINTS.map((item) => [constraintKey(item), item]),
  );
  const seen = new Set<string>();
  for (const constraint of actual) {
    const key = constraintKey(constraint);
    const known = expected.get(key);
    if (
      !known ||
      seen.has(key) ||
      constraint.type !== known.type ||
      normalizeDefinition(constraint.definition) !== normalizeDefinition(known.definition)
    ) {
      throw new Error(`Refused unknown threshold constraint variant: ${key}.`);
    }
    seen.add(key);
  }
  return KNOWN_LOCAL_THRESHOLD_CONSTRAINTS.filter((constraint) =>
    seen.has(constraintKey(constraint)),
  );
}

export function requireEvidenceUniqueState(
  representations: Array<string | EvidenceUniqueRepresentation>,
): EvidenceUniqueState {
  if (representations.length === 0) return "missing";
  if (representations.length !== 1)
    throw new Error("Threshold evidence uniqueness was not unique.");
  const representation = representations[0];
  if (!representation) throw new Error("Threshold evidence uniqueness was not unique.");
  const definition = normalizeDefinition(
    typeof representation === "string" ? representation : representation.definition,
  );
  if (
    typeof representation !== "string" &&
    representation.owner !== "constraint" &&
    representation.owner !== "index"
  ) {
    throw new Error("Refused unknown threshold evidence uniqueness owner.");
  }
  if (definition === LEGACY_EVIDENCE_UNIQUE) return "legacy";
  if (definition === CURRENT_EVIDENCE_UNIQUE) return "current";
  throw new Error("Refused unknown threshold evidence uniqueness variant.");
}

export function createActivityCountSnapshot(
  totalActivities: string,
  profileRows: Array<{ activity_count: string; profile_id: string }>,
): ActivityCountSnapshot {
  if (!/^\d+$/.test(totalActivities)) throw new Error("Invalid total activity count snapshot.");
  const profileActivityCounts = profileRows.map(({ activity_count, profile_id }) => {
    if (!profile_id || !/^\d+$/.test(activity_count)) {
      throw new Error("Invalid per-profile activity count snapshot.");
    }
    return [profile_id, activity_count] as const;
  });
  const sorted = [...profileActivityCounts].sort(([left], [right]) => left.localeCompare(right));
  if (new Set(sorted.map(([profileId]) => profileId)).size !== sorted.length) {
    throw new Error("Duplicate profile in activity count snapshot.");
  }
  return { profileActivityCounts: sorted, totalActivities };
}

export function requireActivityCountsUnchanged(
  before: ActivityCountSnapshot,
  after: ActivityCountSnapshot,
) {
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    throw new Error("LTHR schema repair changed total or per-profile activity counts.");
  }
}

export function buildLthrSchemaPlan(input: {
  driftConstraints: ThresholdConstraint[];
  enumHasLthr: boolean;
  evidenceUnique: EvidenceUniqueState;
}) {
  const driftConstraints = requireKnownLocalThresholdConstraints(input.driftConstraints);
  return {
    addEnumValue: !input.enumHasLthr,
    dropDriftConstraints: driftConstraints,
    replaceEvidenceUnique: input.evidenceUnique !== "current",
  } as const;
}

export function buildEvidenceUniqueReplacementStatements(owner: EvidenceUniqueOwner | undefined) {
  const drop =
    owner === "constraint"
      ? `alter table public.threshold_evidence drop constraint "${EVIDENCE_UNIQUE}"`
      : owner === "index"
        ? `drop index public."${EVIDENCE_UNIQUE}"`
        : undefined;
  return [
    ...(drop ? [drop] : []),
    `alter table public.threshold_evidence add constraint "${EVIDENCE_UNIQUE}" unique (profile_id, activity_category, metric, activity_id)`,
  ];
}

async function snapshotActivityCounts(client: Pool | PoolClient) {
  const [total, profiles] = await Promise.all([
    client.query<{ activity_count: string }>(
      "select count(*)::text as activity_count from public.activities",
    ),
    client.query<{ activity_count: string; profile_id: string }>(`
      select profile.id::text as profile_id, count(activity.id)::text as activity_count
      from public.profiles profile
      left join public.activities activity on activity.profile_id = profile.id
      group by profile.id
      order by profile.id
    `),
  ]);
  const totalActivities = total.rows[0]?.activity_count;
  if (totalActivities === undefined) throw new Error("Unable to snapshot total activity count.");
  return createActivityCountSnapshot(totalActivities, profiles.rows);
}

async function inspectState(client: Pool | PoolClient) {
  const [enumResult, constraints, evidenceUnique] = await Promise.all([
    client.query<{ exists: boolean }>(`
      select exists (
        select 1 from pg_enum enum_value
        join pg_type enum_type on enum_type.oid = enum_value.enumtypid
        join pg_namespace namespace on namespace.oid = enum_type.typnamespace
        where namespace.nspname = 'public' and enum_type.typname = 'threshold_metric' and enum_value.enumlabel = 'lthr'
      )
    `),
    client.query<ThresholdConstraint>(
      `
      select namespace.nspname as schema, relation.relname as table, constraint_record.conname as name,
        constraint_record.contype as type, pg_get_constraintdef(constraint_record.oid, true) as definition
      from pg_constraint constraint_record
      join pg_class relation on relation.oid = constraint_record.conrelid
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      where constraint_record.conname = any($1::text[])
      order by namespace.nspname, relation.relname, constraint_record.conname
    `,
      [KNOWN_LOCAL_THRESHOLD_CONSTRAINTS.map(({ name }) => name)],
    ),
    client.query<EvidenceUniqueRepresentation>(
      `
      select 'constraint' as owner, pg_get_constraintdef(constraint_record.oid, true) as definition
      from pg_constraint constraint_record
      join pg_class relation on relation.oid = constraint_record.conrelid
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public' and relation.relname = 'threshold_evidence'
        and constraint_record.conname = $1
      union all
      select 'index' as owner,
        case
          when index_access_method.amname = 'btree' and index_record.indisunique
            and index_record.indisvalid and index_record.indislive
            and index_record.indnatts = index_record.indnkeyatts
            and index_record.indpred is null and index_record.indexprs is null
            then format('UNIQUE (%s)', columns.definition)
          else pg_get_indexdef(index_relation.oid, 0, true)
        end as definition
      from pg_class index_relation
      join pg_namespace index_namespace on index_namespace.oid = index_relation.relnamespace
      join pg_index index_record on index_record.indexrelid = index_relation.oid
      join pg_am index_access_method on index_access_method.oid = index_relation.relam
      join pg_class table_relation on table_relation.oid = index_record.indrelid
      join pg_namespace table_namespace on table_namespace.oid = table_relation.relnamespace
      left join lateral (
        select string_agg(attribute.attname, ', ' order by key.ordinality) as definition
        from unnest(index_record.indkey) with ordinality as key(attnum, ordinality)
        left join pg_attribute attribute on attribute.attrelid = table_relation.oid and attribute.attnum = key.attnum
      ) columns on true
      where index_namespace.nspname = 'public' and index_relation.relname = $1
        and table_namespace.nspname = 'public' and table_relation.relname = 'threshold_evidence'
        and not exists (
          select 1 from pg_constraint constraint_record
          where constraint_record.conindid = index_relation.oid
        )
    `,
      [EVIDENCE_UNIQUE],
    ),
  ]);
  return {
    driftConstraints: constraints.rows,
    enumHasLthr: enumResult.rows[0]?.exists === true,
    evidenceUnique: requireEvidenceUniqueState(evidenceUnique.rows),
    evidenceUniqueOwner: evidenceUnique.rows[0]?.owner,
  };
}

async function verifyFinalState(client: Pool | PoolClient, countsBefore: ActivityCountSnapshot) {
  const [state, countsAfter] = await Promise.all([
    inspectState(client),
    snapshotActivityCounts(client),
  ]);
  if (
    !state.enumHasLthr ||
    state.evidenceUnique !== "current" ||
    state.driftConstraints.length !== 0
  ) {
    throw new Error("Local LTHR schema repair did not reach the required final schema state.");
  }
  requireActivityCountsUnchanged(countsBefore, countsAfter);
  return countsAfter;
}

export async function applyLocalLthrSchema(args: string[]) {
  const mode = parseLthrLocalMode(args);
  const authority = attestLocalTarget();
  const pool = new Pool({ connectionString: authority.databaseUrl, max: 1 });
  try {
    if (!mode.apply) {
      const state = await inspectState(pool);
      const before = await snapshotActivityCounts(pool);
      const after = await snapshotActivityCounts(pool);
      requireActivityCountsUnchanged(before, after);
      const plan = buildLthrSchemaPlan(state);
      console.info(
        `[db:lthr:local:apply] dry-run project=${authority.projectId} db=loopback:${authority.port} enum-add=${Number(plan.addEnumValue)} evidence-replace=${Number(plan.replaceEvidenceUnique)} constraints-drop=${plan.dropDriftConstraints.length} activities=${before.totalActivities} profiles=${before.profileActivityCounts.length} counts=unchanged`,
      );
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("lock table public.activities, public.profiles in share mode");
      const before = await snapshotActivityCounts(client);
      const state = await inspectState(client);
      const plan = buildLthrSchemaPlan(state);
      if (plan.addEnumValue)
        await client.query("alter type public.threshold_metric add value if not exists 'lthr'");
      if (plan.replaceEvidenceUnique) {
        const statements = buildEvidenceUniqueReplacementStatements(
          state.evidenceUnique === "legacy" ? state.evidenceUniqueOwner : undefined,
        );
        for (const statement of statements) {
          await client.query(statement);
        }
      }
      for (const constraint of plan.dropDriftConstraints) {
        await client.query(
          `alter table "${constraint.schema}"."${constraint.table}" drop constraint "${constraint.name}"`,
        );
      }
      const after = await verifyFinalState(client, before);
      await client.query("commit");
      console.info(
        `[db:lthr:local:apply] applied project=${authority.projectId} enum-add=${Number(plan.addEnumValue)} evidence-replace=${Number(plan.replaceEvidenceUnique)} constraints-drop=${plan.dropDriftConstraints.length} activities=${after.totalActivities} profiles=${after.profileActivityCounts.length} counts=unchanged`,
      );
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  applyLocalLthrSchema(process.argv.slice(2)).catch((error) => {
    console.error(
      `[db:lthr:local:apply] ${error instanceof Error ? error.message : "Unknown failure."}`,
    );
    process.exitCode = 1;
  });
}
