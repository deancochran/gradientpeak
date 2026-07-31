import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { TEST_USERS } from "./utils/testData";

const PROFILE_METRIC_MARKER = "E2E Area 14";
const EFFORT_METHOD_PREFIX = "e2e_area14_";

function localDatabaseUrl() {
  const value =
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL ??
    // biome-ignore lint/security/noSecrets: Supabase's documented local-only database URL.
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  const url = new URL(value);
  if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
    throw new Error("Metrics/efforts/trends E2E fixtures only support the local database.");
  }
  return value;
}

async function deleteFixtureRows(pool: Pool, profileId: string) {
  await pool.query(
    `delete from public.activity_efforts
     where profile_id = $1::uuid and method like $2`,
    [profileId, `${EFFORT_METHOD_PREFIX}%`],
  );
  await pool.query(
    `delete from public.profile_metrics
     where profile_id = $1::uuid and notes like $2`,
    [profileId, `${PROFILE_METRIC_MARKER}%`],
  );
}

export async function seedMetricsEffortsTrendsFixture({
  preferredUnits = "metric",
}: {
  preferredUnits?: "imperial" | "metric";
} = {}) {
  const pool = new Pool({ connectionString: localDatabaseUrl(), max: 1 });
  try {
    const profileResult = await pool.query<{ id: string; preferred_units: string | null }>(
      `select p.id, p.preferred_units
       from public.profiles p
       inner join public.users u on u.id = p.id
       where lower(u.email) = lower($1)
       limit 1`,
      [TEST_USERS.athlete.email],
    );
    const profile = profileResult.rows[0];
    if (!profile) throw new Error("The local athlete fixture was not provisioned.");

    await pool.query("begin");
    await deleteFixtureRows(pool, profile.id);
    await pool.query(
      `update public.profiles set preferred_units = $2, updated_at = now()
       where id = $1::uuid`,
      [profile.id, preferredUnits],
    );
    await pool.query(
      `insert into public.profile_metrics (
        id, created_at, updated_at, profile_id, metric_type, recorded_at,
        unit, notes, value, source, method, calculation_version, quality_score, provenance
      ) values (
        $1::uuid, now(), now(), $2::uuid, 'weight_kg', now() - interval '2 days',
        'kg', $3, 70, 'provider', 'e2e_area14_provider_weight', 'e2e_v1', 0.95,
        $4::jsonb
      )`,
      [
        randomUUID(),
        profile.id,
        `${PROFILE_METRIC_MARKER} provider weight`,
        JSON.stringify({ observation_type: "observed", trusted: true, provider: "e2e" }),
      ],
    );

    const effortRows = [
      {
        id: randomUUID(),
        method: `${EFFORT_METHOD_PREFIX}observed`,
        provenance: { observation_type: "observed", trusted: true },
        source: "provider",
        value: 310,
      },
      {
        id: randomUUID(),
        method: `${EFFORT_METHOD_PREFIX}modeled`,
        provenance: { observation_type: "modeled" },
        source: "derived",
        value: 300,
      },
      {
        id: randomUUID(),
        method: `${EFFORT_METHOD_PREFIX}review`,
        provenance: {},
        source: "manual",
        value: 290,
      },
    ];
    for (const [index, effort] of effortRows.entries()) {
      await pool.query(
        `insert into public.activity_efforts (
          id, created_at, updated_at, profile_id, recorded_at, activity_category,
          effort_type, duration_seconds, unit, value, source, method,
          calculation_version, quality_score, provenance
        ) values (
          $1::uuid, now(), now(), $2::uuid, now() - ($3::int * interval '1 day'), 'bike',
          'power', 1200, 'watts', $4, $5::evidence_observation_source, $6,
          'e2e_v1', 0.9, $7::jsonb
        )`,
        [
          effort.id,
          profile.id,
          index + 1,
          effort.value,
          effort.source,
          effort.method,
          JSON.stringify(effort.provenance),
        ],
      );
    }
    if (preferredUnits === "imperial") {
      await pool.query(
        `insert into public.activity_efforts (
          id, created_at, updated_at, profile_id, recorded_at, activity_category,
          effort_type, duration_seconds, unit, value, source, method,
          calculation_version, quality_score, provenance
        ) values (
          $1::uuid, now(), now(), $2::uuid, now() - interval '1 day', 'run',
          'speed', 300, 'meters_per_second', 4, 'provider', $3,
          'e2e_v1', 0.9, $4::jsonb
        )`,
        [
          randomUUID(),
          profile.id,
          `${EFFORT_METHOD_PREFIX}imperial_run_speed`,
          JSON.stringify({ observation_type: "observed", trusted: true }),
        ],
      );
    }
    await pool.query("commit");

    return {
      getLatestManualWeightValue: async () => {
        const result = await pool.query<{ value: string }>(
          `select value::text as value
           from public.profile_metrics
           where profile_id = $1::uuid
             and metric_type = 'weight_kg'
             and source = 'manual'
             and notes like $2
           order by created_at desc, id desc
           limit 1`,
          [profile.id, `${PROFILE_METRIC_MARKER}%`],
        );
        const value = result.rows[0]?.value;
        return value == null ? null : Number(value);
      },
      cleanup: async () => {
        try {
          await pool.query("begin");
          await deleteFixtureRows(pool, profile.id);
          await pool.query(
            `update public.profiles set preferred_units = $2, updated_at = now()
             where id = $1::uuid`,
            [profile.id, profile.preferred_units],
          );
          await pool.query("commit");
        } catch (error) {
          await pool.query("rollback").catch(() => undefined);
          throw error;
        } finally {
          await pool.end();
        }
      },
    };
  } catch (error) {
    await pool.query("rollback").catch(() => undefined);
    await pool.end();
    throw error;
  }
}
