import { randomUUID } from "node:crypto";
import { calculateCyclingNormalizedPower } from "@repo/core/calculations";
import { Pool } from "pg";
import { TEST_USERS } from "./utils/testData";

const PROFILE_METRIC_MARKER = "E2E Area 14";
const EFFORT_METHOD_PREFIX = "e2e_area14_";
const EFFORT_ACTIVITY_MARKER = "E2E Area 14 effort evidence";
const unavailableNormalizedPowerResult = calculateCyclingNormalizedPower({ samples: [] });

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
    `delete from public.activities
     where profile_id = $1::uuid and name like $2`,
    [profileId, `${EFFORT_ACTIVITY_MARKER}%`],
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
      const activityId = randomUUID();
      const segmentId = randomUUID();
      const recordedAt = new Date(Date.now() - (index + 1) * 86_400_000).toISOString();
      await pool.query(
        `insert into public.activities (
          id, profile_id, name, started_at, finished_at, elapsed_ms,
          active_ms, moving_ms, timing_coverage, parser_version,
          decoded_contract_version, materializer_version, segments_generated_at
        ) values (
          $1::uuid, $2::uuid, $3, $4::timestamptz, $4::timestamptz + interval '20 minutes',
          1200000, 1200000, 1200000, 'complete', 'e2e-metrics-v1',
          'e2e-metrics-v1', 'e2e-metrics-v1', $4::timestamptz + interval '20 minutes'
        )`,
        [activityId, profile.id, `${EFFORT_ACTIVITY_MARKER} bike ${index + 1}`, recordedAt],
      );
      await pool.query(
        `insert into public.activity_segments (
          id, activity_id, profile_id, ordinal, role, activity_category,
          start_offset_ms, end_offset_ms, summary, summary_version,
          timing_coverage, active_ms, moving_ms, segment_revision,
          parser_version, materializer_version
        ) values (
          $1::uuid, $2::uuid, $3::uuid, 0, 'activity', 'bike',
          0, 1200000, $4::jsonb, 1,
          'complete', 1200000, 1200000, 1,
          'e2e-metrics-v1', 'e2e-metrics-v1'
        )`,
        [
          segmentId,
          activityId,
          profile.id,
          JSON.stringify({
            version: 1,
            timing: { timingCoverage: "complete", activeMs: 1_200_000, movingMs: 1_200_000 },
            normalizedPowerResult: unavailableNormalizedPowerResult,
          }),
        ],
      );
      await pool.query(
        `insert into public.activity_efforts (
          id, created_at, profile_id, activity_id, segment_id, recorded_at, activity_category,
          effort_type, duration_seconds, start_offset, unit, value, source, method,
          calculation_version, quality_score, provenance
        ) values (
          $1::uuid, now(), $2::uuid, $3::uuid, $4::uuid, $5::timestamptz, 'bike',
          'power', 1200, 0, 'watts', $6, $7::evidence_observation_source, $8,
          'e2e_v1', 0.9, $9::jsonb
        )`,
        [
          effort.id,
          profile.id,
          activityId,
          segmentId,
          recordedAt,
          effort.value,
          effort.source,
          effort.method,
          JSON.stringify(effort.provenance),
        ],
      );
    }
    if (preferredUnits === "imperial") {
      const activityId = randomUUID();
      const segmentId = randomUUID();
      const recordedAt = new Date(Date.now() - 86_400_000).toISOString();
      await pool.query(
        `insert into public.activities (
          id, profile_id, name, started_at, finished_at, elapsed_ms,
          active_ms, moving_ms, timing_coverage, parser_version,
          decoded_contract_version, materializer_version, segments_generated_at
        ) values (
          $1::uuid, $2::uuid, $3, $4::timestamptz, $4::timestamptz + interval '5 minutes',
          300000, 300000, 300000, 'complete', 'e2e-metrics-v1',
          'e2e-metrics-v1', 'e2e-metrics-v1', $4::timestamptz + interval '5 minutes'
        )`,
        [activityId, profile.id, `${EFFORT_ACTIVITY_MARKER} run`, recordedAt],
      );
      await pool.query(
        `insert into public.activity_segments (
          id, activity_id, profile_id, ordinal, role, activity_category,
          start_offset_ms, end_offset_ms, summary, summary_version,
          timing_coverage, active_ms, moving_ms, segment_revision,
          parser_version, materializer_version
        ) values (
          $1::uuid, $2::uuid, $3::uuid, 0, 'activity', 'run',
          0, 300000, $4::jsonb, 1,
          'complete', 300000, 300000, 1,
          'e2e-metrics-v1', 'e2e-metrics-v1'
        )`,
        [
          segmentId,
          activityId,
          profile.id,
          JSON.stringify({
            version: 1,
            timing: { timingCoverage: "complete", activeMs: 300_000, movingMs: 300_000 },
            normalizedPowerResult: unavailableNormalizedPowerResult,
          }),
        ],
      );
      await pool.query(
        `insert into public.activity_efforts (
          id, created_at, profile_id, activity_id, segment_id, recorded_at, activity_category,
          effort_type, duration_seconds, start_offset, unit, value, source, method,
          calculation_version, quality_score, provenance
        ) values (
          $1::uuid, now(), $2::uuid, $3::uuid, $4::uuid, $5::timestamptz, 'run',
          'speed', 300, 0, 'meters_per_second', 4, 'provider', $6,
          'e2e_v1', 0.9, $7::jsonb
        )`,
        [
          randomUUID(),
          profile.id,
          activityId,
          segmentId,
          recordedAt,
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
