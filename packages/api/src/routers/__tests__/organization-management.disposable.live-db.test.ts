import { createHash, randomUUID } from "node:crypto";
import { createDbClient, type DrizzleDbClient } from "@repo/db/client";
import {
  athleteConsentPolicyVersions,
  athleteDataSharingConsents,
  coachingEngagements,
  organizationAuditEvents,
  organizationGroupAthletes,
  organizationGroupCoachAssignments,
  organizationInvitations,
  organizationMembershipRoleGrants,
  organizationMemberships,
  organizations,
  profiles,
  users,
} from "@repo/db/schema";
import {
  applySqlFile,
  bootstrapSupabaseSchemas,
  requireFreshBaseline,
  withDisposableDatabase,
} from "@repo/db/testing/disposable-database";
import { and, eq, sql } from "drizzle-orm";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { createOrganizationAccessRepository } from "../../repositories/organization-access-repository";
import { createOrganizationManagementRepository } from "../../repositories/organization-management-repository";
import { organizationsRouter } from "../organizations";

function caller(db: DrizzleDbClient, userId: string) {
  return organizationsRouter.createCaller({
    auth: {
      lookupInput: { clientType: "web", headers: new Headers() },
      session: null,
    },
    authSession: null,
    clientType: "web",
    db,
    headers: new Headers(),
    session: { user: { id: userId, email: "untrusted-session@example.test" } },
    trpcSource: "vitest-live-db",
  } as never);
}

async function acceptAthleteInvitation(invitationCaller: ReturnType<typeof caller>, token: string) {
  const preview = await invitationCaller.invitations.preview({ token });
  if (preview.kind !== "athlete" || !preview.agreement)
    throw new Error("expected athlete invitation with a reviewable agreement");
  return invitationCaller.invitations.accept({
    token,
    acknowledgement: {
      version: preview.agreement.version,
      digest: preview.agreement.digest,
      accepted: true,
    },
  });
}

async function athleteAcknowledgement(invitationCaller: ReturnType<typeof caller>, token: string) {
  const preview = await invitationCaller.invitations.preview({ token });
  if (preview.kind !== "athlete" || !preview.agreement)
    throw new Error("expected athlete invitation with a reviewable agreement");
  return {
    version: preview.agreement.version,
    digest: preview.agreement.digest,
    accepted: true as const,
  };
}

async function person(db: DrizzleDbClient, label: string, verified = true) {
  const id = randomUUID();
  const email = `${label}-${id}@organization-management.test`;
  await db.insert(users).values({ id, name: label, email, emailVerified: verified });
  await db.insert(profiles).values({
    id,
    email: `${label}-profile-${id}@organization-management.test`,
    full_name: label,
    username: `${label}-${id.slice(0, 8)}`,
    onboarding_status: "completed",
    is_public: false,
  });
  return { id, email };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function waitForDatabaseLock(predicate: () => Promise<boolean>, attempts = 30) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("timed out waiting for the acceptance transaction to block on the user row");
}

describe("organization management against a disposable migrated PostgreSQL database", () => {
  it("rolls back every acceptance effect when the final immutable policy conflicts", async () => {
    await withDisposableDatabase(
      ["--disposable", "--local"],
      "invitation_policy_conflict",
      async (pool, url) => {
        await bootstrapSupabaseSchemas(pool);
        for (const path of requireFreshBaseline().migrationPaths) await applySqlFile(pool, path);
        const client = createDbClient({ url });
        try {
          const owner = await person(client.db, "policy-owner");
          const athlete = await person(client.db, "policy-athlete");
          const ownerCaller = caller(client.db, owner.id);
          const recipient = caller(client.db, athlete.id);
          const organizationId = randomUUID();
          await ownerCaller.create({
            organizationId,
            name: "Atomic consent",
            slug: `atomic-${organizationId}`,
            timezone: "UTC",
          });
          const invite = await ownerCaller.invitations.create({
            organizationId,
            kind: "athlete",
            requestedRole: null,
            recipientProfileId: athlete.id,
            recipientEmail: null,
            expiresAt: new Date(Date.now() + 60000),
          });
          const acknowledgement = await athleteAcknowledgement(recipient, invite.token);
          // Insert immutable conflicting content before acceptance, never update or disable its guard.
          const conflictId = "90a36147-502a-4df1-8f9f-e67d43e27006";
          await client.db.insert(athleteConsentPolicyVersions).values({
            id: conflictId,
            scope_key: "calendar",
            jurisdiction: "US",
            effective_from: new Date("2026-11-04T00:00:00.000Z"),
            terms_text: "Conflicting fixture policy",
            content_digest: "conflicting-fixture-digest",
          });
          await expect(
            recipient.invitations.acceptById({
              invitationId: invite.invitationId,
              acknowledgement,
            }),
          ).rejects.toMatchObject({ code: "CONFLICT" });
          expect(
            await client.db.select({ id: coachingEngagements.id }).from(coachingEngagements),
          ).toEqual([]);
          expect(
            await client.db
              .select({ id: athleteDataSharingConsents.id })
              .from(athleteDataSharingConsents),
          ).toEqual([]);
          expect(
            await client.db
              .select({ id: athleteConsentPolicyVersions.id })
              .from(athleteConsentPolicyVersions),
          ).toEqual([{ id: conflictId }]);
          expect(
            await client.db
              .select({ status: organizationInvitations.status })
              .from(organizationInvitations)
              .where(eq(organizationInvitations.id, invite.invitationId)),
          ).toEqual([{ status: "pending" }]);
          expect(
            await client.db
              .select({ id: organizationAuditEvents.id })
              .from(organizationAuditEvents)
              .where(eq(organizationAuditEvents.resource_id, invite.invitationId)),
          ).toEqual([]);
        } finally {
          await client.close();
        }
      },
    );
  });
  it("commits setup/invitation lifecycles atomically and rejects cross-tenant or invalid acceptance", async () => {
    await withDisposableDatabase(
      ["--disposable", "--local"],
      "organization_management",
      async (pool, url) => {
        await bootstrapSupabaseSchemas(pool);
        for (const migration of requireFreshBaseline().migrationPaths)
          await applySqlFile(pool, migration);
        const client = createDbClient({ url });
        try {
          const owner = await person(client.db, "owner");
          const other = await person(client.db, "other");
          const recipient = await person(client.db, "recipient");
          const unverified = await person(client.db, "unverified", false);
          const authorityLossRecipient = await person(client.db, "authority-loss-recipient");
          const canonicalRaceRecipient = await person(client.db, "canonical-race-recipient");
          const futureAdministrator = await person(client.db, "future-administrator");
          const ownerCaller = caller(client.db, owner.id);
          const organizationId = randomUUID();
          const created = await ownerCaller.create({
            organizationId,
            name: "Peak",
            slug: `peak-${organizationId}`,
            timezone: "UTC",
          });
          await expect(
            ownerCaller.create({
              organizationId,
              name: "Peak",
              slug: `peak-${organizationId}`,
              timezone: "UTC",
            }),
          ).resolves.toEqual(created);
          await expect(
            ownerCaller.create({
              organizationId,
              name: "Peak changed",
              slug: `peak-${organizationId}`,
              timezone: "UTC",
            }),
          ).rejects.toMatchObject({ code: "CONFLICT" });
          await expect(
            caller(client.db, other.id).create({
              organizationId,
              name: "Other",
              slug: `other-${organizationId}`,
              timezone: "UTC",
            }),
          ).rejects.toMatchObject({ code: "CONFLICT" });
          const secondOrganizationId = randomUUID();
          await ownerCaller.create({
            organizationId: secondOrganizationId,
            name: "Second Peak",
            slug: `second-${secondOrganizationId}`,
            timezone: "UTC",
          });
          const secondInvite = await ownerCaller.invitations.create({
            organizationId: secondOrganizationId,
            kind: "athlete",
            requestedRole: null,
            recipientProfileId: other.id,
            recipientEmail: null,
            expiresAt: new Date(Date.now() + 60_000),
          });
          await expect(
            ownerCaller.invitations.revoke({
              organizationId,
              invitationId: secondInvite.invitationId,
            }),
          ).rejects.toMatchObject({ code: "NOT_FOUND" });
          const root = await createOrganizationAccessRepository(
            client.db,
          ).findActiveMembershipContext({
            organizationId,
            profileId: owner.id,
          });
          expect(root).toMatchObject({
            membershipId: created.membershipId,
            roleKeys: ["admin"],
          });
          const futureMembershipId = randomUUID();
          await client.db.insert(organizationMemberships).values({
            id: futureMembershipId,
            organization_id: organizationId,
            profile_id: futureAdministrator.id,
          });
          await client.db.insert(organizationMembershipRoleGrants).values({
            organization_id: organizationId,
            membership_id: futureMembershipId,
            role_key: "admin",
            granted_at: new Date(Date.now() + 60_000),
          });
          await expect(
            caller(client.db, futureAdministrator.id).invitations.create({
              organizationId,
              kind: "staff",
              requestedRole: "coach",
              recipientProfileId: authorityLossRecipient.id,
              recipientEmail: null,
              expiresAt: new Date(Date.now() + 60_000),
            }),
          ).rejects.toMatchObject({ code: "FORBIDDEN" });

          const canonicalRace = await ownerCaller.invitations.create({
            organizationId,
            kind: "athlete",
            requestedRole: null,
            recipientProfileId: null,
            recipientEmail: canonicalRaceRecipient.email,
            expiresAt: new Date(Date.now() + 60_000),
          });
          const canonicalAcknowledgement = await athleteAcknowledgement(
            caller(client.db, canonicalRaceRecipient.id),
            canonicalRace.token,
          );
          const identityPool = new Pool({ connectionString: url, max: 1 });
          const activityPool = new Pool({ connectionString: url, max: 1 });
          const identityConnection = await identityPool.connect();
          try {
            await identityConnection.query("begin");
            await identityConnection.query("select id from users where id = $1 for update", [
              canonicalRaceRecipient.id,
            ]);
            const acceptance = caller(client.db, canonicalRaceRecipient.id).invitations.accept({
              token: canonicalRace.token,
              acknowledgement: canonicalAcknowledgement,
            });
            await waitForDatabaseLock(async () => {
              const result = await activityPool.query<{ waiting: boolean }>(
                "select exists (select 1 from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock' and query like '%users%') as waiting",
              );
              return result.rows[0]?.waiting === true;
            });
            await identityConnection.query("update users set email = $1 where id = $2", [
              `changed-${canonicalRaceRecipient.id}@organization-management.test`,
              canonicalRaceRecipient.id,
            ]);
            await identityConnection.query("commit");
            await expect(acceptance).rejects.toMatchObject({
              code: "FORBIDDEN",
            });
            await expect(
              client.db
                .select({ status: organizationInvitations.status })
                .from(organizationInvitations)
                .where(eq(organizationInvitations.id, canonicalRace.invitationId)),
            ).resolves.toEqual([{ status: "pending" }]);
            await expect(
              client.db
                .select({ id: coachingEngagements.id })
                .from(coachingEngagements)
                .where(eq(coachingEngagements.athlete_profile_id, canonicalRaceRecipient.id)),
            ).resolves.toHaveLength(0);
          } finally {
            await identityConnection.query("rollback").catch(() => undefined);
            identityConnection.release();
            await identityPool.end();
            await activityPool.end();
          }

          const canonicalRaceDigestRow = (
            await client.db
              .select({ digest: organizationInvitations.token_digest })
              .from(organizationInvitations)
              .where(eq(organizationInvitations.id, canonicalRace.invitationId))
          )[0];
          const canonicalRaceDigest = canonicalRaceDigestRow?.digest;
          if (!canonicalRaceDigest) throw new Error("expected canonical-race invitation digest");
          const lockClient = createDbClient({ url });
          const probePool = new Pool({ connectionString: url, max: 2 });
          try {
            const identityLocked = deferred();
            const releaseIdentity = deferred();
            const identityTransaction = lockClient.db.transaction(async (tx) => {
              const repository = createOrganizationManagementRepository(tx);
              await repository.lockOrganization(organizationId);
              await repository.recipient(canonicalRaceRecipient.id);
              identityLocked.resolve();
              await releaseIdentity.promise;
            });
            await identityLocked.promise;
            const updater = await probePool.connect();
            const observer = await probePool.connect();
            try {
              const emailUpdate = updater.query("update users set email = $1 where id = $2", [
                canonicalRaceRecipient.email,
                canonicalRaceRecipient.id,
              ]);
              await expect(
                observer.query("select id from users where id = $1 for update nowait", [
                  canonicalRaceRecipient.id,
                ]),
              ).rejects.toMatchObject({ code: "55P03" });
              releaseIdentity.resolve();
              await identityTransaction;
              await expect(emailUpdate).resolves.toBeDefined();
            } finally {
              updater.release();
              observer.release();
            }

            const discoveryComplete = deferred();
            const releaseDiscovery = deferred();
            const discoveryTransaction = lockClient.db.transaction(async (tx) => {
              const repository = createOrganizationManagementRepository(tx);
              await repository.lockOrganization(organizationId);
              await repository.findInvitation(canonicalRaceDigest);
              discoveryComplete.resolve();
              await releaseDiscovery.promise;
            });
            await discoveryComplete.promise;
            const invitationLocker = await probePool.connect();
            try {
              await expect(
                invitationLocker.query(
                  "select id from organization_invitations where id = $1 for update nowait",
                  [canonicalRace.invitationId],
                ),
              ).resolves.toBeDefined();
            } finally {
              invitationLocker.release();
              releaseDiscovery.resolve();
              await discoveryTransaction;
            }
          } finally {
            await lockClient.close();
            await probePool.end();
          }

          const staff = await ownerCaller.invitations.create({
            organizationId,
            kind: "staff",
            requestedRole: "coach",
            recipientProfileId: null,
            recipientEmail: recipient.email,
            expiresAt: new Date(Date.now() + 60_000),
          });
          const [stored] = await client.db
            .select({ digest: organizationInvitations.token_digest })
            .from(organizationInvitations)
            .where(eq(organizationInvitations.id, staff.invitationId));
          expect(stored?.digest).not.toBe(staff.token);
          await expect(
            caller(client.db, other.id).invitations.accept({
              token: staff.token,
            }),
          ).rejects.toMatchObject({ code: "FORBIDDEN" });
          await expect(
            caller(client.db, unverified.id).invitations.accept({
              token: staff.token,
            }),
          ).rejects.toMatchObject({ code: "FORBIDDEN" });
          const recipientCaller = caller(client.db, recipient.id);
          await expect(
            recipientCaller.invitations.accept({ token: staff.token }),
          ).resolves.toMatchObject({ status: "accepted", organizationId });
          await expect(
            recipientCaller.invitations.accept({ token: staff.token }),
          ).resolves.toMatchObject({ status: "accepted" });
          const grants = await client.db
            .select()
            .from(organizationMembershipRoleGrants)
            .innerJoin(
              organizationMemberships,
              eq(organizationMembershipRoleGrants.membership_id, organizationMemberships.id),
            )
            .where(
              and(
                eq(organizationMemberships.organization_id, organizationId),
                eq(organizationMemberships.profile_id, recipient.id),
              ),
            );
          expect(grants).toHaveLength(1);
          const [recipientMembership] = await client.db
            .select({ id: organizationMemberships.id })
            .from(organizationMemberships)
            .where(
              and(
                eq(organizationMemberships.organization_id, organizationId),
                eq(organizationMemberships.profile_id, recipient.id),
              ),
            );
          if (!recipientMembership) throw new Error("expected staff membership");
          await client.db
            .update(organizationMemberships)
            .set({ ended_at: new Date() })
            .where(eq(organizationMemberships.id, recipientMembership.id));
          const endedStaffInvitation = await ownerCaller.invitations.create({
            organizationId,
            kind: "staff",
            requestedRole: "coach",
            recipientProfileId: recipient.id,
            recipientEmail: null,
            expiresAt: new Date(Date.now() + 60_000),
          });
          await expect(
            recipientCaller.invitations.accept({
              token: endedStaffInvitation.token,
            }),
          ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });

          const athlete = await ownerCaller.invitations.create({
            organizationId,
            kind: "athlete",
            requestedRole: null,
            recipientProfileId: recipient.id,
            recipientEmail: null,
            expiresAt: new Date(Date.now() + 60_000),
          });
          const athleteAck = await athleteAcknowledgement(recipientCaller, athlete.token);
          await recipientCaller.invitations.accept({
            token: athlete.token,
            acknowledgement: athleteAck,
          });
          await recipientCaller.invitations.accept({
            token: athlete.token,
            acknowledgement: athleteAck,
          });
          const engagements = await client.db
            .select()
            .from(coachingEngagements)
            .where(
              and(
                eq(coachingEngagements.organization_id, organizationId),
                eq(coachingEngagements.athlete_profile_id, recipient.id),
              ),
            );
          expect(engagements).toHaveLength(1);
          const engagement = engagements[0];
          if (!engagement) throw new Error("expected athlete engagement");
          const consents = await client.db
            .select()
            .from(athleteDataSharingConsents)
            .where(eq(athleteDataSharingConsents.engagement_id, engagement.id));
          expect(consents.map((consent) => consent.scope_key).sort()).toEqual([
            "activities",
            "basic_profile",
            "calendar",
            "goals",
            "metrics",
            "training",
          ]);

          const revoked = await ownerCaller.invitations.create({
            organizationId,
            kind: "athlete",
            requestedRole: null,
            recipientProfileId: other.id,
            recipientEmail: null,
            expiresAt: new Date(Date.now() + 60_000),
          });
          await ownerCaller.invitations.revoke({
            organizationId,
            invitationId: revoked.invitationId,
          });
          await expect(
            caller(client.db, other.id).invitations.accept({
              token: revoked.token,
            }),
          ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
          const expired = await ownerCaller.invitations.create({
            organizationId,
            kind: "athlete",
            requestedRole: null,
            recipientProfileId: other.id,
            recipientEmail: null,
            expiresAt: new Date(Date.now() + 1_000),
          });
          await new Promise((resolve) => setTimeout(resolve, 1_100));
          await expect(
            caller(client.db, other.id).invitations.accept({
              token: expired.token,
            }),
          ).rejects.toMatchObject({ code: "FORBIDDEN" });

          // A durable roleless root is forbidden by the database trigger. The
          // unit suite covers the repository's transient-safe left join.
          await expect(
            client.db
              .update(organizationMembershipRoleGrants)
              .set({ revoked_at: new Date() })
              .where(eq(organizationMembershipRoleGrants.membership_id, created.membershipId)),
          ).rejects.toThrow("Failed query");

          const administrator = await ownerCaller.invitations.create({
            organizationId,
            kind: "staff",
            requestedRole: "admin",
            recipientProfileId: other.id,
            recipientEmail: null,
            expiresAt: new Date(Date.now() + 60_000),
          });
          await caller(client.db, other.id).invitations.accept({
            token: administrator.token,
          });
          const [otherMembership] = await client.db
            .select({ id: organizationMemberships.id })
            .from(organizationMemberships)
            .where(
              and(
                eq(organizationMemberships.organization_id, organizationId),
                eq(organizationMemberships.profile_id, other.id),
              ),
            );
          if (!otherMembership) throw new Error("expected administrator membership");
          await expect(
            caller(client.db, other.id).invitations.create({
              organizationId,
              kind: "staff",
              requestedRole: "admin",
              recipientProfileId: authorityLossRecipient.id,
              recipientEmail: null,
              expiresAt: new Date(Date.now() + 60_000),
            }),
          ).rejects.toMatchObject({ code: "FORBIDDEN" });
          const rootAdminInvite = await ownerCaller.invitations.create({
            organizationId,
            kind: "staff",
            requestedRole: "admin",
            recipientProfileId: authorityLossRecipient.id,
            recipientEmail: null,
            expiresAt: new Date(Date.now() + 60_000),
          });
          await expect(
            caller(client.db, other.id).invitations.revoke({
              organizationId,
              invitationId: rootAdminInvite.invitationId,
            }),
          ).rejects.toMatchObject({ code: "FORBIDDEN" });
          const staleInvite = await caller(client.db, other.id).invitations.create({
            organizationId,
            kind: "staff",
            requestedRole: "coach",
            recipientProfileId: authorityLossRecipient.id,
            recipientEmail: null,
            expiresAt: new Date(Date.now() + 60_000),
          });
          await client.db
            .update(organizationMembershipRoleGrants)
            .set({ revoked_at: new Date() })
            .where(
              and(
                eq(organizationMembershipRoleGrants.membership_id, otherMembership.id),
                eq(organizationMembershipRoleGrants.role_key, "admin"),
              ),
            );
          await expect(
            caller(client.db, authorityLossRecipient.id).invitations.accept({
              token: staleInvite.token,
            }),
          ).rejects.toMatchObject({ code: "FORBIDDEN" });
          await expect(
            client.db
              .select({ id: organizationMemberships.id })
              .from(organizationMemberships)
              .where(eq(organizationMemberships.profile_id, authorityLossRecipient.id)),
          ).resolves.toHaveLength(0);
          await expect(
            client.db
              .select({ status: organizationInvitations.status })
              .from(organizationInvitations)
              .where(eq(organizationInvitations.id, staleInvite.invitationId)),
          ).resolves.toEqual([{ status: "pending" }]);
          await expect(
            client.db
              .select({ id: organizations.id })
              .from(organizations)
              .where(eq(organizations.id, organizationId)),
          ).resolves.toHaveLength(1);

          // Database constraint rollback proof only; router/application late-failure
          // injection is intentionally not introduced into production code.
          const rollbackOrganizationId = randomUUID();
          await expect(
            client.db.transaction(async (tx) => {
              await tx.execute(sql`set constraints all deferred`);
              await tx.insert(organizations).values({
                id: rollbackOrganizationId,
                created_by_profile_id: owner.id,
                root_owner_membership_id: randomUUID(),
                name: "Rollback must fail",
                slug: `rollback-${rollbackOrganizationId}`,
                timezone: "UTC",
              });
            }),
          ).rejects.toThrow();
          await expect(
            client.db
              .select({ id: organizations.id })
              .from(organizations)
              .where(eq(organizations.id, rollbackOrganizationId)),
          ).resolves.toHaveLength(0);
        } finally {
          await client.close();
        }
      },
    );
  }, 90_000);

  it("requires exact athlete consent acknowledgement and atomically grants all read scopes", async () => {
    await withDisposableDatabase(
      ["--disposable", "--local"],
      "invitation_consent",
      async (pool, url) => {
        await bootstrapSupabaseSchemas(pool);
        for (const migration of requireFreshBaseline().migrationPaths)
          await applySqlFile(pool, migration);
        const client = createDbClient({ url });
        try {
          const owner = await person(client.db, "consent-owner");
          const athlete = await person(client.db, "consent-athlete");
          const declined = await person(client.db, "consent-declined");
          const other = await person(client.db, "consent-other");
          const unverified = await person(client.db, "consent-unverified", false);
          const organizationId = randomUUID();
          const ownerCaller = caller(client.db, owner.id);
          await ownerCaller.create({
            organizationId,
            name: "Consent",
            slug: `consent-${organizationId}`,
            timezone: "UTC",
          });
          const createAthleteInvite = (recipientProfileId: string) =>
            ownerCaller.invitations.create({
              organizationId,
              kind: "athlete",
              requestedRole: null,
              recipientProfileId,
              recipientEmail: null,
              expiresAt: new Date(Date.now() + 60_000),
            });
          const invitation = await createAthleteInvite(athlete.id);
          const athleteCaller = caller(client.db, athlete.id);
          const preview = await athleteCaller.invitations.preview({ token: invitation.token });
          expect(preview.agreement?.scopes).toEqual([
            "basic_profile",
            "training",
            "activities",
            "metrics",
            "goals",
            "calendar",
          ]);
          await expect(
            caller(client.db, other.id).invitations.previewById({
              invitationId: invitation.invitationId,
            }),
          ).rejects.toMatchObject({ code: "FORBIDDEN" });
          await expect(
            caller(client.db, unverified.id).invitations.previewById({
              invitationId: invitation.invitationId,
            }),
          ).rejects.toMatchObject({ code: "FORBIDDEN" });
          await expect(
            athleteCaller.invitations.previewById({ invitationId: randomUUID() }),
          ).rejects.toMatchObject({ code: "FORBIDDEN" });
          for (const attempt of [
            { actor: other.id, invitationId: invitation.invitationId },
            { actor: unverified.id, invitationId: invitation.invitationId },
            { actor: athlete.id, invitationId: randomUUID() },
          ]) {
            await expect(
              caller(client.db, attempt.actor).invitations.acceptById({
                invitationId: attempt.invitationId,
              }),
            ).rejects.toMatchObject({ code: "FORBIDDEN" });
            await expect(
              caller(client.db, attempt.actor).invitations.declineById({
                invitationId: attempt.invitationId,
              }),
            ).rejects.toMatchObject({ code: "FORBIDDEN" });
          }
          for (const acknowledgement of [
            undefined,
            {
              version: "stale-v0",
              digest: preview.agreement?.digest ?? "",
              accepted: true as const,
            },
            {
              version: preview.agreement?.version ?? "",
              digest: `sha256:${"0".repeat(64)}`,
              accepted: true as const,
            },
          ])
            await expect(
              athleteCaller.invitations.accept({
                token: invitation.token,
                ...(acknowledgement ? { acknowledgement } : {}),
              }),
            ).rejects.toMatchObject({ code: "CONFLICT" });
          await expect(client.db.select().from(coachingEngagements)).resolves.toHaveLength(0);
          await expect(client.db.select().from(athleteDataSharingConsents)).resolves.toHaveLength(
            0,
          );

          const acknowledgement = await athleteAcknowledgement(athleteCaller, invitation.token);
          await athleteCaller.invitations.acceptById({
            invitationId: invitation.invitationId,
            acknowledgement,
          });
          const [engagement] = await client.db.select().from(coachingEngagements);
          if (!engagement) throw new Error("expected accepted engagement");
          await expect(
            client.db
              .select({ scope: athleteDataSharingConsents.scope_key })
              .from(athleteDataSharingConsents)
              .where(eq(athleteDataSharingConsents.engagement_id, engagement.id)),
          ).resolves.toEqual([
            { scope: "basic_profile" },
            { scope: "training" },
            { scope: "activities" },
            { scope: "metrics" },
            { scope: "goals" },
            { scope: "calendar" },
          ]);
          await expect(
            client.db
              .select({ details: organizationAuditEvents.details })
              .from(organizationAuditEvents)
              .where(eq(organizationAuditEvents.resource_id, invitation.invitationId)),
          ).resolves.toEqual([
            expect.objectContaining({
              details: expect.objectContaining({ agreementVersion: acknowledgement.version }),
            }),
          ]);
          await client.db.update(athleteDataSharingConsents).set({ ended_at: new Date() });
          await athleteCaller.invitations.acceptById({
            invitationId: invitation.invitationId,
            acknowledgement,
          });
          await expect(
            client.db
              .select()
              .from(athleteDataSharingConsents)
              .where(sql`${athleteDataSharingConsents.ended_at} is null`),
          ).resolves.toHaveLength(0);

          const emailRecipient = await person(client.db, "consent-email-recipient");
          await client.db
            .update(coachingEngagements)
            .set({ ended_at: new Date() })
            .where(eq(coachingEngagements.id, engagement.id));
          const reinvite = await ownerCaller.invitations.create({
            organizationId,
            kind: "athlete",
            requestedRole: null,
            recipientProfileId: athlete.id,
            recipientEmail: null,
            expiresAt: new Date(Date.now() + 60000),
          });
          await acceptAthleteInvitation(athleteCaller, reinvite.token);
          const history = await client.db
            .select({ id: coachingEngagements.id, endedAt: coachingEngagements.ended_at })
            .from(coachingEngagements)
            .where(
              and(
                eq(coachingEngagements.organization_id, organizationId),
                eq(coachingEngagements.athlete_profile_id, athlete.id),
              ),
            );
          expect(history).toHaveLength(2);
          expect(history.find((row) => row.id === engagement.id)?.endedAt).toBeInstanceOf(Date);
          expect(history.filter((row) => row.endedAt === null)).toHaveLength(1);
          expect(
            await client.db
              .select({ id: athleteDataSharingConsents.id })
              .from(athleteDataSharingConsents)
              .where(
                and(
                  eq(athleteDataSharingConsents.engagement_id, engagement.id),
                  sql`${athleteDataSharingConsents.ended_at} is null`,
                ),
              ),
          ).toEqual([]);
          const emailInvite = await ownerCaller.invitations.create({
            organizationId,
            kind: "athlete",
            requestedRole: null,
            recipientProfileId: null,
            recipientEmail: emailRecipient.email.toUpperCase(),
            expiresAt: new Date(Date.now() + 60_000),
          });
          const emailCaller = caller(client.db, emailRecipient.id);
          const emailPreview = await emailCaller.invitations.previewById({
            invitationId: emailInvite.invitationId,
          });
          if (!emailPreview.agreement) throw new Error("expected email-recipient agreement");
          await emailCaller.invitations.declineById({ invitationId: emailInvite.invitationId });

          const declinedInvite = await createAthleteInvite(declined.id);
          await caller(client.db, declined.id).invitations.decline({ token: declinedInvite.token });
          await expect(
            client.db
              .select()
              .from(coachingEngagements)
              .where(eq(coachingEngagements.athlete_profile_id, declined.id)),
          ).resolves.toHaveLength(0);
        } finally {
          await client.close();
        }
      },
    );
  }, 90_000);

  it("keeps token previews and recipient declines private, canonical, and serialized", async () => {
    await withDisposableDatabase(
      ["--disposable", "--local"],
      "organization_invitation_response",
      async (pool, url) => {
        await bootstrapSupabaseSchemas(pool);
        for (const migration of requireFreshBaseline().migrationPaths)
          await applySqlFile(pool, migration);
        const client = createDbClient({ url });
        try {
          const owner = await person(client.db, "response-owner");
          const recipient = await person(client.db, "response-recipient");
          const outsider = await person(client.db, "response-outsider");
          const unverified = await person(client.db, "response-unverified", false);
          const organizationId = randomUUID();
          const ownerCaller = caller(client.db, owner.id);
          const created = await ownerCaller.create({
            organizationId,
            name: "Response Peak",
            slug: `response-${organizationId}`,
            timezone: "UTC",
          });
          const invite = await ownerCaller.invitations.create({
            organizationId,
            kind: "athlete",
            requestedRole: null,
            recipientProfileId: null,
            recipientEmail: recipient.email,
            expiresAt: new Date(Date.now() + 60_000),
          });
          const recipientCaller = caller(client.db, recipient.id);
          await expect(
            recipientCaller.invitations.preview({ token: invite.token }),
          ).resolves.toEqual(
            expect.objectContaining({
              invitationId: invite.invitationId,
              organizationId,
              organizationName: "Response Peak",
              kind: "athlete",
              requestedRole: null,
            }),
          );
          // The caller's session email is deliberately untrusted; canonical
          // users.email/emailVerified determines recipient authorization.
          await expect(
            caller(client.db, outsider.id).invitations.preview({ token: invite.token }),
          ).rejects.toMatchObject({
            code: "FORBIDDEN",
          });
          await expect(
            caller(client.db, unverified.id).invitations.preview({ token: invite.token }),
          ).rejects.toMatchObject({
            code: "FORBIDDEN",
          });
          await expect(
            recipientCaller.invitations.preview({ token: "x".repeat(43) }),
          ).rejects.toMatchObject({
            code: "FORBIDDEN",
          });
          await expect(
            recipientCaller.invitations.decline({ token: invite.token }),
          ).resolves.toEqual({
            invitationId: invite.invitationId,
            status: "declined",
          });
          await expect(
            recipientCaller.invitations.decline({ token: invite.token }),
          ).resolves.toEqual({
            invitationId: invite.invitationId,
            status: "declined",
          });
          await expect(
            caller(client.db, outsider.id).invitations.decline({ token: invite.token }),
          ).rejects.toMatchObject({
            code: "FORBIDDEN",
          });
          await expect(
            recipientCaller.invitations.preview({ token: invite.token }),
          ).rejects.toMatchObject({
            code: "FORBIDDEN",
          });
          const [declined] = await client.db
            .select({
              status: organizationInvitations.status,
              actor: organizationInvitations.declined_by_profile_id,
            })
            .from(organizationInvitations)
            .where(eq(organizationInvitations.id, invite.invitationId));
          expect(declined).toEqual({ status: "declined", actor: recipient.id });
          await expect(
            client.db
              .select({
                actor: organizationAuditEvents.actor_profile_id,
                action: organizationAuditEvents.action,
                resourceId: organizationAuditEvents.resource_id,
                details: organizationAuditEvents.details,
              })
              .from(organizationAuditEvents)
              .where(eq(organizationAuditEvents.resource_id, invite.invitationId)),
          ).resolves.toEqual([
            {
              actor: recipient.id,
              action: "organization_invitation.declined",
              resourceId: invite.invitationId,
              details: {},
            },
          ]);

          const expiredToken = `${randomUUID()}${randomUUID()}`;
          const expiredInvitationId = randomUUID();
          const expiredAt = new Date(Date.now() - 60_000);
          await client.db.insert(organizationInvitations).values({
            id: expiredInvitationId,
            organization_id: organizationId,
            invited_by_membership_id: created.membershipId,
            invitation_kind: "athlete",
            invited_profile_id: recipient.id,
            token_digest: createHash("sha256").update(expiredToken).digest("hex"),
            created_at: new Date(Date.now() - 120_000),
            expires_at: expiredAt,
          });
          await expect(
            recipientCaller.invitations.decline({ token: expiredToken }),
          ).rejects.toMatchObject({
            code: "FORBIDDEN",
          });

          const assertUnavailablePending = async (token: string, invitationId: string) => {
            await expect(recipientCaller.invitations.preview({ token })).rejects.toMatchObject({
              code: "FORBIDDEN",
            });
            await expect(recipientCaller.invitations.decline({ token })).rejects.toMatchObject({
              code: "FORBIDDEN",
            });
            await expect(
              client.db
                .select({ status: organizationInvitations.status })
                .from(organizationInvitations)
                .where(eq(organizationInvitations.id, invitationId)),
            ).resolves.toEqual([{ status: "pending" }]);
            await expect(
              client.db
                .select({ id: organizationAuditEvents.id })
                .from(organizationAuditEvents)
                .where(eq(organizationAuditEvents.resource_id, invitationId)),
            ).resolves.toEqual([]);
          };
          const createAuthorityFixture = async (label: string) => {
            const id = randomUUID();
            const result = await ownerCaller.create({
              organizationId: id,
              name: `${label} Peak`,
              slug: `${label}-${id}`,
              timezone: "UTC",
            });
            const invitation = await ownerCaller.invitations.create({
              organizationId: id,
              kind: "athlete",
              requestedRole: null,
              recipientProfileId: recipient.id,
              recipientEmail: null,
              expiresAt: new Date(Date.now() + 60_000),
            });
            return { id, invitation, membershipId: result.membershipId };
          };
          const suspendedOrganization = await createAuthorityFixture("suspended-response");
          await client.db
            .update(organizations)
            .set({ suspended_at: new Date() })
            .where(eq(organizations.id, suspendedOrganization.id));
          await assertUnavailablePending(
            suspendedOrganization.invitation.token,
            suspendedOrganization.invitation.invitationId,
          );
          const closedOrganization = await createAuthorityFixture("closed-response");
          await client.db
            .update(organizations)
            .set({ closed_at: new Date() })
            .where(eq(organizations.id, closedOrganization.id));
          await assertUnavailablePending(
            closedOrganization.invitation.token,
            closedOrganization.invitation.invitationId,
          );

          for (const state of ["ended", "suspended", "revoked"] as const) {
            const inviter = await person(client.db, `response-inviter-${state}`);
            const authority = await createAuthorityFixture(`inviter-${state}`);
            const inviterCaller = caller(client.db, inviter.id);
            const adminInvite = await ownerCaller.invitations.create({
              organizationId: authority.id,
              kind: "staff",
              requestedRole: "admin",
              recipientProfileId: inviter.id,
              recipientEmail: null,
              expiresAt: new Date(Date.now() + 60_000),
            });
            await inviterCaller.invitations.accept({ token: adminInvite.token });
            const target = await inviterCaller.invitations.create({
              organizationId: authority.id,
              kind: "athlete",
              requestedRole: null,
              recipientProfileId: recipient.id,
              recipientEmail: null,
              expiresAt: new Date(Date.now() + 60_000),
            });
            const [inviterMembership] = await client.db
              .select({ id: organizationMemberships.id })
              .from(organizationMemberships)
              .where(
                and(
                  eq(organizationMemberships.organization_id, authority.id),
                  eq(organizationMemberships.profile_id, inviter.id),
                ),
              );
            if (!inviterMembership) throw new Error("expected inviter membership");
            if (state === "revoked")
              await client.db
                .update(organizationMembershipRoleGrants)
                .set({ revoked_at: new Date() })
                .where(eq(organizationMembershipRoleGrants.membership_id, inviterMembership.id));
            else
              await client.db
                .update(organizationMemberships)
                .set(state === "ended" ? { ended_at: new Date() } : { suspended_at: new Date() })
                .where(eq(organizationMemberships.id, inviterMembership.id));
            await assertUnavailablePending(target.token, target.invitationId);
          }

          const raced = await ownerCaller.invitations.create({
            organizationId,
            kind: "athlete",
            requestedRole: null,
            recipientProfileId: recipient.id,
            recipientEmail: null,
            expiresAt: new Date(Date.now() + 60_000),
          });
          const results = await Promise.allSettled([
            acceptAthleteInvitation(recipientCaller, raced.token),
            recipientCaller.invitations.decline({ token: raced.token }),
          ]);
          expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
          const [terminal] = await client.db
            .select({ status: organizationInvitations.status })
            .from(organizationInvitations)
            .where(eq(organizationInvitations.id, raced.invitationId));
          expect(terminal?.status).toMatch(/^(accepted|declined)$/);
        } finally {
          await client.close();
        }
      },
    );
  }, 90_000);

  it("manages tenant-scoped organization groups without granting athletes private access", async () => {
    await withDisposableDatabase(
      ["--disposable", "--local"],
      "organization_groups",
      async (pool, url) => {
        await bootstrapSupabaseSchemas(pool);
        for (const migration of requireFreshBaseline().migrationPaths)
          await applySqlFile(pool, migration);
        const client = createDbClient({ url });
        try {
          const owner = await person(client.db, "group-owner");
          const coach = await person(client.db, "group-coach");
          const athlete = await person(client.db, "group-athlete");
          const outsider = await person(client.db, "group-outsider");
          const administrator = await person(client.db, "group-administrator");
          const futureAdministrator = await person(client.db, "group-future-administrator");
          const ownerCaller = caller(client.db, owner.id);
          const organizationId = randomUUID();
          const otherOrganizationId = randomUUID();
          const created = await ownerCaller.create({
            organizationId,
            name: "Groups",
            slug: `groups-${organizationId}`,
            timezone: "UTC",
          });
          await ownerCaller.create({
            organizationId: otherOrganizationId,
            name: "Other groups",
            slug: `other-groups-${otherOrganizationId}`,
            timezone: "UTC",
          });
          const coachMembershipId = randomUUID();
          await client.db.insert(organizationMemberships).values({
            id: coachMembershipId,
            organization_id: organizationId,
            profile_id: coach.id,
          });
          await client.db.insert(organizationMembershipRoleGrants).values({
            organization_id: organizationId,
            membership_id: coachMembershipId,
            role_key: "coach",
          });
          const administratorMembershipId = randomUUID();
          await client.db.insert(organizationMemberships).values({
            id: administratorMembershipId,
            organization_id: organizationId,
            profile_id: administrator.id,
          });
          await client.db.insert(organizationMembershipRoleGrants).values({
            organization_id: organizationId,
            membership_id: administratorMembershipId,
            role_key: "admin",
          });
          const futureMembershipId = randomUUID();
          await client.db.insert(organizationMemberships).values({
            id: futureMembershipId,
            organization_id: organizationId,
            profile_id: futureAdministrator.id,
            created_at: new Date(Date.now() + 60_000),
          });
          await client.db.insert(organizationMembershipRoleGrants).values({
            organization_id: organizationId,
            membership_id: futureMembershipId,
            role_key: "admin",
          });
          const engagementId = randomUUID();
          await client.db.insert(coachingEngagements).values({
            id: engagementId,
            organization_id: organizationId,
            athlete_profile_id: athlete.id,
          });
          const coachEngagementId = randomUUID();
          await client.db.insert(coachingEngagements).values({
            id: coachEngagementId,
            organization_id: organizationId,
            athlete_profile_id: coach.id,
          });
          const groupId = randomUUID();
          const secondGroupId = randomUUID();
          const foreignGroupId = randomUUID();
          await expect(
            ownerCaller.organizationGroups.create({
              organizationId,
              groupId,
              name: "Morning",
              description: "Intervals",
            }),
          ).resolves.toEqual({ id: groupId, status: "created" });
          await ownerCaller.organizationGroups.create({
            organizationId,
            groupId: secondGroupId,
            name: "Evening",
            description: null,
          });
          await ownerCaller.organizationGroups.create({
            organizationId: otherOrganizationId,
            groupId: foreignGroupId,
            name: "Foreign",
            description: null,
          });
          await expect(
            ownerCaller.organizationGroups.create({
              organizationId,
              groupId,
              name: "Morning",
              description: "Intervals",
            }),
          ).resolves.toEqual({ id: groupId, status: "created" });
          await expect(
            ownerCaller.organizationGroups.create({
              organizationId,
              groupId,
              name: "Changed",
              description: "Intervals",
            }),
          ).rejects.toMatchObject({ code: "CONFLICT" });
          await expect(
            caller(client.db, coach.id).organizationGroups.list({ organizationId }),
          ).rejects.toMatchObject({ code: "FORBIDDEN" });
          await expect(
            caller(client.db, administrator.id).organizationGroups.list({ organizationId }),
          ).resolves.toMatchObject({ items: expect.any(Array) });
          await expect(
            caller(client.db, futureAdministrator.id).organizationGroups.list({ organizationId }),
          ).rejects.toMatchObject({ code: "FORBIDDEN" });
          await expect(
            caller(client.db, futureAdministrator.id).organizationGroups.create({
              organizationId,
              groupId: randomUUID(),
              name: "Future",
              description: null,
            }),
          ).rejects.toMatchObject({ code: "FORBIDDEN" });
          await expect(
            caller(client.db, athlete.id).organizationGroups.get({ organizationId, groupId }),
          ).rejects.toMatchObject({ code: "FORBIDDEN" });
          await expect(
            caller(client.db, outsider.id).organizationGroups.list({ organizationId }),
          ).rejects.toMatchObject({ code: "FORBIDDEN" });
          await expect(
            ownerCaller.organizationGroups.get({ organizationId: otherOrganizationId, groupId }),
          ).rejects.toMatchObject({ code: "NOT_FOUND" });
          const firstGroupPage = await ownerCaller.organizationGroups.list({
            organizationId,
            limit: 1,
          });
          expect(firstGroupPage.nextCursor).not.toBeNull();
          const secondGroupPage = await ownerCaller.organizationGroups.list({
            organizationId,
            limit: 1,
            cursor: firstGroupPage.nextCursor,
          });
          expect(
            [...firstGroupPage.items, ...secondGroupPage.items].map((item) => item.id).sort(),
          ).toEqual([groupId, secondGroupId].sort());
          await expect(
            ownerCaller.organizationGroups.list({ organizationId, cursor: foreignGroupId }),
          ).rejects.toMatchObject({ code: "BAD_REQUEST" });
          const athleteLinkId = "00000000-0000-4000-8000-000000000001";
          await expect(
            ownerCaller.organizationGroups.athletes.add({
              organizationId,
              groupId,
              linkId: athleteLinkId,
              engagementId,
            }),
          ).resolves.toEqual({ id: athleteLinkId, status: "active" });
          const duplicateAthleteLinkId = randomUUID();
          await expect(
            ownerCaller.organizationGroups.athletes.add({
              organizationId,
              groupId,
              linkId: duplicateAthleteLinkId,
              engagementId,
            }),
          ).resolves.toEqual({ id: athleteLinkId, status: "active" });
          const coachLinkId = randomUUID();
          await expect(
            ownerCaller.organizationGroups.coaches.assign({
              organizationId,
              groupId,
              linkId: coachLinkId,
              membershipId: coachMembershipId,
            }),
          ).resolves.toEqual({ id: coachLinkId, status: "active" });
          await expect(
            ownerCaller.organizationGroups.athletes.list({
              organizationId,
              groupId: secondGroupId,
              cursor: athleteLinkId,
            }),
          ).rejects.toMatchObject({ code: "BAD_REQUEST" });
          await expect(
            ownerCaller.organizationGroups.coaches.list({
              organizationId,
              groupId: secondGroupId,
              cursor: coachLinkId,
            }),
          ).rejects.toMatchObject({ code: "BAD_REQUEST" });
          const overlapLinkId = "00000000-0000-4000-8000-000000000002";
          await expect(
            ownerCaller.organizationGroups.athletes.add({
              organizationId,
              groupId,
              linkId: overlapLinkId,
              engagementId: coachEngagementId,
            }),
          ).resolves.toEqual({ id: overlapLinkId, status: "active" });
          await expect(
            ownerCaller.organizationGroups.athletes.list({ organizationId, groupId }),
          ).resolves.toEqual(
            expect.objectContaining({
              items: expect.arrayContaining([
                { id: athleteLinkId, engagementId },
                { id: overlapLinkId, engagementId: coachEngagementId },
              ]),
            }),
          );
          const firstAthletePage = await ownerCaller.organizationGroups.athletes.list({
            organizationId,
            groupId,
            limit: 1,
          });
          expect(firstAthletePage.nextCursor).not.toBeNull();
          const secondAthletePage = await ownerCaller.organizationGroups.athletes.list({
            organizationId,
            groupId,
            limit: 1,
            cursor: firstAthletePage.nextCursor,
          });
          expect(
            [...firstAthletePage.items, ...secondAthletePage.items].map((item) => item.id).sort(),
          ).toEqual([athleteLinkId, overlapLinkId].sort());
          await expect(
            ownerCaller.organizationGroups.coaches.list({ organizationId, groupId }),
          ).resolves.toMatchObject({
            items: [{ id: coachLinkId, membershipId: coachMembershipId }],
          });
          await expect(
            ownerCaller.organizationGroups.athletes.remove({
              organizationId,
              groupId,
              linkId: athleteLinkId,
            }),
          ).resolves.toEqual({ id: athleteLinkId, status: "ended" });
          await expect(
            ownerCaller.organizationGroups.athletes.list({
              organizationId,
              groupId,
              cursor: athleteLinkId,
            }),
          ).resolves.toMatchObject({ items: [{ id: overlapLinkId }] });
          await expect(
            ownerCaller.organizationGroups.athletes.remove({
              organizationId,
              groupId,
              linkId: athleteLinkId,
            }),
          ).resolves.toEqual({ id: athleteLinkId, status: "ended" });
          await expect(
            ownerCaller.organizationGroups.archive({ organizationId, groupId }),
          ).resolves.toEqual({ id: groupId, status: "archived" });
          await expect(
            ownerCaller.organizationGroups.archive({ organizationId, groupId }),
          ).resolves.toEqual({ id: groupId, status: "archived" });
          await expect(
            ownerCaller.organizationGroups.coaches.remove({
              organizationId,
              groupId,
              linkId: coachLinkId,
            }),
          ).rejects.toMatchObject({ code: "NOT_FOUND" });
          await expect(
            ownerCaller.organizationGroups.athletes.list({ organizationId, groupId }),
          ).rejects.toMatchObject({ code: "NOT_FOUND" });
          await expect(
            client.db.select({ id: organizationGroupAthletes.id }).from(organizationGroupAthletes),
          ).resolves.toHaveLength(2);
          await expect(
            client.db
              .select({ id: organizationGroupCoachAssignments.id })
              .from(organizationGroupCoachAssignments),
          ).resolves.toHaveLength(1);
          expect(created.membershipId).toBeDefined();
        } finally {
          await client.close();
        }
      },
    );
  }, 90_000);

  it("discovers only safe invitation summaries with scoped keyset cursors", async () => {
    await withDisposableDatabase(
      ["--disposable", "--local"],
      "organization_invitation_discovery",
      async (pool, url) => {
        await bootstrapSupabaseSchemas(pool);
        for (const migration of requireFreshBaseline().migrationPaths)
          await applySqlFile(pool, migration);
        const client = createDbClient({ url });
        try {
          const owner = await person(client.db, "discovery-owner");
          const recipient = await person(client.db, "discovery-recipient");
          const unverified = await person(client.db, "discovery-unverified", false);
          const outsider = await person(client.db, "discovery-outsider");
          const administrator = await person(client.db, "discovery-administrator");
          const organizationId = randomUUID();
          const otherOrganizationId = randomUUID();
          const ownerCaller = caller(client.db, owner.id);
          const created = await ownerCaller.create({
            organizationId,
            name: "Invitation discovery",
            slug: `invitation-discovery-${organizationId}`,
            timezone: "UTC",
          });
          const administratorMembershipId = randomUUID();
          await client.db.insert(organizationMemberships).values({
            id: administratorMembershipId,
            organization_id: organizationId,
            profile_id: administrator.id,
          });
          await client.db.insert(organizationMembershipRoleGrants).values({
            organization_id: organizationId,
            membership_id: administratorMembershipId,
            role_key: "admin",
          });
          await ownerCaller.create({
            organizationId: otherOrganizationId,
            name: "Other invitation discovery",
            slug: `other-invitation-discovery-${otherOrganizationId}`,
            timezone: "UTC",
          });
          const direct = await ownerCaller.invitations.create({
            organizationId,
            kind: "staff",
            requestedRole: "coach",
            recipientProfileId: recipient.id,
            recipientEmail: null,
            expiresAt: new Date(Date.now() + 60_000),
          });
          const byVerifiedEmail = await ownerCaller.invitations.create({
            organizationId,
            kind: "athlete",
            requestedRole: null,
            recipientProfileId: null,
            recipientEmail: recipient.email.toUpperCase(),
            expiresAt: new Date(Date.now() + 60_000),
          });
          const expiredInvitationId = randomUUID();
          const expiredCreatedAt = new Date(Date.now() - 120_000);
          const expiredAt = new Date(Date.now() - 60_000);
          await client.db.insert(organizationInvitations).values({
            id: expiredInvitationId,
            organization_id: organizationId,
            invited_by_membership_id: created.membershipId,
            invitation_kind: "athlete",
            invited_profile_id: recipient.id,
            token_digest: `expired-${randomUUID()}`,
            expires_at: expiredAt,
            created_at: expiredCreatedAt,
          });
          const precisionInvitationIds = [randomUUID(), randomUUID(), randomUUID()];
          await client.db.insert(organizationInvitations).values([
            {
              id: precisionInvitationIds[0],
              organization_id: organizationId,
              invited_by_membership_id: created.membershipId,
              invitation_kind: "athlete",
              invited_profile_id: recipient.id,
              token_digest: `precision-${randomUUID()}`,
              expires_at: sql`'2020-01-01T00:00:00.124000Z'::timestamptz`,
              created_at: sql`'2020-01-01T00:00:00.123456Z'::timestamptz`,
            },
            {
              id: precisionInvitationIds[1],
              organization_id: organizationId,
              invited_by_membership_id: created.membershipId,
              invitation_kind: "athlete",
              invited_profile_id: recipient.id,
              token_digest: `precision-${randomUUID()}`,
              expires_at: sql`'2020-01-01T00:00:00.124000Z'::timestamptz`,
              created_at: sql`'2020-01-01T00:00:00.123456Z'::timestamptz`,
            },
            {
              id: precisionInvitationIds[2],
              organization_id: organizationId,
              invited_by_membership_id: created.membershipId,
              invitation_kind: "athlete",
              invited_profile_id: recipient.id,
              token_digest: `precision-${randomUUID()}`,
              expires_at: sql`'2020-01-01T00:00:00.124000Z'::timestamptz`,
              created_at: sql`'2020-01-01T00:00:00.123789Z'::timestamptz`,
            },
          ]);
          const revoked = await ownerCaller.invitations.create({
            organizationId,
            kind: "athlete",
            requestedRole: null,
            recipientProfileId: recipient.id,
            recipientEmail: null,
            expiresAt: new Date(Date.now() + 60_000),
          });
          const unverifiedInvitation = await ownerCaller.invitations.create({
            organizationId,
            kind: "athlete",
            requestedRole: null,
            recipientProfileId: unverified.id,
            recipientEmail: null,
            expiresAt: new Date(Date.now() + 60_000),
          });
          await ownerCaller.invitations.revoke({
            organizationId,
            invitationId: revoked.invitationId,
          });
          await caller(client.db, recipient.id).invitations.accept({ token: direct.token });

          const firstAdminPage = await ownerCaller.invitations.listForOrganization({
            organizationId,
            limit: 1,
          });
          expect(firstAdminPage).toMatchObject({ hasMore: true, items: [{ organizationId }] });
          expect(firstAdminPage.nextCursor).toEqual(expect.any(String));
          const adminInvitationIds = firstAdminPage.items.map((item) => item.invitationId);
          let cursor = firstAdminPage.nextCursor;
          while (cursor) {
            const page = await ownerCaller.invitations.listForOrganization({
              organizationId,
              limit: 1,
              cursor,
            });
            for (const item of page.items) adminInvitationIds.push(item.invitationId);
            cursor = page.nextCursor;
          }
          expect(new Set(adminInvitationIds).size).toBe(adminInvitationIds.length);
          expect(new Set(adminInvitationIds)).toEqual(
            new Set([
              direct.invitationId,
              byVerifiedEmail.invitationId,
              expiredInvitationId,
              revoked.invitationId,
              unverifiedInvitation.invitationId,
              ...precisionInvitationIds,
            ]),
          );
          const allAdminItems = await ownerCaller.invitations.listForOrganization({
            organizationId,
          });
          await expect(
            caller(client.db, administrator.id).invitations.listForOrganization({ organizationId }),
          ).resolves.toMatchObject({ items: expect.any(Array) });
          expect(
            allAdminItems.items.find((item) => item.invitationId === expiredInvitationId),
          ).toMatchObject({
            status: "expired",
          });
          await expect(
            client.db
              .select({ status: organizationInvitations.status })
              .from(organizationInvitations)
              .where(eq(organizationInvitations.id, expiredInvitationId)),
          ).resolves.toEqual([{ status: "pending" }]);
          for (const item of allAdminItems.items) {
            expect(Object.keys(item).sort()).toEqual([
              "createdAt",
              "expiresAt",
              "invitationId",
              "kind",
              "organizationId",
              "requestedRole",
              "status",
            ]);
            expect(JSON.stringify(item)).not.toContain(recipient.email);
            expect(JSON.stringify(item)).not.toContain(direct.token);
          }
          await expect(
            caller(client.db, outsider.id).invitations.listForOrganization({ organizationId }),
          ).rejects.toMatchObject({ code: "FORBIDDEN" });
          await client.db
            .update(organizationMembershipRoleGrants)
            .set({ revoked_at: new Date() })
            .where(eq(organizationMembershipRoleGrants.membership_id, administratorMembershipId));
          await expect(
            caller(client.db, administrator.id).invitations.listForOrganization({ organizationId }),
          ).rejects.toMatchObject({ code: "FORBIDDEN" });
          await expect(
            ownerCaller.invitations.listForOrganization({
              organizationId: otherOrganizationId,
              cursor: firstAdminPage.nextCursor,
            }),
          ).rejects.toMatchObject({ code: "BAD_REQUEST" });

          const recipientItems = [] as (typeof firstAdminPage.items)[number][];
          let recipientCursor: string | null = null;
          do {
            const page = await caller(client.db, recipient.id).invitations.listMine({
              limit: 1,
              cursor: recipientCursor,
            });
            recipientItems.push(...page.items);
            recipientCursor = page.nextCursor;
          } while (recipientCursor);
          expect(new Set(recipientItems.map((item) => item.invitationId)).size).toBe(
            recipientItems.length,
          );
          expect(recipientItems.map((item) => item.invitationId)).toEqual(
            expect.arrayContaining([
              direct.invitationId,
              byVerifiedEmail.invitationId,
              expiredInvitationId,
              revoked.invitationId,
              ...precisionInvitationIds,
            ]),
          );
          expect(
            recipientItems.find((item) => item.invitationId === direct.invitationId),
          ).toMatchObject({
            status: "accepted",
          });
          expect(
            recipientItems.find((item) => item.invitationId === revoked.invitationId),
          ).toMatchObject({
            status: "revoked",
          });
          await expect(caller(client.db, unverified.id).invitations.listMine({})).resolves.toEqual({
            items: [],
            hasMore: false,
            nextCursor: null,
          });
          await expect(
            caller(client.db, recipient.id).invitations.listMine({
              cursor: firstAdminPage.nextCursor,
            }),
          ).rejects.toMatchObject({ code: "BAD_REQUEST" });
        } finally {
          await client.close();
        }
      },
    );
  }, 90_000);
});
