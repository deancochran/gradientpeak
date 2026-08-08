#!/usr/bin/env tsx

import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import {
  applySqlFile,
  bootstrapSupabaseSchemas,
  withDisposableDatabase,
} from "./_disposable-target";
import { dbPackageRoot, runSupabaseCli } from "./_helpers";
import { requireFreshBaseline } from "./baseline-workflow";

const canonicalCategories = ["bike", "other", "run", "strength", "swim"] as const;

async function assertCanonicalActivityCategories(target: {
  query: <Row extends Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ) => Promise<{ rows: Row[] }>;
}) {
  const categories = await target.query<{ code: string }>(
    "select code from public.canonical_activity_categories order by code",
  );
  if (
    JSON.stringify(categories.rows.map(({ code }) => code)) !== JSON.stringify(canonicalCategories)
  ) {
    throw new Error("fresh baseline is missing the exact canonical activity-category rows");
  }
  await target.query(`
    insert into auth.users (id, email, raw_user_meta_data)
    values ('11111111-1111-4111-8111-111111111111', 'canonical-category@example.test', '{}'::jsonb);
    insert into public.profiles (id) values ('11111111-1111-4111-8111-111111111111') on conflict do nothing;
    insert into public.activities (
      id, profile_id, name, started_at, finished_at, elapsed_ms, active_ms, moving_ms,
      timing_coverage, parser_version, decoded_contract_version, materializer_version
    ) values (
      '22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111',
      'canonical category fixture', now(), now() + interval '1 second', 1000, 1000, 1000,
      'complete', 'fixture', 'fixture', 'fixture'
    );
    insert into public.activity_segments (
      id, activity_id, profile_id, ordinal, role, activity_category, start_offset_ms, end_offset_ms,
      summary, timing_coverage, active_ms, moving_ms, parser_version, materializer_version
    ) values (
      '33333333-3333-4333-8333-333333333333', '22222222-2222-4222-8222-222222222222',
      '11111111-1111-4111-8111-111111111111', 0, 'activity', 'run', 0, 1000,
      '{"version":"1","timing":{"timingCoverage":"complete","activeMs":1000,"movingMs":1000}}'::jsonb,
      'complete', 1000, 1000, 'fixture', 'fixture'
    );
  `);
}

async function expectConstraintViolation(
  target: {
    query: <Row extends Record<string, unknown>>(
      text: string,
      values?: unknown[],
    ) => Promise<{ rows: Row[] }>;
  },
  statement: string,
  expected: { code: "23503" | "23505" | "23514"; constraint: string },
) {
  try {
    await target.query(statement);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : null;
    const constraint =
      error && typeof error === "object" && "constraint" in error ? error.constraint : null;
    if (code === expected.code && constraint === expected.constraint) return;
    throw error;
  }
  throw new Error(`expected ${expected.constraint} to reject the activity identity fixture`);
}

async function assertActivitySourceIdentityContract(target: {
  query: <Row extends Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ) => Promise<{ rows: Row[] }>;
}) {
  const legacyColumns = await target.query<{ column_name: string }>(`
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'activities'
      and column_name in ('provider', 'external_id')
  `);
  if (legacyColumns.rows.length !== 0) {
    throw new Error("canonical activities retain legacy provider identity columns");
  }
  const resourceKinds = await target.query<{ enumlabel: string }>(`
    select enum_value.enumlabel
    from pg_catalog.pg_type enum_type
    join pg_catalog.pg_namespace namespace on namespace.oid = enum_type.typnamespace
    join pg_catalog.pg_enum enum_value on enum_value.enumtypid = enum_type.oid
    where namespace.nspname = 'public'
      and enum_type.typname = 'integration_resource_kind'
    order by enum_value.enumsortorder
  `);
  if (!resourceKinds.rows.some(({ enumlabel }) => enumlabel === "activity")) {
    throw new Error("integration_resource_kind must retain the neutral activity enum value");
  }

  await target.query(`
    insert into auth.users (id, email, raw_user_meta_data)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'source-owner-2@example.test', '{}'::jsonb);
    insert into public.profiles (id)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') on conflict do nothing;
    insert into public.integrations (id, profile_id, provider, external_id)
    values
      ('77777777-7777-4777-8777-777777777771', '11111111-1111-4111-8111-111111111111', 'wahoo', 'source-owner-1'),
      ('77777777-7777-4777-8777-777777777772', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'wahoo', 'source-owner-2');
    insert into public.activities (
      id, profile_id, name, started_at, finished_at, elapsed_ms, active_ms, moving_ms,
      timing_coverage, parser_version, decoded_contract_version, materializer_version
    ) values (
      '77777777-7777-4777-8777-777777777773', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'source owner fixture', now(), now() + interval '1 second', 1000, 1000, 1000,
      'complete', 'fixture', 'fixture', 'fixture'
    );
    insert into public.activity_segments (
      id, activity_id, profile_id, ordinal, role, activity_category, start_offset_ms, end_offset_ms,
      summary, timing_coverage, active_ms, moving_ms, parser_version, materializer_version
    ) values (
      '77777777-7777-4777-8777-777777777770', '77777777-7777-4777-8777-777777777773',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 0, 'activity', 'bike', 0, 1000,
      '{"version":"1","timing":{"timingCoverage":"complete","activeMs":1000,"movingMs":1000}}'::jsonb,
      'complete', 1000, 1000, 'fixture', 'fixture'
    );
    insert into public.activity_source_references (
      id, profile_id, activity_id, integration_id, provider, provider_external_id
    ) values
      (
        '77777777-7777-4777-8777-777777777774',
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
        '77777777-7777-4777-8777-777777777771', 'wahoo', 'shared-provider-id'
      ),
      (
        '77777777-7777-4777-8777-777777777775',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        '77777777-7777-4777-8777-777777777773',
        '77777777-7777-4777-8777-777777777772', 'wahoo', 'shared-provider-id'
      );
  `);
  await expectConstraintViolation(
    target,
    `insert into public.activity_source_references (
      id, profile_id, activity_id, integration_id, provider, provider_external_id
    ) values (
      '77777777-7777-4777-8777-777777777776',
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '77777777-7777-4777-8777-777777777771', 'wahoo', 'shared-provider-id'
    )`,
    { code: "23505", constraint: "activity_source_references_provider_unique" },
  );
  await expectConstraintViolation(
    target,
    `insert into public.activity_source_references (
      id, profile_id, activity_id, integration_id, provider, provider_external_id
    ) values (
      '77777777-7777-4777-8777-777777777777',
      '11111111-1111-4111-8111-111111111111',
      '77777777-7777-4777-8777-777777777773',
      '77777777-7777-4777-8777-777777777771', 'wahoo', 'cross-profile-activity'
    )`,
    { code: "23503", constraint: "activity_source_references_activity_profile_fkey" },
  );
  await expectConstraintViolation(
    target,
    `insert into public.activity_source_references (
      id, profile_id, activity_id, integration_id, provider, provider_external_id
    ) values (
      '77777777-7777-4777-8777-777777777778',
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '77777777-7777-4777-8777-777777777772', 'wahoo', 'cross-profile-integration'
    )`,
    { code: "23503", constraint: "activity_source_references_integration_profile_fkey" },
  );
  await expectConstraintViolation(
    target,
    `insert into public.integration_resource_links (
      id, profile_id, integration_id, provider, resource_kind, internal_resource_id, external_id
    ) values (
      '77777777-7777-4777-8777-777777777779',
      '11111111-1111-4111-8111-111111111111',
      '77777777-7777-4777-8777-777777777771', 'wahoo', 'activity',
      '22222222-2222-4222-8222-222222222222', 'forbidden-activity-link'
    )`,
    { code: "23514", constraint: "integration_resource_links_no_activity_check" },
  );
  console.log(
    "[db:activity-source-identity] sole identity, profile ownership, scoped uniqueness, and link fence passed",
  );
}

async function assertStrictlyPositiveActivityEfforts(target: {
  query: <Row extends Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ) => Promise<{ rows: Row[] }>;
}) {
  try {
    await target.query(`
      insert into public.activity_efforts (
        id, created_at, profile_id, activity_id, segment_id, recorded_at, activity_category,
        effort_type, duration_seconds, start_offset, unit, value, source, method,
        calculation_version, provenance
      ) values (
        '44444444-4444-4444-8444-444444444440', now(),
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        '77777777-7777-4777-8777-777777777773',
        '77777777-7777-4777-8777-777777777770', now(), 'bike',
        'power', 1, 0, 'watts', 0, 'test', 'fresh_target_constraint',
        'test-v1', '{"observation_id":"44444444-4444-4444-8444-444444444440"}'::jsonb
      )
    `);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : null;
    const constraint =
      error && typeof error === "object" && "constraint" in error ? error.constraint : null;
    if (code === "23514" && constraint === "activity_efforts_value_finite_positive_check") {
      console.log("[db:activity-efforts] zero values are rejected");
      return;
    }
    throw error;
  }
  throw new Error("activity_efforts accepted a zero value");
}

type ProfileGoalConstraintInput = {
  activityCategory: string | null;
  priority: number;
  targetDate: string | null;
  targetPayload: unknown;
  title: string;
};

function profileGoalConstraintId(index: number) {
  return `f0000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
}

async function insertProfileGoalConstraintFixture(
  target: {
    query: <Row extends Record<string, unknown>>(
      text: string,
      values?: unknown[],
    ) => Promise<{ rows: Row[] }>;
  },
  index: number,
  input: ProfileGoalConstraintInput,
) {
  await target.query(
    `insert into public.profile_goals (
      id, profile_id, title, priority, activity_category, target_date,
      target_payload, created_at, updated_at
    ) values ($1::uuid, '11111111-1111-4111-8111-111111111111', $2, $3, $4, $5::date, $6::jsonb, now(), now())`,
    [
      profileGoalConstraintId(index),
      input.title,
      input.priority,
      input.activityCategory,
      input.targetDate,
      input.targetPayload == null ? null : JSON.stringify(input.targetPayload),
    ],
  );
}

async function assertProfileGoalConstraints(target: {
  query: <Row extends Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ) => Promise<{ rows: Row[] }>;
}) {
  const base = {
    activityCategory: "run",
    priority: 5,
    targetDate: "2026-10-01",
    title: "Constraint fixture",
  } satisfies Omit<ProfileGoalConstraintInput, "targetPayload">;
  const validPayloads: Array<{ activityCategory: string; targetPayload: unknown }> = [
    {
      activityCategory: "run",
      targetPayload: {
        type: "event_performance",
        activity_category: "run",
        distance_m: 5000,
        target_time_s: 1500,
      },
    },
    {
      activityCategory: "bike",
      targetPayload: { type: "threshold", metric: "power", value: 300 },
    },
    {
      activityCategory: "swim",
      targetPayload: { type: "completion", distance_m: 1500 },
    },
    {
      activityCategory: "strength",
      targetPayload: { type: "consistency", target_weeks: 8 },
    },
  ];
  for (const [index, valid] of validPayloads.entries()) {
    await insertProfileGoalConstraintFixture(target, index + 1, { ...base, ...valid });
  }

  const invalidInputs: ProfileGoalConstraintInput[] = [
    { ...base, activityCategory: null, targetPayload: { type: "consistency", target_weeks: 8 } },
    { ...base, targetDate: null, targetPayload: { type: "consistency", target_weeks: 8 } },
    { ...base, targetPayload: null },
    { ...base, title: " ", targetPayload: { type: "consistency", target_weeks: 8 } },
    { ...base, title: "x".repeat(101), targetPayload: { type: "consistency", target_weeks: 8 } },
    { ...base, priority: 11, targetPayload: { type: "consistency", target_weeks: 8 } },
    {
      ...base,
      activityCategory: "rowing",
      targetPayload: { type: "consistency", target_weeks: 8 },
    },
    { ...base, targetPayload: [] },
    { ...base, targetPayload: { type: "unknown" } },
    {
      ...base,
      targetPayload: { type: "event_performance", activity_category: "run" },
    },
    {
      ...base,
      targetPayload: {
        type: "event_performance",
        activity_category: "run",
        distance_m: 5000,
        target_time_s: 1500.5,
      },
    },
    {
      ...base,
      targetPayload: {
        type: "event_performance",
        activity_category: "run",
        distance_m: 5000,
        target_time_s: 1500,
        tolerance_pct: 1.1,
      },
    },
    {
      ...base,
      targetPayload: {
        type: "event_performance",
        activity_category: "run",
        distance_m: 5000,
        target_time_s: 1500,
        unexpected: true,
      },
    },
    { ...base, targetPayload: { type: "threshold", value: 300 } },
    { ...base, targetPayload: { type: "threshold", metric: "power", value: 0 } },
    {
      ...base,
      targetPayload: { type: "threshold", metric: "power", value: 300, test_duration_s: 1.5 },
    },
    { ...base, targetPayload: { type: "completion" } },
    { ...base, targetPayload: { type: "completion", duration_s: 0 } },
    { ...base, targetPayload: { type: "consistency" } },
    { ...base, targetPayload: { type: "consistency", target_sessions_per_week: 1.5 } },
    {
      ...base,
      targetPayload: {
        type: "event_performance",
        activity_category: "bike",
        distance_m: 5000,
        target_time_s: 1500,
      },
    },
  ];
  for (const [index, invalid] of invalidInputs.entries()) {
    try {
      await insertProfileGoalConstraintFixture(target, index + 100, invalid);
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : null;
      if (code === "23502" || code === "23514") continue;
      throw error;
    }
    throw new Error(`profile_goals accepted invalid constraint fixture ${index + 1}`);
  }

  await target.query(`delete from public.profile_goals where id = any($1::uuid[])`, [
    validPayloads.map((_, index) => profileGoalConstraintId(index + 1)),
  ]);
  console.log("[db:profile-goals] canonical payload and column constraints passed");
}

async function assertArtifactLifecycleFunctionPrivileges(target: {
  query: <Row extends Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ) => Promise<{ rows: Row[] }>;
}) {
  const privileges = await target.query<{
    function_identity: string;
    service_role_execute: boolean;
    anon_execute: boolean;
    authenticated_execute: boolean;
  }>(`
    select
      function_identity,
      pg_catalog.has_function_privilege('service_role', function_identity, 'EXECUTE') as service_role_execute,
      pg_catalog.has_function_privilege('anon', function_identity, 'EXECUTE') as anon_execute,
      pg_catalog.has_function_privilege('authenticated', function_identity, 'EXECUTE') as authenticated_execute
    from (values
      ('public.request_activity_artifact_deletion(uuid)'),
      ('public.finalize_activity_artifact_deletion(uuid,boolean)'),
      ('public.purge_deleted_activity_artifact(uuid)'),
      ('public.switch_activity_source_artifact(uuid,uuid,uuid,text)')
    ) as lifecycle_functions(function_identity)
  `);
  for (const privilege of privileges.rows) {
    if (
      !privilege.service_role_execute ||
      privilege.anon_execute ||
      privilege.authenticated_execute
    ) {
      throw new Error(
        `invalid lifecycle function privileges for ${privilege.function_identity}: service_role=${privilege.service_role_execute}, anon=${privilege.anon_execute}, authenticated=${privilege.authenticated_execute}`,
      );
    }
  }

  await target.query(`
    insert into public.activity_artifacts (
      id, profile_id, digest, byte_size, bucket, path, media_type, format,
      availability, deletion_requested_at, deleted_at
    ) values
      (
        '44444444-4444-4444-8444-444444444444',
        '11111111-1111-4111-8111-111111111111', repeat('a', 64), 1, 'activity-files',
        public.activity_artifact_content_path(
          '11111111-1111-4111-8111-111111111111', repeat('a', 64)
        ), 'application/octet-stream', 'fit', 'accepted', null, null
      ),
      (
        '55555555-5555-4555-8555-555555555555',
        '11111111-1111-4111-8111-111111111111', repeat('b', 64), 1, 'activity-files',
        public.activity_artifact_content_path(
          '11111111-1111-4111-8111-111111111111', repeat('b', 64)
        ), 'application/octet-stream', 'fit', 'deletion_pending', now(), null
      ),
      (
        '66666666-6666-4666-8666-666666666666',
        '11111111-1111-4111-8111-111111111111', repeat('c', 64), 1, 'activity-files',
        public.activity_artifact_content_path(
          '11111111-1111-4111-8111-111111111111', repeat('c', 64)
        ), 'application/octet-stream', 'fit', 'deleted', now(), now()
      );

    begin;
    set local role service_role;
    do $verify_artifact_lifecycle$
    begin
      perform set_config('gradientpeak.artifact_lifecycle_authorized', 'on', true);
      begin
        update public.activity_artifacts
        set availability = 'deletion_pending', deletion_requested_at = now()
        where id = '44444444-4444-4444-8444-444444444444';
        raise exception 'service_role bypassed the lifecycle function';
      exception when others then
        if sqlerrm = 'service_role bypassed the lifecycle function' then raise; end if;
        if sqlerrm <> 'activity artifact lifecycle requires authorized service workflow' then
          raise;
        end if;
      end;

      perform set_config('gradientpeak.artifact_hard_delete_authorized', 'on', true);
      begin
        delete from public.activity_artifacts
        where id = '66666666-6666-4666-8666-666666666666';
        raise exception 'service_role bypassed the artifact purge function';
      exception when others then
        if sqlerrm = 'service_role bypassed the artifact purge function' then raise; end if;
        if sqlerrm <> 'activity artifact delete requires completed service lifecycle' then raise; end if;
      end;

      begin
        perform public.switch_activity_source_artifact(
          '22222222-2222-4222-8222-222222222222',
          '55555555-5555-4555-8555-555555555555',
          '11111111-1111-4111-8111-111111111111',
          null
        );
        raise exception 'deletion-pending artifact was attached as a current source';
      exception when others then
        if sqlerrm = 'deletion-pending artifact was attached as a current source' then raise; end if;
        if sqlerrm <> 'accepted artifact/profile not found' then raise; end if;
      end;
    end
    $verify_artifact_lifecycle$;
    rollback;
  `);
}

async function assertRouteStorageLifecycle(target: {
  query: <Row extends Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ) => Promise<{ rows: Row[] }>;
}) {
  await target.query(`
    insert into public.activity_routes (
      id, profile_id, name, file_path, file_sha256, storage_state,
      total_distance, total_ascent, total_descent, polyline
    ) values
      (
        '77777777-7777-4777-8777-777777777777',
        '11111111-1111-4111-8111-111111111111', 'pending route',
        '11111111-1111-4111-8111-111111111111/pending.gpx', repeat('d', 64),
        'deletion_pending', 0, 0, 0, ''
      ),
      (
        '88888888-8888-4888-8888-888888888888',
        '11111111-1111-4111-8111-111111111111', 'ready route',
        '11111111-1111-4111-8111-111111111111/ready.gpx', repeat('e', 64),
        'ready', 0, 0, 0, ''
      );

    do $verify_route_storage$
    begin
      begin
        insert into public.events (
          id, profile_id, event_type, title, starts_at, scheduled_date, route_id
        ) values (
          '99999999-9999-4999-8999-999999999999',
          '11111111-1111-4111-8111-111111111111', 'custom', 'invalid pending route',
          now(), current_date::text, '77777777-7777-4777-8777-777777777777'
        );
        raise exception 'event accepted a route whose storage was not ready';
      exception when others then
        if sqlerrm = 'event accepted a route whose storage was not ready' then raise; end if;
        if sqlerrm <> 'event route must reference ready route storage' then raise; end if;
      end;

      insert into public.events (
        id, profile_id, event_type, title, starts_at, scheduled_date, route_id
      ) values (
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        '11111111-1111-4111-8111-111111111111', 'custom', 'valid ready route',
        now(), current_date::text, '88888888-8888-4888-8888-888888888888'
      );

      begin
        insert into public.likes (id, created_at, profile_id, entity_id, entity_type)
        values (
          'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', now(),
          '11111111-1111-4111-8111-111111111111',
          '77777777-7777-4777-8777-777777777777', 'route'
        );
        raise exception 'like accepted a route whose storage was not ready';
      exception when others then
        if sqlerrm = 'like accepted a route whose storage was not ready' then raise; end if;
        if sqlerrm <> 'route social content requires ready route storage' then raise; end if;
      end;

      begin
        insert into public.comments (
          id, profile_id, entity_type, entity_id, content, created_at, updated_at
        ) values (
          'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          '11111111-1111-4111-8111-111111111111', 'route',
          '77777777-7777-4777-8777-777777777777', 'invalid pending route', now(), now()
        );
        raise exception 'comment accepted a route whose storage was not ready';
      exception when others then
        if sqlerrm = 'comment accepted a route whose storage was not ready' then raise; end if;
        if sqlerrm <> 'route social content requires ready route storage' then raise; end if;
      end;

      insert into public.likes (id, created_at, profile_id, entity_id, entity_type)
      values (
        'dddddddd-dddd-4ddd-8ddd-dddddddddddd', now(),
        '11111111-1111-4111-8111-111111111111',
        '88888888-8888-4888-8888-888888888888', 'route'
      );
      insert into public.comments (
        id, profile_id, entity_type, entity_id, content, created_at, updated_at
      ) values (
        'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        '11111111-1111-4111-8111-111111111111', 'route',
        '88888888-8888-4888-8888-888888888888', 'valid ready route', now(), now()
      );
    end
    $verify_route_storage$;
  `);

  const triggers = await target.query<{ trigger_count: number }>(`
    select count(*)::int as trigger_count
    from pg_catalog.pg_trigger
    where not tgisinternal
      and tgname in (
        'events_require_ready_route',
        'group_events_require_ready_route',
        'likes_require_ready_route',
        'comments_require_ready_route'
      )
  `);
  if (triggers.rows[0]?.trigger_count !== 4) {
    throw new Error("ready-route storage guards are missing from route reference tables");
  }
}

async function assertProfileObservationsDoNotInvalidateAthleteState(target: {
  query: <Row extends Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ) => Promise<{ rows: Row[] }>;
}) {
  const triggers = await target.query<{ tgname: string }>(`
    select tgname
    from pg_catalog.pg_trigger
    where not tgisinternal
      and tgrelid in (
        'public.profile_metrics'::regclass,
        'public.swimming_css_protocol_evidence'::regclass
      )
      and tgname in (
        'profile_metrics_bump_athlete_state_source_revision',
        'swimming_css_bump_athlete_state_source_revision'
      )
  `);
  if (triggers.rows.length > 0) {
    throw new Error("profile observations must not invalidate athlete state");
  }
}

async function main() {
  const args = process.argv.slice(2);
  await withDisposableDatabase(args, "fresh_verify", async (target, targetUrl) => {
    await bootstrapSupabaseSchemas(target);
    const baseline = requireFreshBaseline();
    await applySqlFile(target, baseline.sourcePath);
    await assertCanonicalActivityCategories(target);
    await assertActivitySourceIdentityContract(target);
    await assertStrictlyPositiveActivityEfforts(target);
    await assertProfileGoalConstraints(target);
    await assertArtifactLifecycleFunctionPrivileges(target);
    await assertRouteStorageLifecycle(target);
    await assertProfileObservationsDoNotInvalidateAthleteState(target);

    const env = {
      ...process.env,
      DATABASE_URL: targetUrl,
      POSTGRES_URL: targetUrl,
      GRADIENTPEAK_FRESH_FINGERPRINT_WRITE: "1",
    };
    const fingerprintArgs = ["exec", "tsx", "scripts/check-schema-fingerprint.ts"];
    if (args.includes("--write-fingerprint")) fingerprintArgs.push("--write");
    execFileSync("pnpm", fingerprintArgs, { cwd: dbPackageRoot, env, stdio: "inherit" });
    execFileSync("pnpm", ["exec", "tsx", "scripts/check-schema-parity.ts"], {
      cwd: dbPackageRoot,
      env,
      stdio: "inherit",
    });
    execFileSync(
      "pnpm",
      [
        "exec",
        "tsx",
        "scripts/verify-public-table-security.ts",
        "--disposable",
        "--local",
        `--database-url=${targetUrl}`,
      ],
      {
        cwd: dbPackageRoot,
        env,
        stdio: "inherit",
      },
    );
    execFileSync("pnpm", ["exec", "tsx", "scripts/verify-storage-assets.ts"], {
      cwd: dbPackageRoot,
      env,
      stdio: "inherit",
    });
    runSupabaseCli(
      ["db", "lint", "--db-url", targetUrl, "--schema", "public", "--fail-on", "warning"],
      dbPackageRoot,
      "utf8",
    );
    if (args.includes("--diff")) {
      const diff = runSupabaseCli(
        ["db", "diff", "--db-url", targetUrl, "--schema", "public"],
        dbPackageRoot,
        "utf8",
      ).toString();
      if (diff.trim()) throw new Error(`fresh target schema diff is not empty:\n${diff}`);
      console.log("[db:diff] disposable authoritative target has no public schema diff");
    }
    console.log(
      "[db:fresh:verify] one policy-selected baseline, parity, fingerprint, storage, security, and lint passed in a disposable target",
    );
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[db:fresh:verify] ${error instanceof Error ? error.message : String(error)}`);
    if (error instanceof Error && error.cause) console.error(String(error.cause));
    process.exit(1);
  });
}
