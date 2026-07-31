#!/usr/bin/env tsx

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { athleteReadAccessDecisionSchema, athleteReadScopeSchema } from "@repo/core/organizations";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import {
  applySqlFile,
  bootstrapSupabaseSchemas,
  withDisposableDatabase,
} from "./_disposable-target";
import { dbPackageRoot } from "./_helpers";

const scopes = ["basic_profile", "training", "activities", "metrics", "goals", "calendar"] as const;
type Scope = (typeof scopes)[number];

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;

const profiles = {
  owner: id(1),
  coach: id(2),
  admin: id(3),
  athlete: id(4),
  secondAdmin: id(5),
  otherCoach: id(6),
  otherAthlete: id(7),
  outsider: id(8),
} as const;

type Queryable = {
  query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: Row[]; rowCount: number | null }>;
};

type AuthorityGraph = {
  org: string;
  ownerMembership: string;
  coachMembership: string;
  adminMembership: string;
  secondAdminMembership: string;
  otherCoachMembership: string;
  engagement: string;
  assignment: string;
  policies: Record<Scope, string>;
  consents: Record<Scope, string>;
};

const decisionSql = "select public.coaching_athlete_read_access_decision($1,$2,$3,$4) as decision";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function expectFailure(action: () => Promise<unknown>, label: string, expectedCode?: string) {
  try {
    await action();
  } catch (error) {
    if (expectedCode && (error as { code?: string }).code !== expectedCode) {
      throw new Error(
        `${label} failed with ${(error as { code?: string }).code ?? "no SQLSTATE"}, expected ${expectedCode}`,
      );
    }
    return;
  }
  throw new Error(`${label} unexpectedly succeeded`);
}

async function withRollback(client: PoolClient, label: string, operation: () => Promise<void>) {
  await client.query("begin");
  try {
    await operation();
  } catch (error) {
    throw new Error(`${label}: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await client.query("rollback").catch(() => undefined);
  }
}

async function assertDecision(
  db: Queryable,
  expected: string,
  graph: AuthorityGraph,
  input: {
    actor?: string;
    organization?: string;
    athlete?: string;
    scope?: string;
  } = {},
) {
  const result = await db.query<{ decision: string }>(decisionSql, [
    input.actor ?? profiles.coach,
    input.organization ?? graph.org,
    input.athlete ?? profiles.athlete,
    input.scope ?? "activities",
  ]);
  const scope = athleteReadScopeSchema.parse(input.scope ?? "activities");
  const actualDecision = result.rows[0]?.decision;
  athleteReadAccessDecisionSchema.parse(
    actualDecision === "allow"
      ? { outcome: "allow", scope }
      : { outcome: "deny", scope, reason: actualDecision },
  );
  assert(
    actualDecision === expected,
    `expected ${expected}, received ${actualDecision ?? "no decision"}`,
  );
}

async function seedProfiles(db: Queryable) {
  for (const [name, profileId] of Object.entries(profiles)) {
    await db.query(
      "insert into auth.users(id,email,raw_user_meta_data) values($1,$2,'{}'::jsonb)",
      [profileId, `${name}@example.test`],
    );
  }
}

function buildGraph(base: number): AuthorityGraph {
  const policies = {} as Record<Scope, string>;
  const consents = {} as Record<Scope, string>;
  for (const [index, scope] of scopes.entries()) {
    policies[scope] = id(base + 20 + index);
    consents[scope] = id(base + 30 + index);
  }
  return {
    org: id(base),
    ownerMembership: id(base + 1),
    coachMembership: id(base + 2),
    adminMembership: id(base + 3),
    secondAdminMembership: id(base + 4),
    otherCoachMembership: id(base + 5),
    engagement: id(base + 10),
    assignment: id(base + 11),
    policies,
    consents,
  };
}

async function seedAuthorityGraph(
  pool: Pool,
  base: number,
  options: { includeConsents?: boolean } = {},
) {
  const graph = buildGraph(base);
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      `insert into public.organizations(
        id, created_by_profile_id, root_owner_membership_id, name, slug, timezone
      ) values ($1,$2,$3,$4,$5,'UTC')`,
      [graph.org, profiles.owner, graph.ownerMembership, `Organization ${base}`, `org-${base}`],
    );
    await client.query(
      `insert into public.organization_memberships(id,organization_id,profile_id) values
        ($1,$6,$7),($2,$6,$8),($3,$6,$9),($4,$6,$10),($5,$6,$11)`,
      [
        graph.ownerMembership,
        graph.coachMembership,
        graph.adminMembership,
        graph.secondAdminMembership,
        graph.otherCoachMembership,
        graph.org,
        profiles.owner,
        profiles.coach,
        profiles.admin,
        profiles.secondAdmin,
        profiles.otherCoach,
      ],
    );
    await client.query(
      `insert into public.organization_membership_role_grants(
        organization_id,membership_id,role_key
      ) values
        ($1,$2,'admin'),($1,$3,'coach'),($1,$4,'admin'),($1,$5,'admin'),($1,$6,'coach')`,
      [
        graph.org,
        graph.ownerMembership,
        graph.coachMembership,
        graph.adminMembership,
        graph.secondAdminMembership,
        graph.otherCoachMembership,
      ],
    );
    await client.query(
      "insert into public.coaching_engagements(id,organization_id,athlete_profile_id) values($1,$2,$3)",
      [graph.engagement, graph.org, profiles.athlete],
    );
    await client.query(
      `insert into public.coaching_assignments(
        id,organization_id,engagement_id,coach_membership_id,assignment_kind
      ) values($1,$2,$3,$4,'primary')`,
      [graph.assignment, graph.org, graph.engagement, graph.coachMembership],
    );
    for (const scope of scopes) {
      await client.query(
        `insert into public.athlete_consent_policy_versions(
          id,scope_key,effective_from,jurisdiction,terms_text,content_digest
        ) values($1,$2,transaction_timestamp() - interval '1 day','US',$3,$4)`,
        [graph.policies[scope], scope, `${scope} terms`, `digest-${base}-${scope}`],
      );
      if (options.includeConsents !== false) {
        await client.query(
          `insert into public.athlete_data_sharing_consents(
            id,organization_id,engagement_id,athlete_profile_id,scope_key,
            policy_version_id,granted_by_profile_id
          ) values($1,$2,$3,$4,$5,$6,$4)`,
          [
            graph.consents[scope],
            graph.org,
            graph.engagement,
            profiles.athlete,
            scope,
            graph.policies[scope],
          ],
        );
      }
    }
    await client.query("commit");
    return graph;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function addOtherAthleteEngagement(
  client: PoolClient,
  graph: AuthorityGraph,
  base: number,
  consentScope?: Scope,
) {
  const engagementId = id(base);
  const assignmentId = id(base + 1);
  await client.query(
    "insert into public.coaching_engagements(id,organization_id,athlete_profile_id) values($1,$2,$3)",
    [engagementId, graph.org, profiles.otherAthlete],
  );
  await client.query(
    `insert into public.coaching_assignments(
      id,organization_id,engagement_id,coach_membership_id,assignment_kind
    ) values($1,$2,$3,$4,'primary')`,
    [assignmentId, graph.org, engagementId, graph.coachMembership],
  );
  if (consentScope) {
    await client.query(
      `insert into public.athlete_data_sharing_consents(
        id,organization_id,engagement_id,athlete_profile_id,scope_key,
        policy_version_id,granted_by_profile_id
      ) values($1,$2,$3,$4,$5,$6,$4)`,
      [
        id(base + 2),
        graph.org,
        engagementId,
        profiles.otherAthlete,
        consentScope,
        graph.policies[consentScope],
      ],
    );
  }
  return { engagementId, assignmentId };
}

async function proveDecisionMatrix(pool: Pool) {
  const graph = await seedAuthorityGraph(pool, 100);
  const noConsentGraph = await seedAuthorityGraph(pool, 200, { includeConsents: false });
  const secondOrganization = await seedAuthorityGraph(pool, 300);

  for (const scope of scopes) {
    await assertDecision(pool, "allow", graph, { scope });
  }
  await expectFailure(
    () => assertDecision(pool, "never", graph, { scope: "route_geometry" }),
    "invalid scope",
    "22023",
  );
  await assertDecision(pool, "organization_not_active", graph, { organization: id(999_001) });
  await assertDecision(pool, "membership_not_active", graph, { actor: profiles.outsider });
  await assertDecision(pool, "missing_coach_role", graph, { actor: profiles.owner });
  await assertDecision(pool, "missing_coach_role", graph, { actor: profiles.admin });
  await assertDecision(pool, "engagement_not_active", graph, { athlete: profiles.otherAthlete });
  await assertDecision(pool, "consent_missing", noConsentGraph);

  const client = await pool.connect();
  try {
    await withRollback(client, "cross-organization actor authority", async () => {
      await client.query(
        `update public.organization_membership_role_grants
         set revoked_at=transaction_timestamp()
         where organization_id=$1 and membership_id=$2 and role_key='coach' and revoked_at is null`,
        [secondOrganization.org, secondOrganization.coachMembership],
      );
      await assertDecision(client, "missing_coach_role", secondOrganization);
      await assertDecision(client, "allow", graph);
    });

    await withRollback(client, "suspended organization", async () => {
      await client.query(
        "update public.organizations set suspended_at=transaction_timestamp() where id=$1",
        [graph.org],
      );
      await assertDecision(client, "organization_not_active", graph);
    });
    await withRollback(client, "closed organization", async () => {
      await client.query(
        "update public.organizations set closed_at=transaction_timestamp() where id=$1",
        [graph.org],
      );
      await assertDecision(client, "organization_not_active", graph);
    });
    await withRollback(client, "suspended membership", async () => {
      await client.query(
        "update public.organization_memberships set suspended_at=transaction_timestamp() where id=$1",
        [graph.coachMembership],
      );
      await assertDecision(client, "membership_not_active", graph);
    });
    await withRollback(client, "ended membership", async () => {
      await client.query(
        "update public.organization_memberships set ended_at=transaction_timestamp() where id=$1",
        [graph.coachMembership],
      );
      await assertDecision(client, "membership_not_active", graph);
    });
    await withRollback(client, "revoked coach grant", async () => {
      await client.query(
        `update public.organization_membership_role_grants
         set revoked_at=transaction_timestamp()
         where organization_id=$1 and membership_id=$2 and role_key='coach' and revoked_at is null`,
        [graph.org, graph.coachMembership],
      );
      await assertDecision(client, "missing_coach_role", graph);
    });
    await withRollback(client, "future coach grant", async () => {
      await client.query(
        `update public.organization_membership_role_grants
         set revoked_at=transaction_timestamp()
         where organization_id=$1 and membership_id=$2 and role_key='coach' and revoked_at is null`,
        [graph.org, graph.coachMembership],
      );
      await client.query(
        `insert into public.organization_membership_role_grants(
          organization_id,membership_id,role_key,granted_at
        ) values($1,$2,'coach',transaction_timestamp() + interval '1 hour')`,
        [graph.org, graph.coachMembership],
      );
      await assertDecision(client, "missing_coach_role", graph);
    });
    await withRollback(client, "paused engagement", async () => {
      await client.query(
        "update public.coaching_engagements set paused_at=transaction_timestamp() where id=$1",
        [graph.engagement],
      );
      await assertDecision(client, "engagement_not_active", graph);
    });
    await withRollback(client, "ended engagement", async () => {
      await client.query(
        "update public.coaching_engagements set ended_at=transaction_timestamp() where id=$1",
        [graph.engagement],
      );
      await assertDecision(client, "engagement_not_active", graph);
    });
    await withRollback(client, "future engagement", async () => {
      await client.query(
        "update public.coaching_engagements set ended_at=transaction_timestamp() where id=$1",
        [graph.engagement],
      );
      await client.query(
        `insert into public.coaching_engagements(
          id,organization_id,athlete_profile_id,created_at,updated_at
        ) values(
          $1,$2,$3,
          transaction_timestamp() + interval '1 hour',
          transaction_timestamp() + interval '1 hour'
        )`,
        [id(399), graph.org, profiles.athlete],
      );
      await assertDecision(client, "engagement_not_active", graph);
    });
    await withRollback(client, "assignment to another coach", async () => {
      await client.query(
        "update public.coaching_assignments set ended_at=transaction_timestamp() where id=$1",
        [graph.assignment],
      );
      await client.query(
        `insert into public.coaching_assignments(
          id,organization_id,engagement_id,coach_membership_id,assignment_kind
        ) values($1,$2,$3,$4,'primary')`,
        [id(400), graph.org, graph.engagement, graph.otherCoachMembership],
      );
      await assertDecision(client, "assignment_missing", graph);
    });
    await withRollback(client, "ended assignment", async () => {
      await client.query(
        "update public.coaching_assignments set ended_at=transaction_timestamp() where id=$1",
        [graph.assignment],
      );
      await assertDecision(client, "assignment_missing", graph);
    });
    await withRollback(client, "future assignment", async () => {
      await client.query(
        "update public.coaching_assignments set ended_at=transaction_timestamp() where id=$1",
        [graph.assignment],
      );
      await expectFailure(
        () =>
          client.query(
            `insert into public.coaching_assignments(
            id,organization_id,engagement_id,coach_membership_id,assignment_kind,assigned_at
          ) values($1,$2,$3,$4,'primary',transaction_timestamp() + interval '1 hour')`,
            [id(401), graph.org, graph.engagement, graph.coachMembership],
          ),
        "future assignment is rejected",
      );
    });
    await withRollback(client, "current supporting assignment with future primary", async () => {
      await client.query(
        "update public.coaching_assignments set ended_at=transaction_timestamp() where id=$1",
        [graph.assignment],
      );
      await expectFailure(
        () =>
          client.query(
            `insert into public.coaching_assignments(
            id,organization_id,engagement_id,coach_membership_id,assignment_kind,assigned_at
          ) values
            ($1,$3,$4,$5,'supporting',transaction_timestamp()),
            ($2,$3,$4,$5,'primary',transaction_timestamp() + interval '1 hour')`,
            [id(402), id(403), graph.org, graph.engagement, graph.coachMembership],
          ),
        "future primary assignment is rejected",
      );
    });
    await withRollback(client, "assignment on another engagement", async () => {
      await client.query(
        "update public.coaching_assignments set ended_at=transaction_timestamp() where id=$1",
        [graph.assignment],
      );
      await addOtherAthleteEngagement(client, graph, 410);
      await assertDecision(client, "assignment_missing", graph);
    });
    await withRollback(client, "wrong-scope consent", async () => {
      await client.query(
        `insert into public.athlete_data_sharing_consents(
          id,organization_id,engagement_id,athlete_profile_id,scope_key,
          policy_version_id,granted_by_profile_id
        ) values($1,$2,$3,$4,'activities',$5,$4)`,
        [
          id(420),
          noConsentGraph.org,
          noConsentGraph.engagement,
          profiles.athlete,
          noConsentGraph.policies.activities,
        ],
      );
      await assertDecision(client, "consent_missing", noConsentGraph, { scope: "goals" });
    });
    await withRollback(client, "ended consent", async () => {
      await client.query(
        "update public.athlete_data_sharing_consents set ended_at=transaction_timestamp() where id=$1",
        [graph.consents.activities],
      );
      await assertDecision(client, "consent_ended", graph);
    });
    await withRollback(client, "expired consent", async () => {
      await client.query(
        "update public.athlete_data_sharing_consents set ended_at=transaction_timestamp() where id=$1",
        [graph.consents.activities],
      );
      await client.query(
        `insert into public.athlete_data_sharing_consents(
          id,organization_id,engagement_id,athlete_profile_id,scope_key,
          policy_version_id,granted_by_profile_id,granted_at,expires_at
        ) values(
          $1,$2,$3,$4,'activities',$5,$4,
          transaction_timestamp() - interval '2 hours',
          transaction_timestamp() - interval '1 hour'
        )`,
        [id(430), graph.org, graph.engagement, profiles.athlete, graph.policies.activities],
      );
      await assertDecision(client, "consent_expired", graph);
    });
    await withRollback(client, "future consent grant", async () => {
      await client.query(
        "update public.athlete_data_sharing_consents set ended_at=transaction_timestamp() where id=$1",
        [graph.consents.activities],
      );
      await client.query(
        `insert into public.athlete_data_sharing_consents(
          id,organization_id,engagement_id,athlete_profile_id,scope_key,
          policy_version_id,granted_by_profile_id,granted_at
        ) values($1,$2,$3,$4,'activities',$5,$4,transaction_timestamp() + interval '1 hour')`,
        [id(431), graph.org, graph.engagement, profiles.athlete, graph.policies.activities],
      );
      await assertDecision(client, "consent_missing", graph);
    });
    await withRollback(client, "superseded predecessor", async () => {
      const successorId = id(432);
      await client.query(
        "update public.athlete_data_sharing_consents set ended_at=transaction_timestamp() where id=$1",
        [graph.consents.activities],
      );
      await client.query(
        `insert into public.athlete_data_sharing_consents(
          id,organization_id,engagement_id,athlete_profile_id,scope_key,
          policy_version_id,granted_by_profile_id,granted_at
        ) values($1,$2,$3,$4,'activities',$5,$4,transaction_timestamp() + interval '1 hour')`,
        [successorId, graph.org, graph.engagement, profiles.athlete, graph.policies.activities],
      );
      await client.query(
        "update public.athlete_data_sharing_consents set superseded_by_consent_id=$1 where id=$2",
        [successorId, graph.consents.activities],
      );
      await assertDecision(client, "consent_missing", graph);
    });
    await withRollback(client, "future policy", async () => {
      const futurePolicy = id(433);
      await client.query(
        "update public.athlete_data_sharing_consents set ended_at=transaction_timestamp() where id=$1",
        [graph.consents.activities],
      );
      await client.query(
        `insert into public.athlete_consent_policy_versions(
          id,scope_key,effective_from,jurisdiction,terms_text,content_digest
        ) values($1,'activities',transaction_timestamp() + interval '1 hour','US','future terms','future-digest')`,
        [futurePolicy],
      );
      await client.query(
        `insert into public.athlete_data_sharing_consents(
          id,organization_id,engagement_id,athlete_profile_id,scope_key,
          policy_version_id,granted_by_profile_id
        ) values($1,$2,$3,$4,'activities',$5,$4)`,
        [id(434), graph.org, graph.engagement, profiles.athlete, futurePolicy],
      );
      await assertDecision(client, "consent_policy_not_effective", graph);
    });
    await withRollback(client, "wrong athlete consent", async () => {
      await addOtherAthleteEngagement(client, noConsentGraph, 440, "activities");
      await assertDecision(client, "consent_missing", noConsentGraph);
      await assertDecision(client, "allow", noConsentGraph, { athlete: profiles.otherAthlete });
    });
  } finally {
    client.release();
  }
}

async function auditForCorrelation(pool: Pool, correlationId: string) {
  const result = await pool.query<{
    action: string;
    resource_id: string;
    actor_profile_id: string;
    actor_membership_id: string | null;
    occurred_at: Date;
    details: Record<string, unknown>;
  }>(
    `select action,resource_id,actor_profile_id,actor_membership_id,occurred_at,details
     from public.organization_audit_events where correlation_id=$1`,
    [correlationId],
  );
  assert(result.rows.length === 1, `expected one audit event for ${correlationId}`);
  const row = result.rows[0];
  assert(row, `audit event ${correlationId} missing`);
  return row;
}

function assertDetails(actual: Record<string, unknown>, expected: Record<string, unknown>) {
  assert(
    JSON.stringify(Object.keys(actual).sort()) === JSON.stringify(Object.keys(expected).sort()),
    `audit detail keys differ: ${JSON.stringify(actual)}`,
  );
  for (const [key, value] of Object.entries(expected)) {
    assert(
      actual[key] === value,
      `audit detail ${key} expected ${String(value)}, got ${String(actual[key])}`,
    );
  }
}

async function terminalTimestamp(pool: Pool, table: string, rowId: string, column: string) {
  const allowed = new Set([
    "organization_memberships:ended_at",
    "coaching_engagements:ended_at",
    "athlete_data_sharing_consents:ended_at",
    "organizations:closed_at",
  ]);
  assert(allowed.has(`${table}:${column}`), "unsafe terminal timestamp selector");
  const result = await pool.query<{ terminal_at: Date | null }>(
    `select ${column} as terminal_at from public.${table} where id=$1`,
    [rowId],
  );
  const timestamp = result.rows[0]?.terminal_at;
  assert(timestamp instanceof Date, `${table}.${column} was not terminal`);
  return timestamp;
}

async function proveMembershipCommands(pool: Pool) {
  const graph = await seedAuthorityGraph(pool, 1_000);
  const correlation = id(1_090);
  await pool.query("select public.end_organization_membership($1,$2,$3,'administrative_end',$4)", [
    profiles.owner,
    graph.org,
    graph.coachMembership,
    correlation,
  ]);
  const firstTimestamp = await terminalTimestamp(
    pool,
    "organization_memberships",
    graph.coachMembership,
    "ended_at",
  );
  const dependentState = await pool.query<{
    grants: number;
    assignments: number;
    engagements: number;
    consents: number;
  }>(
    `select
      (select count(*)::int from public.organization_membership_role_grants where organization_id=$1 and membership_id=$2 and revoked_at is null) as grants,
      (select count(*)::int from public.coaching_assignments where organization_id=$1 and coach_membership_id=$2 and ended_at is null) as assignments,
      (select count(*)::int from public.coaching_engagements where organization_id=$1 and id=$3 and ended_at is null) as engagements,
      (select count(*)::int from public.athlete_data_sharing_consents where organization_id=$1 and engagement_id=$3 and ended_at is null) as consents`,
    [graph.org, graph.coachMembership, graph.engagement],
  );
  assert(dependentState.rows[0]?.grants === 0, "membership end left an active grant");
  assert(dependentState.rows[0]?.assignments === 0, "membership end left an active assignment");
  assert(dependentState.rows[0]?.engagements === 1, "membership end incorrectly ended engagement");
  assert(
    dependentState.rows[0]?.consents === scopes.length,
    "membership end incorrectly ended consent",
  );
  await pool.query("select public.end_organization_membership($1,$2,$3,'administrative_end',$4)", [
    profiles.owner,
    graph.org,
    graph.coachMembership,
    correlation,
  ]);
  const retryTimestamp = await terminalTimestamp(
    pool,
    "organization_memberships",
    graph.coachMembership,
    "ended_at",
  );
  assert(
    firstTimestamp.getTime() === retryTimestamp.getTime(),
    "membership retry changed terminal time",
  );
  const audit = await auditForCorrelation(pool, correlation);
  assert(audit.action === "organization.membership_ended", "membership audit action mismatch");
  assert(audit.actor_profile_id === profiles.owner, "membership audit actor mismatch");
  assert(
    audit.actor_membership_id === graph.ownerMembership,
    "membership audit membership mismatch",
  );
  assertDetails(audit.details, {
    reason_code: "administrative_end",
    revoked_grants: 1,
    ended_assignments: 1,
  });
  await expectFailure(
    () =>
      pool.query("select public.end_organization_membership($1,$2,$3,'different_reason',$4)", [
        profiles.owner,
        graph.org,
        graph.coachMembership,
        correlation,
      ]),
    "membership correlation reason conflict",
  );
  await expectFailure(
    () =>
      pool.query("select public.end_organization_membership($1,$2,$3,'administrative_end',$4)", [
        profiles.owner,
        graph.org,
        graph.secondAdminMembership,
        correlation,
      ]),
    "membership correlation resource conflict",
  );
  await expectFailure(
    () =>
      pool.query("select public.end_coaching_engagement($1,$2,$3,'administrative_end',$4)", [
        profiles.owner,
        graph.org,
        graph.engagement,
        correlation,
      ]),
    "cross-action correlation conflict",
  );

  const adminGraph = await seedAuthorityGraph(pool, 1_100);
  await pool.query("select public.end_organization_membership($1,$2,$3,'administrative_end',$4)", [
    profiles.admin,
    adminGraph.org,
    adminGraph.coachMembership,
    id(1_190),
  ]);
  await terminalTimestamp(pool, "organization_memberships", adminGraph.coachMembership, "ended_at");

  const deniedGraph = await seedAuthorityGraph(pool, 1_200);
  await expectFailure(
    () =>
      pool.query("select public.end_organization_membership($1,$2,$3,'x',$4)", [
        profiles.admin,
        deniedGraph.org,
        deniedGraph.secondAdminMembership,
        id(1_290),
      ]),
    "admin ending admin",
  );
  await expectFailure(
    () =>
      pool.query("select public.end_organization_membership($1,$2,$3,'x',$4)", [
        profiles.coach,
        deniedGraph.org,
        deniedGraph.otherCoachMembership,
        id(1_291),
      ]),
    "coach ending membership",
  );
  await expectFailure(
    () =>
      pool.query("select public.end_organization_membership($1,$2,$3,'x',$4)", [
        profiles.admin,
        deniedGraph.org,
        deniedGraph.adminMembership,
        id(1_292),
      ]),
    "membership self-end",
  );
  await expectFailure(
    () =>
      pool.query("select public.end_organization_membership($1,$2,$3,'x',$4)", [
        profiles.admin,
        deniedGraph.org,
        deniedGraph.ownerMembership,
        id(1_293),
      ]),
    "root membership end",
  );
}

async function proveEngagementCommandForActor(pool: Pool, base: number, actorProfileId: string) {
  const graph = await seedAuthorityGraph(pool, base);
  const correlation = id(base + 90);
  await pool.query("select public.end_coaching_engagement($1,$2,$3,'engagement_ended',$4)", [
    actorProfileId,
    graph.org,
    graph.engagement,
    correlation,
  ]);
  const firstTimestamp = await terminalTimestamp(
    pool,
    "coaching_engagements",
    graph.engagement,
    "ended_at",
  );
  const state = await pool.query<{ assignments: number; consents: number }>(
    `select
      (select count(*)::int from public.coaching_assignments where engagement_id=$1 and ended_at is null) as assignments,
      (select count(*)::int from public.athlete_data_sharing_consents where engagement_id=$1 and ended_at is null) as consents`,
    [graph.engagement],
  );
  assert(state.rows[0]?.assignments === 0, "engagement end left an assignment active");
  assert(state.rows[0]?.consents === 0, "engagement end left consent active");
  await pool.query("select public.end_coaching_engagement($1,$2,$3,'engagement_ended',$4)", [
    actorProfileId,
    graph.org,
    graph.engagement,
    correlation,
  ]);
  const retryTimestamp = await terminalTimestamp(
    pool,
    "coaching_engagements",
    graph.engagement,
    "ended_at",
  );
  assert(firstTimestamp.getTime() === retryTimestamp.getTime(), "engagement retry changed time");
  await expectFailure(
    () =>
      pool.query("select public.end_coaching_engagement($1,$2,$3,'different_reason',$4)", [
        actorProfileId,
        graph.org,
        graph.engagement,
        correlation,
      ]),
    "engagement correlation reason conflict",
  );
  const audit = await auditForCorrelation(pool, correlation);
  assertDetails(audit.details, {
    reason_code: "engagement_ended",
    ended_assignments: 1,
    ended_consents: scopes.length,
  });
  return graph;
}

async function proveEngagementCommands(pool: Pool) {
  await proveEngagementCommandForActor(pool, 1_300, profiles.owner);
  await proveEngagementCommandForActor(pool, 1_400, profiles.admin);
  const athleteGraph = await proveEngagementCommandForActor(pool, 1_500, profiles.athlete);
  const athleteAudit = await auditForCorrelation(pool, id(1_590));
  assert(athleteAudit.actor_membership_id === null, "athlete audit fabricated a membership");
  assert(
    athleteAudit.resource_id === athleteGraph.engagement,
    "athlete engagement audit resource mismatch",
  );

  const deniedGraph = await seedAuthorityGraph(pool, 1_600);
  await expectFailure(
    () =>
      pool.query("select public.end_coaching_engagement($1,$2,$3,'x',$4)", [
        profiles.coach,
        deniedGraph.org,
        deniedGraph.engagement,
        id(1_690),
      ]),
    "assigned coach ending engagement",
  );
}

async function proveConsentCommands(pool: Pool) {
  const graph = await seedAuthorityGraph(pool, 1_700);
  const target = graph.consents.activities;
  for (const [label, actor] of [
    ["owner", profiles.owner],
    ["admin", profiles.admin],
    ["coach", profiles.coach],
  ] as const) {
    await expectFailure(
      () =>
        pool.query("select public.withdraw_athlete_consent($1,$2,$3,'x',$4)", [
          actor,
          graph.org,
          target,
          id(1_710 + Object.keys(profiles).indexOf(label)),
        ]),
      `${label} withdrawing athlete consent`,
    );
  }
  const correlation = id(1_790);
  await pool.query("select public.withdraw_athlete_consent($1,$2,$3,'athlete_withdrew',$4)", [
    profiles.athlete,
    graph.org,
    target,
    correlation,
  ]);
  const firstTimestamp = await terminalTimestamp(
    pool,
    "athlete_data_sharing_consents",
    target,
    "ended_at",
  );
  const adjacent = await pool.query<{ ended_at: Date | null }>(
    "select ended_at from public.athlete_data_sharing_consents where id=$1",
    [graph.consents.goals],
  );
  assert(adjacent.rows[0]?.ended_at === null, "withdrawal ended an adjacent scope");
  await pool.query("select public.withdraw_athlete_consent($1,$2,$3,'athlete_withdrew',$4)", [
    profiles.athlete,
    graph.org,
    target,
    correlation,
  ]);
  const retryTimestamp = await terminalTimestamp(
    pool,
    "athlete_data_sharing_consents",
    target,
    "ended_at",
  );
  assert(firstTimestamp.getTime() === retryTimestamp.getTime(), "consent retry changed time");
  await expectFailure(
    () =>
      pool.query("select public.withdraw_athlete_consent($1,$2,$3,'different_reason',$4)", [
        profiles.athlete,
        graph.org,
        target,
        correlation,
      ]),
    "consent correlation reason conflict",
  );
  const audit = await auditForCorrelation(pool, correlation);
  assert(audit.actor_profile_id === profiles.athlete, "consent audit actor mismatch");
  assertDetails(audit.details, { reason_code: "athlete_withdrew" });
  await expectFailure(
    () =>
      pool.query("select public.withdraw_athlete_consent($1,$2,$3,'athlete_withdrew',$4)", [
        profiles.athlete,
        graph.org,
        graph.consents.goals,
        correlation,
      ]),
    "consent correlation resource conflict",
  );
}

async function assertClosedAuthorityState(pool: Pool, graph: AuthorityGraph) {
  const state = await pool.query<{
    grants: number;
    engagements: number;
    assignments: number;
    consents: number;
    changed_memberships: number;
  }>(
    `select
      (select count(*)::int from public.organization_membership_role_grants where organization_id=$1 and revoked_at is null) as grants,
      (select count(*)::int from public.coaching_engagements where organization_id=$1 and ended_at is null) as engagements,
      (select count(*)::int from public.coaching_assignments where organization_id=$1 and ended_at is null) as assignments,
      (select count(*)::int from public.athlete_data_sharing_consents where organization_id=$1 and ended_at is null) as consents,
      (select count(*)::int from public.organization_memberships where organization_id=$1 and (suspended_at is not null or ended_at is not null)) as changed_memberships`,
    [graph.org],
  );
  assert(state.rows[0]?.grants === 0, "closure left a grant active");
  assert(state.rows[0]?.engagements === 0, "closure left an engagement active");
  assert(state.rows[0]?.assignments === 0, "closure left an assignment active");
  assert(state.rows[0]?.consents === 0, "closure left consent active");
  assert(state.rows[0]?.changed_memberships === 0, "closure changed retained membership lifecycle");
}

async function proveClosureCommands(pool: Pool) {
  const graph = await seedAuthorityGraph(pool, 1_800);
  await expectFailure(
    () =>
      pool.query("select public.close_organization($1,$2,false,'organization_closed',$3)", [
        profiles.owner,
        graph.org,
        id(1_880),
      ]),
    "closure without reauthentication",
  );
  await expectFailure(
    () =>
      pool.query("select public.close_organization($1,$2,true,'organization_closed',$3)", [
        profiles.admin,
        graph.org,
        id(1_881),
      ]),
    "admin closing organization",
  );
  await expectFailure(
    () =>
      pool.query("select public.close_organization($1,$2,true,'organization_closed',$3)", [
        profiles.coach,
        graph.org,
        id(1_882),
      ]),
    "coach closing organization",
  );
  await pool.query(
    "update public.organizations set suspended_at=transaction_timestamp() where id=$1",
    [graph.org],
  );
  const correlation = id(1_890);
  await pool.query("select public.close_organization($1,$2,true,'organization_closed',$3)", [
    profiles.owner,
    graph.org,
    correlation,
  ]);
  const firstTimestamp = await terminalTimestamp(pool, "organizations", graph.org, "closed_at");
  await assertClosedAuthorityState(pool, graph);
  await pool.query("select public.close_organization($1,$2,true,'organization_closed',$3)", [
    profiles.owner,
    graph.org,
    correlation,
  ]);
  const retryTimestamp = await terminalTimestamp(pool, "organizations", graph.org, "closed_at");
  assert(firstTimestamp.getTime() === retryTimestamp.getTime(), "closure retry changed time");
  await expectFailure(
    () =>
      pool.query("select public.close_organization($1,$2,true,'different_reason',$3)", [
        profiles.owner,
        graph.org,
        correlation,
      ]),
    "closure correlation reason conflict",
  );
  const audit = await auditForCorrelation(pool, correlation);
  assertDetails(audit.details, {
    reason_code: "organization_closed",
    revoked_grants: 5,
    ended_engagements: 1,
    ended_assignments: 1,
    ended_consents: scopes.length,
  });
  await expectFailure(
    () =>
      pool.query("select public.close_organization($1,$2,true,'organization_closed',$3)", [
        profiles.admin,
        graph.org,
        correlation,
      ]),
    "closure replay by another actor",
  );
  await expectFailure(
    () =>
      pool.query("select public.close_organization($1,$2,true,'organization_closed',$3)", [
        profiles.owner,
        graph.org,
        id(1_891),
      ]),
    "new closure request after closure",
  );

  const activeGraph = await seedAuthorityGraph(pool, 1_900);
  await pool.query("select public.close_organization($1,$2,true,'organization_closed',$3)", [
    profiles.owner,
    activeGraph.org,
    id(1_990),
  ]);
  await assertClosedAuthorityState(pool, activeGraph);
}

async function waitForLock(observer: Queryable, pid: number, label: string) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const result = await observer.query<{ waiting: boolean | null }>(
      "select wait_event_type = 'Lock' as waiting from pg_catalog.pg_stat_activity where pid=$1",
      [pid],
    );
    if (result.rows[0]?.waiting) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
  }
  throw new Error(`${label} did not wait on a PostgreSQL lock`);
}

async function proveEngagementReadConcurrency(url: string, pool: Pool) {
  const sessions = new Pool({ connectionString: url, max: 3 });
  const reader = await sessions.connect();
  const writer = await sessions.connect();
  const observer = await sessions.connect();
  try {
    const readFirst = await seedAuthorityGraph(pool, 2_100);
    await reader.query("begin");
    await reader.query("set local lock_timeout='5s'; set local statement_timeout='10s'");
    await assertDecision(reader, "allow", readFirst);
    await writer.query("begin");
    await writer.query("set local lock_timeout='5s'; set local statement_timeout='10s'");
    const writerPid = (await writer.query<{ pid: number }>("select pg_backend_pid() as pid"))
      .rows[0]?.pid;
    assert(writerPid, "writer backend PID missing");
    const ending = writer.query(
      "select public.end_coaching_engagement($1,$2,$3,'concurrency_end',$4)",
      [profiles.owner, readFirst.org, readFirst.engagement, id(2_190)],
    );
    await waitForLock(observer, writerPid, "read-first engagement end");
    await reader.query("commit");
    await ending;
    await writer.query("commit");
    await assertDecision(pool, "engagement_not_active", readFirst);

    const writerFirst = await seedAuthorityGraph(pool, 2_200);
    await writer.query("begin");
    await writer.query("set local lock_timeout='5s'; set local statement_timeout='10s'");
    await writer.query("select public.end_coaching_engagement($1,$2,$3,'concurrency_end',$4)", [
      profiles.owner,
      writerFirst.org,
      writerFirst.engagement,
      id(2_290),
    ]);
    await reader.query("begin");
    await reader.query("set local lock_timeout='5s'; set local statement_timeout='10s'");
    const readerPid = (await reader.query<{ pid: number }>("select pg_backend_pid() as pid"))
      .rows[0]?.pid;
    assert(readerPid, "reader backend PID missing");
    const denied = reader.query<{ decision: string }>(decisionSql, [
      profiles.coach,
      writerFirst.org,
      profiles.athlete,
      "activities",
    ]);
    await waitForLock(observer, readerPid, "writer-first athlete read");
    await writer.query("commit");
    assert(
      (await denied).rows[0]?.decision === "engagement_not_active",
      "writer-first read did not deny after commit",
    );
    await reader.query("commit");
    await assertDecision(pool, "engagement_not_active", writerFirst);
  } finally {
    await Promise.allSettled([reader.query("rollback"), writer.query("rollback")]);
    reader.release();
    writer.release();
    observer.release();
    await sessions.end();
  }
}

const restrictedCalls = (graph: AuthorityGraph) => [
  {
    label: "athlete read evaluator",
    sql: decisionSql,
    values: [profiles.coach, graph.org, profiles.athlete, "activities"],
  },
  {
    label: "membership end",
    sql: "select public.end_organization_membership($1,$2,$3,'acl_probe',$4)",
    values: [profiles.owner, graph.org, graph.coachMembership, id(2_390)],
  },
  {
    label: "root ownership transfer",
    sql: "select public.transfer_organization_root_ownership($1,$2,$3,true,'acl_probe',$4)",
    values: [profiles.owner, graph.org, graph.coachMembership, id(2_394)],
  },
  {
    label: "engagement end",
    sql: "select public.end_coaching_engagement($1,$2,$3,'acl_probe',$4)",
    values: [profiles.owner, graph.org, graph.engagement, id(2_391)],
  },
  {
    label: "consent withdrawal",
    sql: "select public.withdraw_athlete_consent($1,$2,$3,'acl_probe',$4)",
    values: [profiles.athlete, graph.org, graph.consents.activities, id(2_392)],
  },
  {
    label: "organization closure",
    sql: "select public.close_organization($1,$2,true,'acl_probe',$3)",
    values: [profiles.owner, graph.org, id(2_393)],
  },
];

async function expectAuthenticatedFailure(
  pool: Pool,
  sqlText: string,
  values: unknown[],
  label: string,
) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local role authenticated");
    await expectFailure(() => client.query(sqlText, values), label);
  } finally {
    await client.query("rollback").catch(() => undefined);
    client.release();
  }
}

async function proveAclDenials(pool: Pool, url: string) {
  const graph = await seedAuthorityGraph(pool, 2_300);
  const role = `coaching_authorization_probe_${process.pid}`;
  await pool.query(
    `create role ${role} login password 'local-only-probe' nosuperuser nobypassrls inherit`,
  );
  await pool.query(`grant service_role to ${role}`);
  const probeUrl = new URL(url);
  probeUrl.username = role;
  probeUrl.password = "local-only-probe";
  const probe = new Pool({ connectionString: probeUrl.toString(), max: 1 });
  try {
    for (const call of restrictedCalls(graph)) {
      await expectFailure(
        () => probe.query(call.sql, call.values),
        `service-role ${call.label} execute`,
      );
      await expectAuthenticatedFailure(
        pool,
        call.sql,
        call.values,
        `authenticated ${call.label} execute`,
      );
    }
    const directDml = [
      {
        label: "lifecycle update",
        sql: "update public.coaching_engagements set ended_at=transaction_timestamp() where id=$1",
        values: [graph.engagement],
      },
      {
        label: "audit insert",
        sql: "insert into public.organization_audit_events(organization_id,action,resource_type) values($1,'acl.probe','organization')",
        values: [graph.org],
      },
      {
        label: "root ownership update",
        sql: "update public.organizations set root_owner_membership_id=$1 where id=$2",
        values: [graph.coachMembership, graph.org],
      },
    ];
    for (const operation of directDml) {
      await expectFailure(
        () => probe.query(operation.sql, operation.values),
        `service-role direct ${operation.label}`,
      );
      await expectAuthenticatedFailure(
        pool,
        operation.sql,
        operation.values,
        `authenticated direct ${operation.label}`,
      );
    }
    await probe.query("select count(*)::int as count from public.organizations");
  } finally {
    await probe.end();
    await pool.query(`revoke service_role from ${role}`);
    await pool.query(`drop role ${role}`);
  }
}

async function main() {
  const policy = JSON.parse(
    readFileSync(resolve(dbPackageRoot, "migration-policy.json"), "utf8"),
  ) as { authorityDirectory: string; activeLedgerFile: string };
  const ledger = JSON.parse(
    readFileSync(resolve(dbPackageRoot, policy.activeLedgerFile), "utf8"),
  ) as { entries: Array<{ version: string; name: string }> };

  await withDisposableDatabase(
    process.argv.slice(2),
    "coaching_authorization",
    async (pool, targetUrl) => {
      await bootstrapSupabaseSchemas(pool);
      for (const migration of ledger.entries) {
        await applySqlFile(
          pool,
          resolve(
            dbPackageRoot,
            policy.authorityDirectory,
            `${migration.version}_${migration.name}.sql`,
          ),
        );
      }
      await seedProfiles(pool);
      await proveDecisionMatrix(pool);
      await proveMembershipCommands(pool);
      await proveEngagementCommands(pool);
      await proveConsentCommands(pool);
      await proveClosureCommands(pool);
      await proveEngagementReadConcurrency(targetUrl, pool);
      await proveAclDenials(pool, targetUrl);
      console.log(
        "[db:coaching:authorization] guarded disposable denial matrix, terminal commands, audit/idempotency, ACL, and two-order concurrency proof passed; functions remain ungranted and this is not deployed-role, RLS-identity, or athlete-projection proof",
      );
    },
  );
}

main().catch((error) => {
  console.error(
    `[db:coaching:authorization] ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
