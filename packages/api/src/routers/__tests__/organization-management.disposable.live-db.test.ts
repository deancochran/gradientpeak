import { randomUUID } from "node:crypto";
import { createDbClient, type DrizzleDbClient } from "@repo/db/client";
import {
  athleteDataSharingConsents,
  coachingEngagements,
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
          await recipientCaller.invitations.accept({ token: athlete.token });
          await recipientCaller.invitations.accept({ token: athlete.token });
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
          expect(consents).toHaveLength(0);

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
});
