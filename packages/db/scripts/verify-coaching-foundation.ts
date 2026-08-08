#!/usr/bin/env tsx

import { ATHLETE_READ_SCOPES, ORGANIZATION_ROLE_KEYS } from "@repo/core/organizations";
import { Pool } from "pg";
import {
  athleteReadScopeDbValues,
  organizationRoleKeyDbValues,
} from "../src/schema/core-enum-parity";
import {
  applySqlFile,
  bootstrapSupabaseSchemas,
  withDisposableDatabase,
} from "./_disposable-target";
import { requireFreshBaseline } from "./baseline-workflow";

const ids = {
  owner: "10000000-0000-4000-8000-000000000101",
  coach: "10000000-0000-4000-8000-000000000102",
  athlete: "10000000-0000-4000-8000-000000000103",
  org: "20000000-0000-4000-8000-000000000101",
  secondOrg: "20000000-0000-4000-8000-000000000102",
  ownerMembership: "30000000-0000-4000-8000-000000000101",
  secondMembership: "30000000-0000-4000-8000-000000000102",
  coachMembership: "30000000-0000-4000-8000-000000000103",
  engagement: "40000000-0000-4000-8000-000000000101",
  policy: "50000000-0000-4000-8000-000000000101",
  trainingPolicy: "50000000-0000-4000-8000-000000000102",
  successorPolicy: "50000000-0000-4000-8000-000000000103",
  selfPolicy: "50000000-0000-4000-8000-000000000104",
  consent: "60000000-0000-4000-8000-000000000101",
  replacementConsent: "60000000-0000-4000-8000-000000000102",
  chronologyConsent: "60000000-0000-4000-8000-000000000103",
  invalidSuccessorConsent: "60000000-0000-4000-8000-000000000104",
  transferToCoachCorrelation: "70000000-0000-4000-8000-000000000101",
  transferBackCorrelation: "70000000-0000-4000-8000-000000000102",
} as const;
const aclProbeRole = `coaching_acl_probe_${process.pid}`;
const rootTransferSpoofRole = `coaching_root_transfer_spoof_${process.pid}`;
const rootTransferSpoofSelectPolicy = `${rootTransferSpoofRole}_select`;
const rootTransferSpoofUpdatePolicy = `${rootTransferSpoofRole}_update`;

async function expectFailure(action: () => Promise<unknown>, label: string) {
  try {
    await action();
  } catch {
    return;
  }
  throw new Error(`${label} unexpectedly succeeded`);
}

async function expectFailureMessage(
  action: () => Promise<unknown>,
  label: string,
  expectedMessage: string,
) {
  try {
    await action();
  } catch (error) {
    if (error instanceof Error && error.message.includes(expectedMessage)) return;
    throw new Error(`${label} failed for an unexpected reason`);
  }
  throw new Error(`${label} unexpectedly succeeded`);
}

function sortedValues(values: readonly string[]) {
  return [...values].sort();
}

async function assertMigratedCheckConstraintValues(
  db: Pool,
  input: {
    table: string;
    constraint: string;
    databaseValues: readonly string[];
    coreValues: readonly string[];
  },
) {
  const result = await db.query<{ definition: string }>(
    `
      select pg_catalog.pg_get_constraintdef(con.oid, true) as definition
      from pg_catalog.pg_constraint con
      join pg_catalog.pg_class rel on rel.oid = con.conrelid
      join pg_catalog.pg_namespace namespace on namespace.oid = rel.relnamespace
      where namespace.nspname = 'public'
        and rel.relname = $1
        and con.conname = $2
        and con.contype = 'c'
      order by con.oid
    `,
    [input.table, input.constraint],
  );
  if (result.rowCount !== 1 || !result.rows[0]?.definition) {
    throw new Error(`migrated check constraint ${input.constraint} is missing on ${input.table}`);
  }
  const arrayContents = result.rows[0].definition.match(/ARRAY\[(.*?)\]/)?.[1];
  if (!arrayContents) {
    throw new Error(
      `migrated check constraint ${input.constraint} does not expose a literal ARRAY set`,
    );
  }
  const actualValues = [...arrayContents.matchAll(/'((?:''|[^'])*)'/g)].flatMap((match) => {
    const value = match[1];
    return value === undefined ? [] : [value.replaceAll("''", "'")];
  });
  if (
    JSON.stringify(sortedValues(actualValues)) !==
    JSON.stringify(sortedValues(input.databaseValues))
  ) {
    throw new Error(
      `migrated check constraint ${input.constraint} does not match DB-owned literals`,
    );
  }
  if (
    JSON.stringify(sortedValues(actualValues)) !== JSON.stringify(sortedValues(input.coreValues))
  ) {
    throw new Error(
      `migrated check constraint ${input.constraint} does not match the Core contract`,
    );
  }
}

async function main() {
  await withDisposableDatabase(
    process.argv.slice(2),
    "coaching_foundation",
    async (db, targetUrl) => {
      await bootstrapSupabaseSchemas(db);
      await applySqlFile(db, requireFreshBaseline().sourcePath);
      await assertMigratedCheckConstraintValues(db, {
        table: "organization_membership_role_grants",
        constraint: "organization_membership_role_grants_role_key_check",
        databaseValues: organizationRoleKeyDbValues,
        coreValues: ORGANIZATION_ROLE_KEYS,
      });
      await assertMigratedCheckConstraintValues(db, {
        table: "athlete_consent_policy_versions",
        constraint: "athlete_consent_policy_versions_scope_check",
        databaseValues: athleteReadScopeDbValues,
        coreValues: ATHLETE_READ_SCOPES,
      });
      for (const profileId of [ids.owner, ids.coach, ids.athlete]) {
        await db.query(
          "insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, '{}'::jsonb)",
          [profileId, `${profileId}@example.test`],
        );
      }

      // Deferred FK + root guard permit a pre-generated bootstrap graph in one transaction.
      await db.query("begin");
      await db.query(
        "insert into public.organizations (id, created_by_profile_id, root_owner_membership_id, name, slug, timezone) values ($1, $2, $3, 'Foundation', 'foundation', 'UTC')",
        [ids.org, ids.owner, ids.ownerMembership],
      );
      await db.query(
        "insert into public.organization_memberships (id, organization_id, profile_id) values ($1, $2, $3)",
        [ids.ownerMembership, ids.org, ids.owner],
      );
      await db.query(
        "insert into public.organization_membership_role_grants (organization_id, membership_id, role_key) values ($1, $2, 'admin')",
        [ids.org, ids.ownerMembership],
      );
      await db.query("commit");

      await db.query("begin");
      await db.query(
        "insert into public.organizations (id, created_by_profile_id, root_owner_membership_id, name, slug, timezone) values ($1, $2, $3, 'Second', 'second', 'UTC')",
        [ids.secondOrg, ids.owner, ids.secondMembership],
      );
      await db.query(
        "insert into public.organization_memberships (id, organization_id, profile_id) values ($1, $2, $3)",
        [ids.secondMembership, ids.secondOrg, ids.owner],
      );
      await db.query(
        "insert into public.organization_membership_role_grants (organization_id, membership_id, role_key) values ($1, $2, 'admin')",
        [ids.secondOrg, ids.secondMembership],
      );
      await db.query("commit");
      const multiOrg = await db.query(
        "select count(*)::int as count from public.organization_memberships where profile_id = $1",
        [ids.owner],
      );
      if (multiOrg.rows[0]?.count !== 2)
        throw new Error("multi-organization membership was not retained");

      await db.query(
        "insert into public.organization_memberships (id, organization_id, profile_id) values ($1, $2, $3)",
        [ids.coachMembership, ids.org, ids.coach],
      );
      await db.query(
        "insert into public.organization_membership_role_grants (organization_id, membership_id, role_key) values ($1, $2, 'coach')",
        [ids.org, ids.coachMembership],
      );
      await expectFailure(
        () =>
          db.query(
            "update public.organization_membership_role_grants set role_key = 'admin' where organization_id = $1 and membership_id = $2 and role_key = 'coach'",
            [ids.org, ids.coachMembership],
          ),
        "role grant authority rewrite",
      );
      await expectFailure(
        () =>
          db.query(
            "delete from public.organization_membership_role_grants where organization_id = $1 and membership_id = $2 and role_key = 'coach'",
            [ids.org, ids.coachMembership],
          ),
        "role grant deletion",
      );
      await expectFailure(
        () =>
          db.query(
            "update public.organization_membership_role_grants set revoked_at = granted_at - interval '1 second' where organization_id = $1 and membership_id = $2 and role_key = 'coach'",
            [ids.org, ids.coachMembership],
          ),
        "role revocation before grant",
      );
      await db.query(
        "update public.organization_membership_role_grants set revoked_at = now() where organization_id = $1 and membership_id = $2 and role_key = 'coach'",
        [ids.org, ids.coachMembership],
      );
      await db.query(
        "insert into public.organization_membership_role_grants (organization_id, membership_id, role_key) values ($1, $2, 'coach')",
        [ids.org, ids.coachMembership],
      );
      await db.query(
        "insert into public.organization_membership_role_grants (organization_id, membership_id, role_key) values ($1, $2, 'admin')",
        [ids.org, ids.coachMembership],
      );
      await expectFailure(
        () =>
          db.query("update public.organizations set root_owner_membership_id = $1 where id = $2", [
            ids.coachMembership,
            ids.org,
          ]),
        "direct root ownership transfer",
      );
      await db.query(
        "select public.transfer_organization_root_ownership($1,$2,$3,true,'owner_transfer',$4)",
        [ids.owner, ids.org, ids.coachMembership, ids.transferToCoachCorrelation],
      );
      await db.query(
        "select public.transfer_organization_root_ownership($1,$2,$3,true,'owner_transfer',$4)",
        [ids.owner, ids.org, ids.coachMembership, ids.transferToCoachCorrelation],
      );
      const transferredRoot = await db.query<{ root_owner_membership_id: string }>(
        "select root_owner_membership_id from public.organizations where id = $1",
        [ids.org],
      );
      if (transferredRoot.rows[0]?.root_owner_membership_id !== ids.coachMembership) {
        throw new Error("guarded root ownership transfer did not select the target membership");
      }
      await expectFailure(
        () =>
          db.query("update public.organizations set root_owner_membership_id = $1 where id = $2", [
            ids.ownerMembership,
            ids.org,
          ]),
        "direct root ownership restoration",
      );
      await db.query(
        "select public.transfer_organization_root_ownership($1,$2,$3,true,'owner_transfer',$4)",
        [ids.coach, ids.org, ids.ownerMembership, ids.transferBackCorrelation],
      );
      const restoredRoot = await db.query<{ root_owner_membership_id: string }>(
        "select root_owner_membership_id from public.organizations where id = $1",
        [ids.org],
      );
      if (restoredRoot.rows[0]?.root_owner_membership_id !== ids.ownerMembership) {
        throw new Error("guarded root ownership transfer did not restore the original root");
      }
      const transferAudits = await db.query<{ count: number }>(
        "select count(*)::int as count from public.organization_audit_events where organization_id = $1 and action = 'organization.root_ownership_transferred'",
        [ids.org],
      );
      if (transferAudits.rows[0]?.count !== 2) {
        throw new Error("guarded root ownership transfers did not emit exact audit evidence");
      }

      await db.query(
        `create role ${rootTransferSpoofRole} login password 'local-root-transfer-spoof-only' nosuperuser nobypassrls noinherit`,
      );
      await db.query(`grant select on table public.organizations to ${rootTransferSpoofRole}`);
      await db.query(
        `grant update (root_owner_membership_id) on table public.organizations to ${rootTransferSpoofRole}`,
      );
      await db.query(
        `create policy ${rootTransferSpoofSelectPolicy} on public.organizations for select to ${rootTransferSpoofRole} using (true)`,
      );
      await db.query(
        `create policy ${rootTransferSpoofUpdatePolicy} on public.organizations for update to ${rootTransferSpoofRole} using (true) with check (true)`,
      );
      const spoofUrl = new URL(targetUrl);
      spoofUrl.username = rootTransferSpoofRole;
      spoofUrl.password = "local-root-transfer-spoof-only";
      const spoofProbe = new Pool({ connectionString: spoofUrl.toString(), max: 1 });
      try {
        await spoofProbe.query("begin");
        await spoofProbe.query(
          "select set_config('gradientpeak.coaching_root_transfer_guard', $1, true)",
          [`${ids.org}:${ids.ownerMembership}:${ids.coachMembership}`],
        );
        await expectFailureMessage(
          () =>
            spoofProbe.query(
              "update public.organizations set root_owner_membership_id = $1 where id = $2",
              [ids.coachMembership, ids.org],
            ),
          "DML-granted root transfer marker spoof",
          "root ownership may change only through the guarded transfer command",
        );
      } finally {
        await spoofProbe.query("rollback").catch(() => undefined);
        await spoofProbe.end();
        await db.query(`drop policy ${rootTransferSpoofUpdatePolicy} on public.organizations`);
        await db.query(`drop policy ${rootTransferSpoofSelectPolicy} on public.organizations`);
        await db.query(`revoke all on table public.organizations from ${rootTransferSpoofRole}`);
        await db.query(`drop role ${rootTransferSpoofRole}`);
      }

      await expectFailure(async () => {
        await db.query("begin");
        await db.query(
          "update public.organization_memberships set suspended_at = now() where id = $1",
          [ids.ownerMembership],
        );
        await db.query("commit");
      }, "root membership suspension");
      await db.query("rollback");

      await db.query(
        "insert into public.coaching_engagements (id, organization_id, athlete_profile_id) values ($1, $2, $3)",
        [ids.engagement, ids.org, ids.athlete],
      );
      await expectFailure(
        () =>
          db.query(
            "insert into public.coaching_engagements (organization_id, athlete_profile_id) values ($1, $2)",
            [ids.org, ids.athlete],
          ),
        "duplicate current engagement",
      );
      await db.query("update public.coaching_engagements set paused_at = now() where id = $1", [
        ids.engagement,
      ]);
      await db.query("update public.coaching_engagements set paused_at = null where id = $1", [
        ids.engagement,
      ]);
      await expectFailure(
        () =>
          db.query("update public.coaching_engagements set athlete_profile_id = $1 where id = $2", [
            ids.owner,
            ids.engagement,
          ]),
        "engagement identity rewrite",
      );
      await expectFailure(
        () => db.query("delete from public.coaching_engagements where id = $1", [ids.engagement]),
        "engagement deletion",
      );
      await expectFailure(
        () =>
          db.query(
            "insert into public.coaching_assignments (organization_id, engagement_id, coach_membership_id, assignment_kind) values ($1, $2, $3, 'primary')",
            [ids.org, ids.engagement, ids.ownerMembership],
          ),
        "assignment without an active coach grant",
      );
      await db.query(
        "insert into public.coaching_assignments (organization_id, engagement_id, coach_membership_id, assignment_kind) values ($1, $2, $3, 'primary')",
        [ids.org, ids.engagement, ids.coachMembership],
      );
      const assignment = await db.query<{ assigned_at: Date | null }>(
        "select assigned_at from public.coaching_assignments where engagement_id = $1",
        [ids.engagement],
      );
      if (!assignment.rows[0]?.assigned_at)
        throw new Error("assignment is not immediately effective");
      await expectFailure(
        () =>
          db.query(
            "update public.coaching_assignments set ended_at = assigned_at - interval '1 second' where engagement_id = $1",
            [ids.engagement],
          ),
        "assignment end before assignment",
      );
      await expectFailure(
        () =>
          db.query(
            "insert into public.coaching_assignments (organization_id, engagement_id, coach_membership_id, assignment_kind) values ($1, $2, $3, 'primary')",
            [ids.org, ids.engagement, ids.ownerMembership],
          ),
        "second active primary assignment",
      );
      await expectFailure(
        () =>
          db.query(
            "update public.coaching_assignments set assignment_kind = 'supporting' where engagement_id = $1",
            [ids.engagement],
          ),
        "assignment kind rewrite",
      );
      await expectFailure(
        () =>
          db.query("delete from public.coaching_assignments where engagement_id = $1", [
            ids.engagement,
          ]),
        "assignment deletion",
      );
      await db.query(
        "update public.coaching_assignments set ended_at = now() where engagement_id = $1",
        [ids.engagement],
      );
      await expectFailure(
        () =>
          db.query(
            "update public.coaching_assignments set ended_at = now() where engagement_id = $1",
            [ids.engagement],
          ),
        "assignment end rewrite",
      );

      await db.query(
        "insert into public.athlete_consent_policy_versions (id, scope_key, effective_from, jurisdiction, terms_text, content_digest) values ($1, 'activities', now(), 'US', 'terms', 'sha256:test')",
        [ids.policy],
      );
      await expectFailure(
        () =>
          db.query(
            "update public.athlete_consent_policy_versions set terms_text = 'rewritten' where id = $1",
            [ids.policy],
          ),
        "policy version mutation",
      );
      await expectFailure(
        () =>
          db.query("delete from public.athlete_consent_policy_versions where id = $1", [
            ids.policy,
          ]),
        "policy version deletion",
      );
      await expectFailure(
        () =>
          db.query(
            "insert into public.athlete_consent_policy_versions (id, scope_key, effective_from, jurisdiction, terms_text, content_digest, supersedes_policy_version_id) values ($1, 'activities', now(), 'US', 'self', 'sha256:self', $1)",
            [ids.selfPolicy],
          ),
        "policy self supersession",
      );
      await expectFailure(
        () =>
          db.query(
            "insert into public.athlete_consent_policy_versions (scope_key, effective_from, jurisdiction, terms_text, content_digest, supersedes_policy_version_id) values ('training', now(), 'US', 'wrong scope', 'sha256:wrong-scope', $1)",
            [ids.policy],
          ),
        "policy cross-scope supersession",
      );
      await expectFailure(
        () =>
          db.query(
            "insert into public.athlete_consent_policy_versions (id, scope_key, effective_from, jurisdiction, terms_text, content_digest, supersedes_policy_version_id) values ($1, 'activities', now() - interval '1 second', 'US', 'backward', 'sha256:backward', $2)",
            [ids.successorPolicy, ids.policy],
          ),
        "policy backward supersession chronology",
      );
      await db.query(
        "insert into public.athlete_data_sharing_consents (id, organization_id, engagement_id, athlete_profile_id, scope_key, policy_version_id, granted_by_profile_id) values ($1, $2, $3, $4, 'activities', $5, $4)",
        [ids.consent, ids.org, ids.engagement, ids.athlete, ids.policy],
      );
      await expectFailure(
        () =>
          db.query(
            "insert into public.athlete_data_sharing_consents (organization_id, engagement_id, athlete_profile_id, scope_key, policy_version_id, granted_by_profile_id, expires_at) values ($1, $2, $3, 'activities', $4, $3, now() - interval '1 second')",
            [ids.org, ids.engagement, ids.athlete, ids.policy],
          ),
        "consent expiry before grant",
      );
      await expectFailure(
        () =>
          db.query(
            "insert into public.athlete_data_sharing_consents (organization_id, engagement_id, athlete_profile_id, scope_key, policy_version_id, granted_by_profile_id, ended_at) values ($1, $2, $3, 'activities', $4, $3, now() - interval '1 second')",
            [ids.org, ids.engagement, ids.athlete, ids.policy],
          ),
        "consent end before grant",
      );
      await expectFailure(
        () =>
          db.query(
            "insert into public.athlete_data_sharing_consents (organization_id, engagement_id, athlete_profile_id, scope_key, policy_version_id, granted_by_profile_id) values ($1, $2, $3, 'training', $4, $3)",
            [ids.org, ids.engagement, ids.athlete, ids.policy],
          ),
        "scope-policy mismatch",
      );
      await db.query("begin");
      await db.query(
        "update public.athlete_data_sharing_consents set ended_at = now() where id = $1",
        [ids.consent],
      );
      await db.query(
        "insert into public.athlete_data_sharing_consents (id, organization_id, engagement_id, athlete_profile_id, scope_key, policy_version_id, granted_by_profile_id) values ($1, $2, $3, $4, 'activities', $5, $4)",
        [ids.replacementConsent, ids.org, ids.engagement, ids.athlete, ids.policy],
      );
      await db.query(
        "update public.athlete_data_sharing_consents set superseded_by_consent_id = $1 where id = $2",
        [ids.replacementConsent, ids.consent],
      );
      await db.query("commit");
      await expectFailure(
        () =>
          db.query(
            "update public.athlete_data_sharing_consents set granted_at = granted_at + interval '1 second' where id = $1",
            [ids.replacementConsent],
          ),
        "consent authority rewrite",
      );
      await expectFailure(
        () =>
          db.query("delete from public.athlete_data_sharing_consents where id = $1", [
            ids.replacementConsent,
          ]),
        "consent deletion",
      );
      await db.query(
        "insert into public.athlete_consent_policy_versions (id, scope_key, effective_from, jurisdiction, terms_text, content_digest) values ($1, 'training', now(), 'US', 'training terms', 'sha256:training')",
        [ids.trainingPolicy],
      );
      await db.query(
        "insert into public.athlete_data_sharing_consents (id, organization_id, engagement_id, athlete_profile_id, scope_key, policy_version_id, granted_by_profile_id, ended_at) values ($1, $2, $3, $4, 'training', $5, $4, now())",
        [ids.chronologyConsent, ids.org, ids.engagement, ids.athlete, ids.trainingPolicy],
      );
      await db.query(
        "insert into public.athlete_data_sharing_consents (id, organization_id, engagement_id, athlete_profile_id, scope_key, policy_version_id, granted_by_profile_id, granted_at) values ($1, $2, $3, $4, 'training', $5, $4, now() - interval '1 hour')",
        [ids.invalidSuccessorConsent, ids.org, ids.engagement, ids.athlete, ids.trainingPolicy],
      );
      await expectFailure(
        () =>
          db.query(
            "update public.athlete_data_sharing_consents set superseded_by_consent_id = $1 where id = $2",
            [ids.invalidSuccessorConsent, ids.chronologyConsent],
          ),
        "chronologically invalid consent supersession",
      );
      await db.query(
        "update public.athlete_data_sharing_consents set ended_at = now() where id = $1",
        [ids.invalidSuccessorConsent],
      );
      await expectFailure(
        () =>
          db.query(
            "update public.athlete_data_sharing_consents set superseded_by_consent_id = $1 where id = $2",
            [ids.invalidSuccessorConsent, ids.chronologyConsent],
          ),
        "ended consent successor",
      );
      await expectFailure(
        () =>
          db.query(
            "update public.athlete_data_sharing_consents set ended_at = now(), superseded_by_consent_id = $1 where id = $2",
            [ids.consent, ids.replacementConsent],
          ),
        "cyclic consent supersession",
      );
      await db.query("update public.coaching_engagements set ended_at = now() where id = $1", [
        ids.engagement,
      ]);
      await expectFailure(
        () =>
          db.query("update public.coaching_engagements set ended_at = now() where id = $1", [
            ids.engagement,
          ]),
        "engagement end rewrite",
      );
      await expectFailure(
        () => db.query("delete from public.organizations where id = $1", [ids.org]),
        "organization cascade deletion",
      );
      const audit = await db.query<{ id: string }>(
        "insert into public.organization_audit_events (organization_id, action, resource_type, details) values ($1, 'bootstrap', 'organization', '{}'::jsonb) returning id",
        [ids.org],
      );
      const auditId = audit.rows[0]?.id;
      if (!auditId) throw new Error("audit insert did not return an id");
      await expectFailure(
        () =>
          db.query("update public.organization_audit_events set action = 'mutated' where id = $1", [
            auditId,
          ]),
        "audit mutation",
      );
      await expectFailure(
        () => db.query("delete from public.organization_audit_events where id = $1", [auditId]),
        "audit deletion",
      );
      await expectFailure(
        () =>
          db.query(
            "insert into public.organization_audit_events (organization_id, actor_profile_id, actor_membership_id, action, resource_type, details) values ($1, $2, $3, 'mismatch', 'organization', '{}'::jsonb)",
            [ids.org, ids.athlete, ids.coachMembership],
          ),
        "audit actor membership/profile mismatch",
      );
      await db.query(
        "insert into public.organization_audit_events (organization_id, actor_profile_id, actor_membership_id, action, resource_type, details) values ($1, $2, $3, 'matched', 'organization', '{}'::jsonb)",
        [ids.org, ids.coach, ids.coachMembership],
      );

      await db.query(
        `create role ${aclProbeRole} login password 'coaching-acl-probe-only' nosuperuser nobypassrls inherit`,
      );
      await db.query(`grant service_role to ${aclProbeRole}`);
      const probeAttributes = await db.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
        "select rolsuper, rolbypassrls from pg_roles where rolname = $1",
        [aclProbeRole],
      );
      if (probeAttributes.rows[0]?.rolsuper || probeAttributes.rows[0]?.rolbypassrls) {
        throw new Error("ACL probe inherited privileged role attributes");
      }
      // This checks repository ACL/RLS state only; it does not prove deployed request identity or production role behavior.
      const probeUrl = new URL(targetUrl);
      probeUrl.username = aclProbeRole;
      probeUrl.password = "coaching-acl-probe-only";
      const probe = new Pool({ connectionString: probeUrl.toString(), max: 1 });
      try {
        const probeRead = await probe.query<{ count: number }>(
          "select count(*)::int as count from public.athlete_consent_policy_versions",
        );
        if (probeRead.rows[0]?.count !== 0) throw new Error("ACL probe bypassed default-deny RLS");
        await expectFailure(
          () =>
            probe.query(
              "insert into public.organization_membership_role_grants (organization_id, membership_id, role_key) values ('20000000-0000-4000-8000-000000000101', '30000000-0000-4000-8000-000000000103', 'coach')",
            ),
          "service-role grant inherited governance insert",
        );
        await expectFailure(
          () =>
            probe.query("update public.athlete_consent_policy_versions set terms_text = 'blocked'"),
          "service-role grant inherited governance update",
        );
        await expectFailure(
          () => probe.query("delete from public.athlete_consent_policy_versions"),
          "service-role grant inherited governance delete",
        );
        await expectFailure(
          () => probe.query("truncate public.organization_audit_events"),
          "service-role grant inherited audit truncate",
        );
      } finally {
        await probe.end();
      }
      await db.query(`revoke service_role from ${aclProbeRole}`);
      await db.query(`drop role ${aclProbeRole}`);

      await db.query("begin");
      await db.query("set local role authenticated");
      await expectFailure(
        () => db.query("select * from public.coaching_engagements"),
        "authenticated direct coaching read",
      );
      await db.query("rollback");
    },
  );
  console.log(
    "[db:coaching:foundation] disposable constraints, immutable authority evidence, ACL grants, and default-deny RLS checks passed",
  );
}

main().catch((error) => {
  console.error(
    `[db:coaching:foundation] ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
